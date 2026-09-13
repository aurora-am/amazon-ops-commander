/* Phase 4 模拟业务自测 —— 店铺总览（首页）重构验收
 * 纯前端逻辑自测：用 vm 加载真实 ui.js + mod-command.js，注入 mock DOM / echarts / DB。
 * 覆盖 5 类场景：正常 / 无环比空数据 / 全部告警清空 / 大量混合告警 / 活动截止倒计时过期。
 */
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const ROOT=__dirname;
const uiSrc=fs.readFileSync(path.join(ROOT,'js/ui.js'),'utf8');
const modSrc=fs.readFileSync(path.join(ROOT,'js/mod-command.js'),'utf8');

// ---------- 最小 DOM mock ----------
class El{
  constructor(id){this.id=id;this._html='';this.style={};this.dataset={};
    this.classList={add(){},remove(){},contains(){return false}};}
  set innerHTML(v){this._html=v;} get innerHTML(){return this._html;}
  set onclick(v){} get onclick(){return null;}
  set onchange(v){}
  querySelectorAll(){return [];} querySelector(){return null;}
  appendChild(){} remove(){} focus(){}
}
const els={};
const documentMock={
  getElementById(id){return els[id]||(els[id]=new El(id));},
  createElement(){return new El('created');},
  querySelector(){return null;},
  body:new El('body')
};

// echarts stub（记录 setOption 调用次数，验证图表渲染/空占位分支）
let chartCalls=0;
const echartsMock={init(){return {setOption(){chartCalls++;},dispose(){}};}};

const AppMock={filters:{},state:{},inScope:()=>true,go(){},refresh(){}};

// 稳定 DB 引用（anomalies/dashboard 运行时再读 .data）
const dbMock={data:{},all(t){return Promise.resolve(this.data[t]||[]);},
  get(){return Promise.resolve(null);},put(){return Promise.resolve();},
  del(){return Promise.resolve();},bulk(){return Promise.resolve();}};

const sandbox={window:{},document:documentMock,console,
  echarts:echartsMock,setTimeout:()=>{},App:AppMock,DB:dbMock,
  Promise,Date,Math,Object,Array,String,Number,JSON,RegExp,isFinite,parseFloat,parseInt};
sandbox.window=Object.assign(sandbox.window,{document:documentMock,echarts:echartsMock,DB:dbMock,App:AppMock});
vm.createContext(sandbox);
vm.runInContext(uiSrc,sandbox);          // 定义 window.UI
vm.runInContext(modSrc,sandbox);         // 定义 window.Pages / window.Anomalies
const win=sandbox.window;
const U=win.UI, A=win.Anomalies, P=win.Pages;

// ---------- 数据构造工具 ----------
const TODAY=U.today();
const add=(n)=>U.addDays(TODAY,n);
function mkProduct(id,storeId,sku,price,margin){
  const total=price*(1-margin/100), adCost=price*0.20, nonAd=total-adCost;
  const commission=price*0.15, firstLeg=price*0.02, fba=price*0.06, storage=price*0.01;
  const retCost=(price+firstLeg+fba)*0.05;
  const purchase=Math.max(1,nonAd-(firstLeg+fba+commission+storage+retCost));
  return {id,storeId,sku,price,cost:{purchase,firstLeg,fbaFee:fba,commission:0.15,storage,returnLoss:0.05,targetAcos:0.20}};
}
const stores=[{id:1,name:'A店铺',site:'US'},{id:2,name:'B店铺',site:'EU'},{id:3,name:'C店铺',site:'JP'}];

// ---------- 断言框架 ----------
let pass=0,fail=0,details=[];
function ok(name,cond,extra){ if(cond){pass++;details.push('  ✅ '+name);} else {fail++;details.push('  ❌ '+name+(extra?(' → '+extra):''));} }

// ---------- 全局排序不变量 ----------
const order={red:0,yellow:1,gray:2};
const typeOrder={合规:0,账户:1,库存:2,利润:3,广告:4,节点:5};
function sortedInvariant(list){
  // 严格镜像 anomalies() 的真实比较器：
  // (level 升序) || (typeOrder 升序) || (同类型内 countdown 升序，null 排末尾)
  const lvl=a=>order[a.level], ty=a=>typeOrder[a.type], cd=a=>a.countdown==null?Infinity:a.countdown;
  for(let i=1;i<list.length;i++){
    const a=list[i-1],b=list[i];
    if(lvl(a)!==lvl(b)){ if(lvl(a)>lvl(b)) return false; continue; }
    if(ty(a)!==ty(b)){ if(ty(a)>ty(b)) return false; continue; }
    if(cd(a)>cd(b)) return false; // 同类型内：countdown 升序（null=Infinity 排最后）
  }
  return true;
}
function expectSeverity(a){
  if(a.level==='red') return ['合规','账户','库存'].includes(a.type)?'紧急':'高';
  return '中';
}

// ---------- 场景执行 ----------
async function run(){
  const root=new El('root');

  // ===== 场景1：正常数据 =====
  dbMock.data={
    stores,
    products:[mkProduct(1,1,'SKU-A1',100,12),mkProduct(2,1,'SKU-A2',80,20),
              mkProduct(3,2,'SKU-B1',120,16),mkProduct(4,3,'SKU-C1',90,19)],
    inventory:[{productId:1,dailySalesAvg:5,fbaQty:125,inboundQty:0,reserveQty:0,leadDays:10,aging180:0},
               {productId:3,dailySalesAvg:4,fbaQty:100,inboundQty:0,reserveQty:0,leadDays:12,aging180:0}],
    ads:[{productId:1,name:'广告A1',sales:200,spend:50},{productId:3,name:'广告B1',sales:300,spend:70}],
    compliance:[{storeId:1,item:'欧代',expireDate:add(60),reminderDays:30},
                {storeId:2,item:'FCC',expireDate:add(45),reminderDays:30}],
    nodes:[{id:1,site:'US',year:2026,eventName:'Prime Day',type:'开卖',deadline:add(40),done:false,linkedModule:'stores'},
           {id:2,site:'EU',year:2026,eventName:'夏促',type:'入仓',deadline:add(50),done:false,linkedModule:'stores'}],
    account_health:[{storeId:1,ahr:350,policyWarnings:0,suppressed:0},
                    {storeId:2,ahr:360,policyWarnings:0,suppressed:0},
                    {storeId:3,ahr:340,policyWarnings:0,suppressed:0}],
    kpi_daily:Array.from({length:20},(_,i)=>({date:add(-i),storeId:1,productId:1,sales:300,orders:6,adSpend:60,adSales:240,sessions:120,refunds:1})),
    tasks:[]
  };
  let anoms=await A();
  let cnt={紧急:0,高:0,中:0}; anoms.forEach(a=>cnt[U.severityOf(a)]++);
  await P.dashboard(root);
  const box=els['anomBox'];
  ok('S1 正常·告警引擎返回数组',Array.isArray(anoms));
  ok('S1 正常·仅 2 条轻度黄灯（远期节点不再污染）',anoms.length===2,'len='+anoms.length);
  ok('S1 正常·排序不变量',sortedInvariant(anoms),JSON.stringify(anoms.map(a=>a.level+a.type)));
  ok('S1 正常·严重度映射自洽',anoms.every(a=>U.severityOf(a)===expectSeverity(a)));
  ok('S1 正常·异常列表渲染 stat-bar',box.innerHTML.includes('stat-bar'));
  ok('S1 正常·异常列表渲染 alert-item',box.innerHTML.includes('alert-item'));
  ok('S1 正常·stat-bar 合计 2',box.innerHTML.includes('合计 2'));
  ok('S1 正常·KPI 含销售额',root.innerHTML.includes('销售额'));
  ok('S1 正常·图表已渲染(setOption被调用)',chartCalls>0);

  // ===== 场景2：无环比空数据（当前区间无 KPI，但商品/告警数据在）=====
  chartCalls=0;
  dbMock.data={
    stores,
    products:[mkProduct(1,1,'SKU-A1',100,12),mkProduct(3,2,'SKU-B1',120,18)], // 1 个利润黄
    inventory:[{productId:1,dailySalesAvg:5,fbaQty:120,inboundQty:0,reserveQty:0,leadDays:10,aging180:0}], // 覆盖24天→黄
    ads:[{productId:1,name:'广告A1',sales:200,spend:50}],
    compliance:[{storeId:1,item:'欧代',expireDate:add(60),reminderDays:30}],
    nodes:[{id:1,site:'US',year:2026,eventName:'Prime Day',type:'开卖',deadline:add(40),done:false}],
    account_health:[{storeId:1,ahr:350,policyWarnings:0,suppressed:0}],
    kpi_daily:[], // 当前区间无销售数据
    tasks:[]
  };
  await P.dashboard(root);
  ok('S2 空数据·KPI 环比显示 —（无上期）',root.innerHTML.includes('环比 —'));
  ok('S2 空数据·销售趋势图走空占位',els['cSales'].innerHTML.includes('empty'));
  ok('S2 空数据·转化漏斗走空占位',els['cFunnel'].innerHTML.includes('empty'));
  ok('S2 空数据·销售构成走空占位',els['cPie'].innerHTML.includes('empty'));
  // 同时告警列表仍正常（证明空状态是按组件隔离的）
  ok('S2 空数据·告警列表仍渲染',els['anomBox'].innerHTML.includes('alert-item'));

  // ===== 场景3：全部告警清空空状态 =====
  dbMock.data={
    stores,
    products:[mkProduct(1,1,'SKU-A1',100,18),mkProduct(3,2,'SKU-B1',120,20)],
    inventory:[{productId:1,dailySalesAvg:5,fbaQty:600,inboundQty:0,reserveQty:0,leadDays:10,aging180:0},
               {productId:3,dailySalesAvg:4,fbaQty:500,inboundQty:0,reserveQty:0,leadDays:12,aging180:0}],
    ads:[{productId:1,name:'广告A1',sales:200,spend:50},{productId:3,name:'广告B1',sales:300,spend:70}],
    compliance:[{storeId:1,item:'欧代',expireDate:add(60),reminderDays:30},
                {storeId:2,item:'FCC',expireDate:add(80),reminderDays:30}],
    nodes:[{id:1,site:'US',year:2026,eventName:'Prime Day',type:'开卖',deadline:add(40),done:false}],
    account_health:[{storeId:1,ahr:350,policyWarnings:0,suppressed:0},
                    {storeId:2,ahr:360,policyWarnings:0,suppressed:0},
                    {storeId:3,ahr:340,policyWarnings:0,suppressed:0}],
    kpi_daily:Array.from({length:20},(_,i)=>({date:add(-i),storeId:1,productId:1,sales:300,orders:6,adSpend:60,adSales:240,sessions:120,refunds:1})),
    tasks:[]
  };
  anoms=await A();
  if(anoms.length!==0) console.log('  [DEBUG S3] stray anomalies =',JSON.stringify(anoms.map(a=>({lv:a.level,ty:a.type,tx:a.text,cd:a.countdown}))));
  await P.dashboard(root);
  ok('S3 清空·告警引擎为空',anoms.length===0,'len='+anoms.length);
  ok('S3 清空·异常框显示无异常空态',els['anomBox'].innerHTML.includes('当前范围内无异常'));
  ok('S3 清空·异常框不含 alert-item',!els['anomBox'].innerHTML.includes('alert-item'));
  ok('S3 清空·异常框不含 stat-bar',!els['anomBox'].innerHTML.includes('stat-bar'));

  // ===== 场景4：大量混合告警 =====
  dbMock.data={
    stores,
    products:[mkProduct(1,1,'SKU-A1',100,4),mkProduct(2,1,'SKU-A2',100,12),  // 利润红/黄
              mkProduct(3,2,'SKU-B1',120,20),mkProduct(4,3,'SKU-C1',90,18)],
    inventory:[{productId:1,dailySalesAvg:20,fbaQty:100,inboundQty:0,reserveQty:0,leadDays:8,aging180:0}, // 覆盖5天→红
               {productId:2,dailySalesAvg:10,fbaQty:200,inboundQty:0,reserveQty:0,leadDays:8,aging180:0}, // 覆盖20天→黄
               {productId:3,dailySalesAvg:5,fbaQty:50,inboundQty:0,reserveQty:0,leadDays:6,aging180:30},  // 红+库龄>180
               {productId:4,dailySalesAvg:8,fbaQty:400,inboundQty:0,reserveQty:0,leadDays:6,aging180:0}],
    ads:[{productId:1,name:'广告A1',sales:200,spend:120},  // acos60 > be → 红
         {productId:4,name:'广告C1',sales:0,spend:30}],     // 有花费无产出 → 黄
    compliance:[{storeId:1,item:'欧代',expireDate:add(-5),reminderDays:30},  // 已过期→红
                {storeId:1,item:'WEEE',expireDate:add(5),reminderDays:30},   // 5天内→红
                {storeId:2,item:'FCC',expireDate:add(20),reminderDays:30},   // 20天内→黄
                {storeId:2,item:'UL',expireDate:add(60),reminderDays:30}],    // 安全
    nodes:[{id:1,site:'US',year:2026,eventName:'Prime Day',type:'开卖',deadline:add(3),done:false}, // 红
           {id:2,site:'EU',year:2026,eventName:'夏促',type:'入仓',deadline:add(20),done:false},// 黄
           {id:3,site:'JP',year:2026,eventName:'旧活动',type:'提报',deadline:add(-12),done:false}, // 逾期→灰
           {id:4,site:'US',year:2026,eventName:'已完成',type:'开卖',deadline:add(-2),done:true}], // done 不进
    account_health:[{storeId:1,ahr:180,policyWarnings:0,suppressed:1},  // 账户红(ahr<200)+停售红
                    {storeId:2,ahr:250,policyWarnings:3,suppressed:0},  // 账户黄+政策警告黄
                    {storeId:3,ahr:340,policyWarnings:0,suppressed:0}],
    kpi_daily:Array.from({length:20},(_,i)=>({date:add(-i),storeId:1,productId:1,sales:300,orders:6,adSpend:60,adSales:240,sessions:120,refunds:1})),
    tasks:[]
  };
  anoms=await A();
  cnt={紧急:0,高:0,中:0}; anoms.forEach(a=>cnt[U.severityOf(a)]++);
  await P.dashboard(root);
  // 铁律：red 内顺序
  const reds=anoms.filter(a=>a.level==='red');
  const redTypeSeq=reds.map(a=>a.type);
  const ironOK=redTypeSeq.join('>').replace(/>+/g,'>');
  ok('S4 混合·全局排序不变量',sortedInvariant(anoms),redTypeSeq.join(','));
  ok('S4 混合·铁律 red 内 type 顺序(合规>账户>库存>利润>广告>节点)',
     redTypeSeq.every((t,i)=>i===0||typeOrder[t]>=typeOrder[redTypeSeq[i-1]]),redTypeSeq.join(','));
  ok('S4 混合·red 首条为合规',reds[0]&&reds[0].type==='合规',redTypeSeq[0]);
  ok('S4 混合·red 末条为节点',reds[reds.length-1]&&reds[reds.length-1].type==='节点',redTypeSeq[redTypeSeq.length-1]);
  // 严重度计数
  const totalCnt=anoms.length;
  ok('S4 混合·stat-bar 合计==list.length',box.innerHTML.includes('合计 '+totalCnt),'合计='+totalCnt+' list='+anoms.length);
  ok('S4 混合·stat-bar 紧急计数==引擎统计',box.innerHTML.includes('紧急 '+cnt['紧急']));
  ok('S4 混合·过期节点呈灰且 expired',anoms.some(a=>a.type==='节点'&&a.level==='gray'&&a.expired===true&&a.countdown<0));
  ok('S4 混合·alertItem 含已过期文案',box.innerHTML.includes('已过期'));
  ok('S4 混合·严重度明细列存在(sevTag)',box.innerHTML.includes('sb-urgent'));

  // ===== 场景5：活动截止倒计时过期（聚焦倒计时渲染）=====
  dbMock.data={
    stores,
    products:[mkProduct(1,1,'SKU-A1',100,18)],
    inventory:[{productId:1,dailySalesAvg:5,fbaQty:600,inboundQty:0,reserveQty:0,leadDays:10,aging180:0}],
    ads:[{productId:1,name:'广告A1',sales:200,spend:50}],
    compliance:[{storeId:1,item:'欧代',expireDate:add(-3),reminderDays:30}], // 过期合规
    nodes:[{id:1,site:'US',year:2026,eventName:'Prime Day',type:'开卖',deadline:add(5),done:false}, // 剩5天→红倒计时
           {id:2,site:'EU',year:2026,eventName:'旧活动',type:'提报',deadline:add(-10),done:false}], // 逾期10天→灰倒计时
    account_health:[{storeId:1,ahr:350,policyWarnings:0,suppressed:0}],
    kpi_daily:Array.from({length:20},(_,i)=>({date:add(-i),storeId:1,productId:1,sales:300,orders:6,adSpend:60,adSales:240,sessions:120,refunds:1})),
    tasks:[]
  };
  anoms=await A();
  await P.dashboard(root);
  const expNode=anoms.find(a=>a.type==='节点'&&a.expired);
  const actNode=anoms.find(a=>a.type==='节点'&&!a.expired&&a.countdown>0);
  ok('S5 倒计时·存在逾期节点(灰)',!!expNode,JSON.stringify(anoms.filter(a=>a.type==='节点').map(a=>[a.level,a.expired,a.countdown])));
  ok('S5 倒计时·逾期节点文案「已过期 X 天」',expNode&&box.innerHTML.includes('已过期 '+(-expNode.countdown)+' 天'));
  ok('S5 倒计时·活跃节点文案「剩 X 天」',actNode&&box.innerHTML.includes('剩 '+actNode.countdown+' 天'));
  ok('S5 倒计时·过期项带 expired class',box.innerHTML.includes('expired'));

  // ---------- 汇总 ----------
  console.log('\n================ Phase 4 自测结果 ================');
  console.log(details.join('\n'));
  console.log('------------------------------------------------');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail===0) console.log('PHASE4 OK ✅'); else console.log('PHASE4 HAS FAILURES ❌');
  process.exit(fail===0?0:1);
}
run().catch(e=>{console.error('HARNESS ERROR',e);process.exit(2);});
