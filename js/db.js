(function(){
  const DB_NAME='commander_db';
  const DB_VER=5;
  const TABLES=['stores','products','kpi_daily','listings','reviews','ads','searchterms',
    'inventory','ship_plans','returns','claims','promos','compliance','nodes','tasks',
    'diagnosis_log','competitors','keywords','candidates','patrol','settings','snapshots',
    'newlaunch','purchase','logistics','qc','appeal','reply','influencer','finance',
    'kpi_score','team','toolbox','account_health',
    'project_progress','market_analysis','aba_keywords','research',
    'competitor_basic','competitor_multi','competitor_plan',
    'profit_check','profit_metrics','product_analysis','dev_plan','fba_rate'];

  let _db=null;
  function open(){
    return new Promise((res,rej)=>{
      if(_db) return res(_db);
      const rq=indexedDB.open(DB_NAME,DB_VER);
      rq.onupgradeneeded=e=>{
        const db=e.target.result;
        TABLES.forEach(t=>{
          if(!db.objectStoreNames.contains(t)){
            const kp=(t==='settings')?'key':'id';
            db.createObjectStore(t,{keyPath:kp,autoIncrement:(kp==='id')});
          }
        });
      };
      rq.onsuccess=e=>{_db=e.target.result;res(_db)};
      rq.onerror=e=>rej(e);
    });
  }
  function tx(store,mode){
    return open().then(db=>db.transaction(store,mode).objectStore(store));
  }
  function req(r){return new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}

  const DB={
    all:store=>tx(store,'readonly').then(os=>req(os.getAll())),
    get:(store,id)=>tx(store,'readonly').then(os=>req(os.get(id))),
    put:(store,obj)=>{
      // B4 防御：拒绝写入含刷单/测评中介语义字段的对象（仅校验键名，不影响正常业务字段）
      if(obj&&typeof obj==='object'&&!Array.isArray(obj)){
        const bad=Object.keys(obj).some(k=>/shua|刷单|测评中介/.test(k));
        if(bad){
          console.warn('[DB] 拒绝写入含刷单/测评中介字段的对象到 store=',store,obj);
          if(window.UI&&window.UI.toast) window.UI.toast('检测到非法字段（刷单/测评），已拒绝写入');
          return Promise.resolve(null);
        }
      }
      return tx(store,'readwrite').then(os=>req(os.put(obj)));
    },
    del:(store,id)=>tx(store,'readwrite').then(os=>req(os.delete(id))),
    bulk:(store,arr)=>tx(store,'readwrite').then(os=>{
      arr.forEach(o=>os.put(o)); return new Promise(r=>{os.transaction.oncomplete=()=>r(true)});
    }),
    clear:store=>tx(store,'readwrite').then(os=>req(os.clear())),
    clearAll:()=>Promise.all(TABLES.map(t=>DB.clear(t))),
    count:store=>tx(store,'readonly').then(os=>req(os.count())),
    setSetting:(k,v)=>DB.put('settings',{key:k,value:v}),
    getSetting:(k,d)=>DB.get('settings',k).then(r=>r?r.value:d),
    async exportAll(){
      const out={_app:'commander',_ver:1,_at:new Date().toISOString(),data:{}};
      for(const t of TABLES){ out.data[t]=await DB.all(t); }
      return out;
    },
    async importAll(obj,mode){
      if(!obj||!obj.data) throw new Error('文件格式不正确');
      for(const t of TABLES){
        const rows=obj.data[t]||[];
        if(mode==='replace') await DB.clear(t);
        await DB.bulk(t,rows);
      }
      return true;
    }
  };

  /* ---------- 旺季节点库（三站点） ---------- */
  const NODE_TPL={
    US:[
      {n:'春季会员日',d:'03-25',off:{提报:-45,早鸟:-35,入仓:-21,开卖:0}},
      {n:'Prime Day',d:'07-15',off:{提报:-60,早鸟:-45,入仓:-30,开卖:0}},
      {n:'秋季会员日',d:'10-10',off:{提报:-50,早鸟:-40,入仓:-25,开卖:0}},
      {n:'黑五网一',d:'11-28',off:{提报:-70,早鸟:-55,入仓:-35,开卖:0}},
      {n:'圣诞季',d:'12-18',off:{提报:-40,早鸟:-30,入仓:-25,开卖:0}}
    ],
    EU:[
      {n:'春季促销',d:'04-01',off:{提报:-45,早鸟:-35,入仓:-21,开卖:0}},
      {n:'Prime Day',d:'07-15',off:{提报:-60,早鸟:-45,入仓:-30,开卖:0}},
      {n:'黑五网一',d:'11-28',off:{提报:-70,早鸟:-55,入仓:-35,开卖:0}},
      {n:'圣诞季',d:'12-18',off:{提报:-40,早鸟:-30,入仓:-25,开卖:0}}
    ],
    JP:[
      {n:'Prime Day',d:'07-15',off:{提报:-60,早鸟:-45,入仓:-30,开卖:0}},
      {n:'秋のセール',d:'10-01',off:{提报:-45,早鸟:-35,入仓:-22,开卖:0}},
      {n:'年末商戦',d:'12-20',off:{提报:-40,早鸟:-30,入仓:-25,开卖:0}},
      {n:'初売り',d:'01-02',off:{提报:-50,早鸟:-40,入仓:-30,开卖:0}}
    ]
  };
  function genNodes(site,year){
    const out=[];
    (NODE_TPL[site]||[]).forEach(ev=>{
      const base=new Date(`${year}-${ev.d}T00:00:00`);
      if(isNaN(base)) return;
      Object.keys(ev.off).forEach(type=>{
        const dt=new Date(base);
        dt.setDate(dt.getDate()+ev.off[type]);
        out.push({
          site,year,eventName:ev.n,type,
          deadline:dt.toISOString().slice(0,10),
          actionGuide:NODE_GUIDE[type],
          linkedModule:NODE_LINK[type],
          done:false
        });
      });
    });
    return out;
  }
  const NODE_GUIDE={
    提报:'确认提报资格与价格要求，在后台完成 Deal 提报；检查库存是否覆盖预估销量',
    早鸟:'核对提报状态与活动价格，准备主图/A+/Coupon，锁定价盘',
    入仓:'按备货倒推完成发货入仓，避免旺季拥堵；核对 FBA 接收差异',
    开卖:'活动当日监控：价格、库存、广告预算、Buy Box、差评与绩效'
  };
  const NODE_LINK={提报:'stores',早鸟:'listing',入仓:'inventory',开卖:'ads'};

  /* ---------- 演示数据 ---------- */
  function rnd(a,b){return Math.round(a+Math.random()*(b-a))}
  function dAgo(today,n){const d=new Date(today);d.setDate(d.getDate()-n);return d.toISOString().slice(0,10)}

  // 基础数据：仅当 stores 为空（全新库）时创建；老用户直接读取现有数据，绝不覆盖
  async function ensureBase(){
    const today=new Date();
    const nStores=await DB.count('stores');
    let stores,pids;
    if(nStores===0){
      const s1={name:'Aurora Home US',site:'US',marketplace:'Amazon.com',status:'正常',note:'家居类目主力店'};
      const s2={name:'Aurora Living EU',site:'EU',marketplace:'Amazon.de',status:'正常',note:'德法西三站点'};
      const s3={name:'Aurora JP',site:'JP',marketplace:'Amazon.co.jp',status:'观察',note:'日本站试水'};
      stores=[];
      for(const s of [s1,s2,s3]){ const id=await DB.put('stores',s); stores.push({id,...s}); }
      const prods=[
        {storeId:stores[0].id,asin:'B0XK1DEMO1',sku:'AH-STORAGE-L',name:'折叠收纳箱 大号',category:'家居收纳',
         price:29.99,cost:{purchase:6.2,firstLeg:2.1,fbaFee:5.4,commission:.15,storage:.4,returnLoss:.05,targetAcos:.25}},
        {storeId:stores[0].id,asin:'B0XK1DEMO2',sku:'AH-STORAGE-M',name:'折叠收纳箱 中号',category:'家居收纳',
         price:22.99,cost:{purchase:4.6,firstLeg:1.6,fbaFee:4.8,commission:.15,storage:.3,returnLoss:.05,targetAcos:.25}},
        {storeId:stores[1].id,asin:'B0XK2DEMO3',sku:'AL-LAMP-01',name:'LED 氛围台灯',category:'照明',
         price:39.9,cost:{purchase:9.5,firstLeg:2.8,fbaFee:6.9,commission:.15,storage:.5,returnLoss:.07,targetAcos:.3}},
        {storeId:stores[2].id,asin:'B0XK3DEMO4',sku:'AJ-CUP-01',name:'保温杯 500ml',category:'厨具',
         price:24.5,cost:{purchase:5.0,firstLeg:1.9,fbaFee:4.2,commission:.1,storage:.3,returnLoss:.04,targetAcos:.22}}
      ];
      pids=[];
      for(const p of prods){ const id=await DB.put('products',p); pids.push({id,...p}); }
      // 批量生成 kpi_daily：365 天 × 4 品 = 1460 条，必须一次事务 bulk 写入，否则 1460 个并发 put 会卡死浏览器
      const kpiRows=[];
      for(let i=364;i>=0;i--){
        pids.forEach((p,idx)=>{
          const d=new Date(today); d.setDate(d.getDate()-i);
          const base=[42,30,18,12][idx];
          const orders=Math.max(1,Math.round(base+rnd(-8,10)));
          const sales=+(orders*p.price*(1+rnd(-5,15)/100)).toFixed(2);
          const adSpend=+(sales*rnd(8,24)/100).toFixed(2);
          const adSales=+(adSpend*(1.6+rnd(0,28)/10)).toFixed(2);
          const sessions=Math.round(orders/(0.06+rnd(0,60)/1000)*1);
          kpiRows.push({storeId:p.storeId,productId:p.id,date:d.toISOString().slice(0,10),
            sessions,orders,sales,cvr:+(orders/sessions*100).toFixed(2),aov:+(sales/orders).toFixed(2),
            adSpend,adSales,acos:adSales?+(adSpend/adSales*100).toFixed(2):null,
            refunds:rnd(0,Math.max(1,Math.round(orders*.06))),
            refundRate:+(rnd(0,60)/10).toFixed(2)});
        });
      }
      await DB.bulk('kpi_daily',kpiRows);
      const adsRows=[], invRows=[], listRows=[];
      pids.forEach((p,idx)=>{
        adsRows.push({storeId:p.storeId,productId:p.id,name:(idx%2?'SP-自动':'SP-手动核心词')+' '+p.sku,
          campaignType:idx%2?'SP-Auto':'SP-Manual',dailyBudget:30+idx*10,spend:[120,90,60,45][idx],
          sales:[430,260,150,120][idx],impressions:[12000,9000,5000,3000][idx],clicks:[210,150,70,45][idx],
          date:today.toISOString().slice(0,10)});
        invRows.push({productId:p.id,fbaQty:[180,320,90,240][idx],inboundQty:[0,120,60,0][idx],
          reserveQty:[10,15,5,8][idx],dailySalesAvg:[42,30,18,12][idx],leadDays:[45,45,35,40][idx], // dailySalesAvg 现为兜底值：kpi_daily 有该品近30天数据时由页面动态覆盖
          aging90:[0,20,35,0][idx],aging180:[0,0,10,0][idx]});
        listRows.push({productId:p.id,title:p.name+' | 品牌+核心词+属性+卖点 (示例)',
          bullets:[1,1,1,1,0][idx],images:[7,7,5,6][idx],aPlus:[1,1,0,1][idx],
          keywords:'收纳 折叠 家居 整理',cvrBaseline:[8.5,7.2,4.1,5.6][idx],lastAudit:null});
      });
      await DB.bulk('ads',adsRows);
      await DB.bulk('inventory',invRows);
      await DB.bulk('listings',listRows);
      await DB.bulk('reviews',[
        {productId:pids[0].id,date:today.toISOString().slice(0,10),rating:1,
          sentiment:'负',reasonTags:'尺寸,描述不符',quote:'比图片里小很多，装不下被子',actionTaken:''},
        {productId:pids[2].id,date:today.toISOString().slice(0,10),rating:2,
          sentiment:'负',reasonTags:'质量,物流',quote:'灯座松动，外箱压变形',actionTaken:''}
      ]);
      await DB.bulk('compliance',[
        {storeId:stores[1].id,item:'CE 认证（LED 台灯）',region:'EU',
          expireDate:'2027-05-31',status:'有效',reminderDays:90},
        {storeId:stores[0].id,item:'品牌商标 US',region:'US',
          expireDate:'2026-11-30',status:'有效',reminderDays:60}
      ]);
      const y=today.getFullYear();
      await DB.bulk('nodes', genNodes('US',y).concat(genNodes('EU',y),genNodes('JP',y),genNodes('US',y+1)));
      DB.put('tasks',{source:'节点',title:'黑五网一提报：确认 Deal 资格与活动价',priority:'红',
        dueDate:`${y}-09-18`,relatedId:null,done:false});
      DB.put('tasks',{source:'诊断',title:'LED 台灯库存覆盖不足 14 天，安排补货',priority:'红',
        dueDate:today.toISOString().slice(0,10),relatedId:null,done:false});
      DB.put('tasks',{source:'诊断',title:'收纳箱中号 A+ 未上线，补齐 A+ 内容',priority:'黄',
        dueDate:today.toISOString().slice(0,10),relatedId:null,done:false});
    } else {
      stores=await DB.all('stores');
      pids=await DB.all('products');
    }
    return {stores,pids};
  }

  // 缺哪张表补哪张表：表为空才写入，已有数据绝不覆盖
  async function fillTable(store,builder){
    if(await DB.count(store)>0) return;
    const rows=await builder();
    if(rows&&rows.length) await DB.bulk(store,rows);
  }

  async function seed(){
    const {stores,pids}=await ensureBase();
    const today=new Date();
    await fillTable('returns',()=>{
      const RET=[
        {pi:0,d:12,reason:'尺寸不符',amt:29.99,resolved:1},
        {pi:0,d:9,reason:'描述不符',amt:29.99,resolved:1},
        {pi:0,d:5,reason:'质量问题',amt:29.99,resolved:0},
        {pi:1,d:14,reason:'不喜欢',amt:22.99,resolved:1},
        {pi:1,d:7,reason:'尺寸不符',amt:22.99,resolved:0},
        {pi:1,d:3,reason:'物流损坏',amt:22.99,resolved:0},
        {pi:2,d:18,reason:'质量问题',amt:39.90,resolved:1},
        {pi:2,d:11,reason:'描述不符',amt:39.90,resolved:1},
        {pi:2,d:6,reason:'物流损坏',amt:39.90,resolved:0},
        {pi:2,d:2,reason:'其他',amt:39.90,resolved:0},
        {pi:3,d:20,reason:'不喜欢',amt:24.50,resolved:1},
        {pi:3,d:8,reason:'尺寸不符',amt:24.50,resolved:0}
      ];
      return RET.map(r=>({productId:(pids[r.pi]||{}).id,date:dAgo(today,r.d),reason:r.reason,
        refundAmount:r.amt,resolved:!!r.resolved})).filter(r=>r.productId);
    });
    await fillTable('claims',()=>{
      const CLM=[
        {pi:0,type:'仓内丢失',d:25,qty:3,amt:89.97,claimed:1},
        {pi:0,type:'仓内损坏',d:16,qty:2,amt:59.98,claimed:1},
        {pi:1,type:'客户退货未入库',d:10,qty:4,amt:91.96,claimed:0},
        {pi:2,type:'仓内丢失',d:6,qty:2,amt:79.80,claimed:0},
        {pi:2,type:'多收仓储费',d:4,qty:1,amt:23.50,claimed:0},
        {pi:3,type:'仓内损坏',d:2,qty:5,amt:122.50,claimed:0}
      ];
      return CLM.map(c=>({type:c.type,date:dAgo(today,c.d),qty:c.qty,
        amount:c.amt,windowEnd:dAgo(today,c.d-60),claimed:!!c.claimed}));
    });
    await fillTable('promos',()=>{
      const PRM=[
        {pi:0,type:'Coupon',s:20,e:8,disc:15,fee:48.0},
        {pi:1,type:'Lightning Deal',s:15,e:13,disc:20,fee:150.0},
        {pi:2,type:'7-Day Deal',s:6,e:0,disc:18,fee:120.0},
        {pi:3,type:'Prime 专享',s:12,e:5,disc:10,fee:30.0},
        {pi:null,type:'Coupon',s:25,e:3,disc:12,fee:60.0},
        {pi:2,type:'Coupon',s:3,e:-2,disc:8,fee:20.0}
      ];
      return PRM.map(x=>Object.assign(x.pi!=null?{productId:pids[x.pi].id}:{},
        {type:x.type,startDate:dAgo(today,x.s),endDate:dAgo(today,x.e),discount:x.disc,fee:x.fee}));
    });
    await fillTable('searchterms',()=>[
      {t:'foldable storage bins',imp:8400,clk:210,sp:62.3,sa:198.4,o:9},
      {t:'收纳箱 折叠',imp:5200,clk:160,sp:40.1,sa:142.0,o:6},
      {t:'closet organizer',imp:3100,clk:88,sp:28.7,sa:0,o:0},
      {t:'storage boxes large',imp:6700,clk:150,sp:55.2,sa:173.9,o:8},
      {t:'led ambient lamp',imp:4600,clk:120,sp:48.0,sa:159.6,o:4},
      {t:'desk lamp mood lighting',imp:2300,clk:70,sp:31.5,sa:79.8,o:2},
      {t:'thermos cup 500ml',imp:3900,clk:98,sp:29.4,sa:122.5,o:5},
      {t:'保温杯 不锈钢',imp:2800,clk:65,sp:22.1,sa:73.5,o:3},
      {t:'折叠收纳箱 大号',imp:1900,clk:55,sp:18.3,sa:58.0,o:2},
      {t:'fabric storage cubes',imp:1500,clk:40,sp:14.2,sa:0,o:0},
      {t:'night light lamp',imp:2100,clk:60,sp:26.0,sa:67.0,o:1},
      {t:'travel coffee mug',imp:1700,clk:48,sp:17.0,sa:48.8,o:2}
    ].map(s=>({term:s.t,impressions:s.imp,clicks:s.clk,spend:s.sp,sales:s.sa,orders:s.o,date:dAgo(today,1)})));
    await fillTable('ship_plans',()=>[
      {n:'Q4 收纳箱补货-01',sd:30,eta:18,q:600,st:'已到仓',diff:3},
      {n:'LED台灯旺季备货',sd:12,eta:2,q:400,st:'在途',diff:0},
      {n:'保温杯日常补货',sd:8,eta:-1,q:300,st:'接收中',diff:-5},
      {n:'黑五收纳箱加单',sd:5,eta:14,q:800,st:'待发货',diff:0}
    ].map(x=>({name:x.n,shipDate:dAgo(today,x.sd),etaDate:dAgo(today,x.eta),qty:x.q,status:x.st,diff:x.diff})));
    await fillTable('competitors',()=>[
      {a:'B08ABC0001',n:'竞品A 折叠收纳箱',d:20,p:27.99,rv:1820,bsr:340,rt:4.5},
      {a:'B08ABC0001',n:'竞品A 折叠收纳箱',d:10,p:25.99,rv:1905,bsr:310,rt:4.5},
      {a:'B08ABC0001',n:'竞品A 折叠收纳箱',d:2,p:26.99,rv:1980,bsr:298,rt:4.4},
      {a:'B09XYZ0002',n:'竞品B LED氛围灯',d:18,p:42.90,rv:940,bsr:760,rt:4.3},
      {a:'B09XYZ0002',n:'竞品B LED氛围灯',d:6,p:39.90,rv:1010,bsr:690,rt:4.3},
      {a:'B07LMN0003',n:'竞品C 保温杯',d:15,p:21.99,rv:2600,bsr:210,rt:4.6},
      {a:'B07LMN0003',n:'竞品C 保温杯',d:4,p:23.49,rv:2680,bsr:195,rt:4.6},
      {a:'B0XK1DEMO1',n:'本品 折叠收纳箱 大号',d:2,p:29.99,rv:430,bsr:880,rt:4.2}
    ].map(c=>({asin:c.a,name:c.n,date:dAgo(today,c.d),price:c.p,reviews:c.rv,bsr:c.bsr,rating:c.rt,note:''})));
    await fillTable('keywords',()=>{
      const KW=[
        {t:'foldable storage bins',s:'US',ty:'核心词',v:22000,r:12,u:'标题/五点'},
        {t:'收纳箱 折叠',s:'US',ty:'核心词',v:9800,r:8,u:'标题/ST'},
        {t:'closet organizer',s:'US',ty:'长尾词',v:6400,r:25,u:'五点/广告'},
        {t:'storage boxes large',s:'US',ty:'长尾词',v:5300,r:30,u:'广告'},
        {t:'led ambient lamp',s:'EU',ty:'核心词',v:7100,r:18,u:'标题'},
        {t:'led mood light',s:'EU',ty:'长尾词',v:3900,r:40,u:'广告'},
        {t:'保温杯 500ml',s:'JP',ty:'核心词',v:8800,r:15,u:'标题/ST'},
        {t:'thermos mug',s:'JP',ty:'长尾词',v:4100,r:33,u:'广告'},
        {t:'free shipping bins',s:'US',ty:'否定词',v:0,r:0,u:'否定-无包邮'},
        {t:'cheap storage',s:'US',ty:'否定词',v:0,r:0,u:'否定-低质'}
      ];
      const kw=KW.map(k=>({kind:'关键词',term:k.t,site:k.s,type:k.ty,volume:k.v,rank:k.r,usage:k.u}));
      const lib=[['标题公式','品牌+核心关键词+关键属性+核心卖点+规格'],
        ['卖点模板','①痛点切入 ②解决方案 ③参数规格 ④场景适用 ⑤售后保障'],
        ['A+模块','对比图+场景图+规格表+品牌故事']].map(m=>({kind:m[0],text:m[1]}));
      return kw.concat(lib);
    });
    await fillTable('candidates',()=>[
      {n:'宠物自动饮水机',s:'US',c:'宠物用品',m:[8,6,7,7,6,8]},
      {n:'桌面吸尘器',s:'EU',c:'小家电',m:[7,7,6,6,5,7]},
      {n:'瑜伽阻力带',s:'US',c:'运动健身',m:[9,5,8,8,7,9]},
      {n:'车载手机支架',s:'JP',c:'汽车配件',m:[6,8,7,6,6,7]},
      {n:'厨房称重秤',s:'EU',c:'厨具',m:[7,6,7,7,8,8]}
    ].map(c=>({name:c.n,site:c.s,category:c.c,mktSize:c.m[0],compete:c.m[1],priceBand:c.m[2],
      margin:c.m[3],compliance:c.m[4],supply:c.m[5],note:''})));
    await fillTable('patrol',()=>{
      const STEP_ST={account:['正常',''],sales:['正常',''],ads:['异常','SP-手动核心词 ACOS 超保本线'],
        inventory:['异常','收纳箱中号可售<14天'],cvr:['正常',''],after:['正常',''],policy:['正常','']};
      const sid=stores[0]?stores[0].id:null;
      return Object.keys(STEP_ST).map(st=>{
        const vn=STEP_ST[st];
        return {storeId:sid,date:today.toISOString().slice(0,10),step:st,status:vn[0],note:vn[1]};
      });
    });
    // ===== 新增 SOP 业务表演示数据 =====
    await fillTable('newlaunch',()=>{
      const ph=[['准备期',1],['爆发期1',2],['爆发期2',3],['稳定期',5]];
      const act={准备期:'关键词埋词+评论计划+主图A+',爆发期1:'高价 coupon+vine+手动精准',
        爆发期2:'从手动转自动+降coupon',稳定期:'稳定出单+收割自然单'};
      const rows=[]; let pk=0;
      pids.slice(0,3).forEach((p,pi)=>{
        ph.forEach((it,idx)=>{
          const w=it[1]; const st=idx<2?'已完成':(idx===2?'进行中':'未开始');
          rows.push({productId:p.id,phase:it[0],week:w,date:dAgo(today,(3-idx)*7),
            action:act[it[0]],target:(pi===0?`日销${[30,60,90,120][idx]}`:`日销${[10,25,40,70][idx]}`),
            actual:(st==='未开始'?'':[30,60,90,120][idx]),status:st});
        });
      });
      return rows;
    });
    await fillTable('purchase',()=>[
      {supplier:'义乌宏远家居',sku:'AH-STORAGE-L',productName:'折叠收纳箱 大号',qty:600,unitPrice:5.8,
        orderDate:dAgo(today,40),etaDate:dAgo(today,5),status:'已到货'},
      {supplier:'宁波光耀照明',sku:'AL-LAMP-01',productName:'LED 氛围台灯',qty:400,unitPrice:8.9,
        orderDate:dAgo(today,12),etaDate:dAgo(today,-3),status:'在途'},
      {supplier:'佛山杯具厂',sku:'AJ-CUP-01',productName:'保温杯 500ml',qty:300,unitPrice:4.6,
        orderDate:dAgo(today,8),etaDate:dAgo(today,2),status:'已到货'},
      {supplier:'义乌宏远家居',sku:'AH-STORAGE-M',productName:'折叠收纳箱 中号',qty:500,unitPrice:4.3,
        orderDate:dAgo(today,6),etaDate:dAgo(today,-10),status:'待发货'},
      {supplier:'深圳包装耗材',sku:'PKG-001',productName:'外箱+气泡膜',qty:2000,unitPrice:0.35,
        orderDate:dAgo(today,3),etaDate:dAgo(today,1),status:'已到货'}
    ].map(x=>({...x,amount:+(x.qty*x.unitPrice).toFixed(2)})));
    await fillTable('logistics',()=>[
      {channel:'海运快船',mode:'海运',origin:'深圳盐田',transitDays:18,pricePerKg:9.5,minCharge:300,note:'旺季易拥堵，需提前 30 天订舱'},
      {channel:'海运慢船',mode:'海运',origin:'宁波',transitDays:35,pricePerKg:6.2,minCharge:200,note:'价格低但时效慢'},
      {channel:'空运',mode:'空运',origin:'香港',transitDays:7,pricePerKg:28,minCharge:500,note:'紧急补货用，单 kg 成本高'},
      {channel:'国际快递',mode:'快递',origin:'深圳',transitDays:4,pricePerKg:42,minCharge:350,note:'小批量样品/紧急件'},
      {channel:'铁运',mode:'铁路',origin:'重庆',transitDays:22,pricePerKg:11,minCharge:280,note:'去欧洲性价比高'}
    ]);
    await fillTable('qc',()=>[
      {sku:'AH-STORAGE-L',productName:'折叠收纳箱 大号',item:'外观/尺寸',standard:'±2mm 无破损',result:'合格',date:dAgo(today,4),inspector:'王工'},
      {sku:'AL-LAMP-01',productName:'LED 氛围台灯',item:'通电测试',standard:'点亮无闪烁',result:'不合格',date:dAgo(today,3),inspector:'李工'},
      {sku:'AL-LAMP-01',productName:'LED 氛围台灯',item:'包装跌落',standard:'1m 跌落无裂',result:'合格',date:dAgo(today,3),inspector:'李工'},
      {sku:'AJ-CUP-01',productName:'保温杯 500ml',item:'保温测试',standard:'6h≥65℃',result:'合格',date:dAgo(today,2),inspector:'王工'},
      {sku:'AH-STORAGE-M',productName:'折叠收纳箱 中号',item:'材质气味',standard:'无刺鼻异味',result:'待检',date:dAgo(today,1),inspector:'待派'}
    ]);
    await fillTable('appeal',()=>[
      {type:'账户暂停',scene:'销量异常触发审核',title:'销售激增申诉模板',
        body:'Dear Seller Performance Team, We noticed the recent sales spike was driven by a legitimate promotion... 附 PO 与库存证明，说明增长来源合法合规。'},
      {type:'ASIN 下架',scene:'图文/类目不符',title:'ASIN 恢复申诉模板',
        body:'We have corrected the product detail page to comply with category guidance, updating title/images/attributes... 提供整改前后截图。'},
      {type:'绩效警告',scene:'ODR 超标',title:'ODR 申诉模板',
        body:'We have identified the root cause of late shipment/defect and implemented the following corrective actions... 列出具体整改措施与时间线。'},
      {type:'侵权投诉',scene:'专利/商标投诉',title:'侵权反诉模板',
        body:'We believe this claim is without merit because... 提供自有品牌注册证/授权链/在先使用证据。'}
    ]);
    await fillTable('reply',()=>[
      {type:'差评回复',scene:'质量差评',body:'Dear customer, we are sorry the product did not meet your expectation. Please contact us at ... we will arrange replacement/refund.'},
      {type:'差评回复',scene:'物流差评',body:'Sorry for the delayed delivery caused by the carrier. We have reported it and would love to make it right for you.'},
      {type:'站内信',scene:'订单咨询',body:'Hi, thanks for your order! Your item ships in 1-2 business days. Let us know if you need any help.'},
      {type:'退货处理',scene:'退货请求',body:'We are happy to help with the return. Please initiate the return in Your Orders and we will process refund upon receipt.'},
      {type:'索评',scene:'已收货',body:'Hope you enjoy the product! If you like it, a review would mean a lot to our small team. Questions? We are here 24/7.'},
      {type:'二审邮件',scene:'视频验证',body:'We have received the verification request and will submit the requested documents/video within the timeline. Case ID: ...'}
    ]);
    await fillTable('influencer',()=>[
      {name:'@home_with_lena',platform:'Instagram',fans:86000,niche:'家居收纳',quote:120,status:'已合作',
        note:'Reels 转化好，复投一次'},
      {name:'LampGuru_YT',platform:'YouTube',fans:142000,niche:'灯具测评',quote:350,status:'联系中',
        note:'需送样+脚本审核'},
      {name:'cup_lover_jp',platform:'TikTok',fans:53000,niche:'保温杯/生活',quote:90,status:'已结束',
        note:'单条 ROI 偏低，暂不续'},
      {name:'organize_with_mia',platform:'Instagram',fans:31000,niche:'收纳整理',quote:60,status:'已合作',
        note:'性价比高，可长期'},
      {name:'gadget_review_eu',platform:'YouTube',fans:98000,niche:'小家电',quote:280,status:'待定',
        note:'报价偏高，等 Q4 预算'}
    ]);
    await fillTable('finance',()=>{
      const base=[{m:5,rev:38200,cost:2030,hf:886,comm:5730,fba:8600,ad:9100,rf:2300},
        {m:6,rev:45100,cost:2400,hf:1043,comm:6765,fba:10100,ad:10800,rf:2600},
        {m:7,rev:52300,cost:2770,hf:1171,comm:7845,fba:11700,ad:12600,rf:3100},
        {m:8,rev:48900,cost:2600,hf:1129,comm:7335,fba:11000,ad:11900,rf:2800}];
      const y=today.getFullYear();
      return base.map(b=>({year:y,month:b.m,revenue:b.rev,productCost:b.cost,headFreight:b.hf,
        commission:b.comm,fbaFee:b.fba,adSpend:b.ad,refunds:b.rf,
        netProfit:+(b.rev-b.cost-b.hf-b.comm-b.fba-b.ad-b.rf).toFixed(2)}));
    });
    await fillTable('kpi_score',()=>[
      {name:'销售额',target:'¥35,000',actual:'¥48,900',weight:30,month:'2026-08',note:'旺季带动超额'},
      {name:'广告 ACOS',target:'≤28%',actual:'26.5%',weight:20,month:'2026-08',note:'手动词优化见效'},
      {name:'转化率',target:'≥8%',actual:'7.6%',weight:15,month:'2026-08',note:'Listing 待优化'},
      {name:'退货率',target:'≤5%',actual:'5.7%',weight:15,month:'2026-08',note:'灯类偏高'},
      {name:'店铺评分',target:'≥4.3',actual:'4.4',weight:10,month:'2026-08',note:''},
      {name:'新品上架',target:'2 款/月',actual:'1 款',weight:10,month:'2026-08',note:'开发滞后'}
    ]);
    await fillTable('team',()=>[
      {member:'老K',role:'运营负责人',stores:'Aurora Home US / Aurora Living EU',duty:'整体策略、选品、广告、复盘',status:'在职'},
      {member:'小林',role:'运营助理',stores:'Aurora JP',duty:'日常巡店、客服、数据录入',status:'在职'},
      {member:'阿美',role:'美工',stores:'全部',duty:'主图、A+、Coupon 图',status:'在职'},
      {member:'强子',role:'采购/物流',stores:'全部',duty:'供应商、头程、质检',status:'请假'}
    ]);
    await fillTable('toolbox',()=>[
      {kind:'AI提示词',title:'竞品差评挖掘',content:'提取本品与 top3 竞品的差评高频词，按「功能/质量/物流/描述」分类，给出产品改进建议',link:''},
      {kind:'AI提示词',title:'Listing 五点生成',content:'基于关键词[xxx]和卖点[xxx]，生成 5 条亚马逊风格 bullet points，每条≤200字符，含数据',link:''},
      {kind:'AI提示词',title:'广告搜索词否定',content:'分析搜索词报告，列出应否定的 irrelevant/low-CVR 词，给出否定类型(精准/短语)',link:''},
      {kind:'实用网站',title:'亚马逊卖家中心',content:'Seller Central 登录入口',link:'https://sellercentral.amazon.com'},
      {kind:'实用网站',title:'ABA 品牌分析',content:'Brand Analytics 关键词搜索频率',link:'https://sellercentral.amazon.com/analytics/brand'},
      {kind:'实用网站',title:'卖家百科',content:'规则/政策查询',link:'https://sellercentral.amazon.com/help'},
      {kind:'发票模板',title:'采购发票(英文)',content:'Supplier / PO# / Item / Qty / Unit / Total / Date，含税号',link:''},
      {kind:'发票模板',title:'FBA 入仓发票',content:'用于清关，需含 HS Code / 材质 / 用途',link:''}
    ]);
    await fillTable('account_health',()=>[
      {storeId:stores[0].id,ahr:235,policyWarnings:0,suppressed:0,note:'账户健康良好，无停售'},
      {storeId:stores[1].id,ahr:165,policyWarnings:2,suppressed:2,note:'AHR 偏低，含 2 个停售 ASIN，需申诉恢复'},
      {storeId:stores[2].id,ahr:280,policyWarnings:0,suppressed:0,note:'观察中，关注 AHR 走势'}
    ]);

    // ===== 选品开发模块新表（Phase 3，缺表才写；公式字段可留空交给前端计算） =====
    await fillTable('project_progress',()=>[
      {candidateId:null,progress:'产品数据分析和定位',startDate:dAgo(today,20),doneDate:null,note:'示例进度'},
      {candidateId:null,progress:'供应商打样与比价',startDate:dAgo(today,10),doneDate:null,note:''}
    ]);
    await fillTable('market_analysis',()=>[
      {sheet:'kw1src',seq:1,asin:'B0XXXX001',brand:'Demo',country:'US',monthSales:600,monthAmt:17994,bsr:340,price:29.99,marginPct:null,rating:4.5,reviews:1820,rev30:120,onDays:200,bb:'是',monopolyPct:null,cap:null},
      {sheet:'profit',seq:1,dSales:20,price:29.99,rate:6.8,cost:6.2,weightKg:0.4,fba:5.4,commission:4.5,loss:1.5,airFee:null,seaFee:null,totalCost:null,profit:null,profitPct:null,airRoi:null,seaRoi:null}
    ]);
    await fillTable('aba_keywords',()=>[
      {sheet:'summary',seq:1,term:'foldable storage bins',rankQ1:1200,rankQ2:1100,rankQ3:980,rankQ4:1050,rank10000:null,noParamSum:null,trend:null,capacity:'大',recommend:null},
      {sheet:'dedup',seq:1,term:'storage bins',dedup:'storage bins'}
    ]);
    await fillTable('research',()=>[
      {sheet:'market',seq:1,brand:'Demo',dSales:20,mSales:600,mSalesAmt:17994,asinCount:3,sharePct:null},
      {sheet:'profit',seq:1,shipMode:'空运',country:'US',size:'M',priceLocal:29.99,rate:6.8,priceUsd:null,costUsd:6.2,firstLeg:2.1,fba:5.4,tariffUs:null,commPct:12,refundPct:5,netPct:null,grossUsd:null,grossPct:null,promoYear:null,note:''}
    ]);
    await fillTable('competitor_basic',()=>[
      {name:'竞品A 折叠收纳箱',category:'家居收纳',recDate:dAgo(today,2),rank:340,img:'',asin:'B0XXXXA01',sales30:600,catRank:'#340',title:'竞品A 折叠收纳箱 大号',bullets:'',keywords:'',price:27.99,fbaFee:5.4,priceTrend:'',priceMin:25.99,priceMax:29.99,onDate:null,variant:'',reviews:1820,rating:4.5,badReviews:36,badRate:null,pkgSize:'',pkgWeight:'',goodContent:'',badContent:'',reviewSummary:'',optimize:''},
      {name:'竞品B LED氛围灯',category:'照明',recDate:dAgo(today,3),rank:690,asin:'B0XXXXB02',sales30:400,catRank:'#690',title:'竞品B LED氛围灯',price:39.9,fbaFee:6.9,reviews:1010,rating:4.3,badReviews:30,badRate:null}
    ]);
    await fillTable('competitor_multi',()=>[
      {sheet:'summary',seq:1,lifeCycle:'成长期',pNameCn:'折叠收纳箱',purchase:6.2,overseaShip:'海运',headCost:2.1,shipCost:0.5,commission:4.5,gross:null,afterSale:0.3,price:27.99,grossPct:null},
      {sheet:'priceCalc',seq:1,pNameCn:'折叠收纳箱',L:30,W:20,H:10,gWeight:0.4,nWeight:0.35,purchase:6.2,inShipMode:'陆运',inShipCost:0.3,outShipMode:'海运',outHeadCost:2.1,shipCost:0.5,commission:4.5,commPct:15,gross:null,afterSale:0.3,price:27.99,grossPct:null}
    ]);
    // B4：competitor_plan 仅白名单字段，严禁任何 刷单/测评中介 字段
    await fillTable('competitor_plan',()=>[
      {sheet:'research',seq:1,recDate:dAgo(today,5),no:'CP-001',kwSite:'US',brand:'Demo',img:'',note:'尺寸重量/卖点/运营特点',rating:4.5,reviews:1820,localPrice:199,rank:340,pubDate:dAgo(today,200),months:8,estMonthSales:600},
      {sheet:'costCalc',seq:1,product:'折叠收纳箱',asin:'B0XXXXA01',year:2026,month:9,profit:null,breakEvenPrice:null,breakEvenPct:null,rmbCost:null,costRatio:null,realCostRatio:null,price:27.99,fbaSingle:5.4,firstLeg:2.1,productCost:6.2,estSales:600},
      {sheet:'promoPlan',seq:1,product:'折叠收纳箱',asin:'B0XXXXA01',rivalAsin:'B0XXXXB02',rivalReview:1010,rivalPrice:39.9,rankNote:'',pushDate:dAgo(today,3),priceUsd:27.99,rivalStock:300,product:'折叠收纳箱',costRmb:42,estSales:600,estMonthShipCostRmb:14,amzCommRmb:null,fbaRmb:37,totalHeadRmb:null,estMonthAdRmb:120,estRevRmb:null,totalProdCostRmb:null,lossRmb:null,otherCostRmb:null}
    ]);
    await fillTable('profit_check',()=>[
      {sheet:'size',seq:1,onDate:dAgo(today,5),pName:'折叠收纳箱 大号',img:'',asin:'B0XK1DEMO1',sku:'AH-STORAGE-L',fnsku:'XK1-FNSKU',sizeCm:'30x20x10',weightKg:0.4,pkgSizeCm:'32x22x12',pkgWeightKg:0.5,lxwxhCm:30,lxwxhInch:11.81,pxWxHinch:8.66,pkgLxwxHcm:32,pkgLxWxHinch:12.6,pkgWeightLb:1.1,volDiv6000:null,volDiv5000:null},
      {sheet:'feeCheck',seq:1,asin:'B0XK1DEMO1',sku:'AH-STORAGE-L',fbaWeightLb:1.1,fbaTier:'标准',estFee:null,fbaRealWeight:null,fbaRealFee:null,update:dAgo(today,1)},
      {sheet:'profit2',seq:1,sku:'AH-STORAGE-L',purchase$:6.2,firstLeg$:2.1,fbaFee$:5.4,commission$:4.5,refund$:1.5,ad$:7.5,storageOther$:1.0,promo$:3.0,price$:29.99,rate:6.8,shipMode:'空运',version:'预估',volDiv5000:null,volDiv6000:null,cost$:null,profit$:null,profitRmb:null,netPct:null,breakEvenAcos:null}
    ]);
    await fillTable('profit_metrics',()=>[
      {channel:'空运',currency:'美元',price:29.99,weightG:400,freightPerG:0.05,firstLegRmb:14,costRmb:42,rate:6.8,profitRmb:null,profitRatio:null,priceRmb:null,taxRmb:null,commissionRmb:null,preDeduct:null,netReceive:null,amzShipRmb:null,fxLoss:null,volL:null,volW:null,volH:null,volWeightKg:null,qty:null,unitWeight:null},
      {channel:'海运',currency:'美元',price:39.9,weightG:350,freightPerG:0.02,firstLegRmb:7,costRmb:61,rate:6.8,profitRmb:null,profitRatio:null,priceRmb:null,taxRmb:null,commissionRmb:null,preDeduct:null,netReceive:null,amzShipRmb:null,fxLoss:null}
    ]);
    await fillTable('product_analysis',()=>[
      {sheet:'req',seq:1,cnName:'折叠收纳箱',enName:'Foldable Storage Bins',img:'',func:'家居收纳',scene:'衣柜/储物间',marketAna:'美国站容量大'},
      {sheet:'us',seq:1,img:'',brand:'Demo',link:'',asin:'B0XK1DEMO1',onDate:dAgo(today,200),rating:4.5,reviewsTotal:1820,price:29.99,mainRank:340,estDSales:20,segment:'家居收纳',segmentDetail:''}
    ]);
    await fillTable('dev_plan',()=>[
      {sheet:'front',seq:1,site:'US',img:'',pName:'折叠收纳箱',kw:'storage bins',cpCount:5,mainSeller:'Demo',saleLink:'',reviews:1820,feedback:null,rating:4.5,badPoint:'',sellingPoint:'',price:27.99,buyLink:'',buyPrice:null,weightG:400,gross:null,lifeCycle:'成长期',grossPct:null},
      {sheet:'position',seq:1,segment:'家居收纳',targetMarket:'美国站租房人群'},
      {sheet:'usFba',seq:1,cm:'',country:'US',account:'',brand:'Demo',sku:'AH-STORAGE-L',cnName:'折叠收纳箱',asin:'B0XK1DEMO1',price$:29.99,grossRmb:null,grossPct:null,purchaseRmb:42,weightG:400,firstLegRmb:14,tariff:null,fbaHandling$:null,fbaPick$:null,fbaWeight$:null,commPct:15,referralFee$:null,rate:6.8,firstLegRate:null}
    ]);
    await fillTable('fba_rate',()=>[
      // 以 ui.js 的 FBA_RATES（美国站 2026-01-15 生效，非旺季/非服装/非危险品/$10-50 价格带）为权威内置表。
      // 此 fba_rate store 仅供用户在「设置-费率维护」中覆盖/补充个别分段费率；以下仅为 2 行示例。
      {tier:'smallStandard', sizeSeg:'≤2oz', band:'mid', fee:3.32, effDate:'2026-01-15',
        note:'小号标准 ≤2oz mid 费率（示例，权威值见 ui.js FBA_RATES；后台最新费率为准，可编辑覆盖）'},
      {tier:'largeStandard', sizeSeg:'3-20lb 基础', band:'mid', fee:6.97, effDate:'2026-01-15',
        note:'大号标准 3-20lb mid 基础费（示例，权威值见 ui.js FBA_RATES；含 $0.16/半磅续重与 3.5% 燃油附加费另计）'}
    ]);
    return true;
  }

  window.DB=DB; window.DB_TABLES=TABLES; window.DBNodes={genNodes,NODE_GUIDE}; window.DBSeed=seed;
})();
