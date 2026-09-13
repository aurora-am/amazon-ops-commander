(function(){
  const P={}; const U=window.UI, DB=window.DB;

  async function pm(){const ps=await DB.all('products');const m={};ps.forEach(p=>m[p.id]=p);return m}

  /* ============ 15. 每日数据录入 ============ */
  P.kpi=async root=>{
    U.clearCharts();
    const stores=await sm2(); const PM=await pm();
    const rows=(await DB.all('kpi_daily')).filter(r=>App.inScope(r.storeId))
      .sort((a,b)=>a.date<b.date?1:(a.date>b.date?-1:0)).slice(0,60);
    root.innerHTML=
      `<div class="card"><h3>每日数据录入</h3>
        <div class="sub">没有 API、不抓取，数据靠后台导出 CSV 或这里手动录入。建议固定每天同一时间录 8 个核心字段</div>
        <div class="toolbar"><button class="btn" id="kAdd">录入今日数据</button>
          <button class="btn-ghost" id="kCsv">导出 CSV</button></div>`+
      U.table({cols:[
        {t:'日期',k:'date'},
        {t:'店铺',f:r=>U.esc(stores[r.storeId]?stores[r.storeId].name:'—')},
        {t:'产品',f:r=>U.esc(PM[r.productId]?PM[r.productId].sku:'全店')},
        {t:'会话',k:'sessions',num:true},{t:'订单',k:'orders',num:true},
        {t:'销售额',num:true,f:r=>U.money(r.sales)},
        {t:'转化率',num:true,f:r=>U.pct(r.cvr)},
        {t:'广告花费',num:true,f:r=>U.money(r.adSpend)},
        {t:'ACOS',num:true,f:r=>U.pct(r.acos)},
        {t:'退款单',k:'refunds',num:true}
      ],rows,empty:'暂无每日数据，点击「录入今日数据」或从「数据导入」导入后台报告',
      actions:r=>`<button class="btn-ghost btn-sm" data-kd="${r.id}">删除</button>`})+`</div>
      <div class="card"><h3>近 30 天销售趋势</h3><div id="cK" class="chart"></div></div>`;
    async function sm2(){const ss=await DB.all('stores');const m={};ss.forEach(s=>m[s.id]=s);return m}
    root.querySelector('#kAdd').onclick=()=>{
      const ss=Object.values(stores);
      U.modal({title:'录入每日数据',body:U.formFields([
        {k:'storeId',t:'店铺',type:'select',opts:ss.map(s=>({v:s.id,t:s.name}))},
        {k:'productId',t:'产品',type:'select',opts:[{v:'',t:'全店合计'}].concat(Object.values(PM).map(p=>({v:p.id,t:p.sku})))},
        {k:'date',t:'日期',type:'date',def:U.today()},
        {k:'sessions',t:'会话 Sessions',type:'number'},{k:'orders',t:'订单数',type:'number'},
        {k:'sales',t:'销售额',type:'number',step:'0.01'},{k:'adSpend',t:'广告花费',type:'number',step:'0.01'},
        {k:'adSales',t:'广告销售',type:'number',step:'0.01'},{k:'refunds',t:'退款单数',type:'number'}
      ]),onOk:async b=>{
        const v=U.formValues(b);
        if(v.productId==='') delete v.productId;
        v.cvr=(v.sessions&&v.orders)?+(v.orders/v.sessions*100).toFixed(2):null;
        v.aov=(v.orders&&v.sales)?+(v.sales/v.orders).toFixed(2):null;
        v.acos=(v.adSales)?+(v.adSpend/v.adSales*100).toFixed(2):null;
        v.refundRate=(v.orders&&v.refunds!=null)?+(v.refunds/v.orders*100).toFixed(2):null;
        await DB.put('kpi_daily',v); U.toast('已保存');
      },after:()=>App.refresh()});
    };
    root.querySelector('#kCsv').onclick=()=>U.exportCSV('commander_kpi.csv',
      rows.map(r=>({日期:r.date,店铺:stores[r.storeId]?stores[r.storeId].name:'',产品:PM[r.productId]?PM[r.productId].sku:'全店',
        会话:r.sessions,订单:r.orders,销售额:r.sales,转化率:r.cvr,广告花费:r.adSpend,ACOS:r.acos,退款:r.refunds})),
      ['日期','店铺','产品','会话','订单','销售额','转化率','广告花费','ACOS','退款']);
    root.querySelectorAll('[data-kd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该记录？',
      async()=>{await DB.del('kpi_daily',Number(x.dataset.kd));App.refresh()}));
    const by={}; rows.forEach(r=>{by[r.date]=(by[r.date]||0)+(Number(r.sales)||0)});
    const ds=Object.keys(by).sort();
    U.chart(document.getElementById('cK'),{
      tooltip:{trigger:'axis'},grid:{left:60,right:20,top:20,bottom:30},
      xAxis:{type:'category',data:ds},yAxis:{type:'value'},
      series:[{type:'line',smooth:true,data:ds.map(d=>+by[d].toFixed(2)),itemStyle:{color:'#1E5FA8'},areaStyle:{color:'#CFE0F2'}}]
    });
  };

  /* ============ 16. 选品立项 ============ */
  const DIMS=[
    {k:'mktSize',t:'市场规模',w:.2},{k:'compete',t:'竞争度',w:.15},
    {k:'priceBand',t:'价格带',w:.15},{k:'margin',t:'毛利空间',w:.2},
    {k:'compliance',t:'合规风险',w:.15},{k:'supply',t:'供应链',w:.15}
  ];
  P.selection=async root=>{
    const rows=await DB.all('candidates');
    rows.forEach(r=>{
      r._score=DIMS.reduce((a,d)=>a+(Number(r[d.k])||0)*d.w,0)*10;
      r._adv=r._score>=75?'优先打爆':(r._score>=55?'可上架':'观望');
    });
    rows.sort((a,b)=>b._score-a._score);
    root.innerHTML=`<div class="card"><h3>选品立项评分卡</h3>
      <div class="sub">六维手动打分（1-10）加权：市场 .2 / 竞争 .15 / 价格带 .15 / 毛利 .2 / 合规 .15 / 供应链 .15。
        系统只排序，立项判断由你做</div>
      <div class="toolbar"><button class="btn" id="cAdd">新增候选</button></div>`+
      U.table({cols:[
        {t:'候选品',k:'name'},{t:'站点',k:'site'},{t:'类目',k:'category'},
        {t:'综合分',num:true,f:r=>r._score.toFixed(1)},
        {t:'建议',f:r=>U.tag(r._adv,r._adv==='优先打爆'?'green':(r._adv==='可上架'?'yellow':'gray'))},
        {t:'备注',k:'note'}
      ],rows,empty:'暂无候选品',
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button>
        <button class="btn-ghost btn-sm" data-d="${r.id}">删除</button>
        <button class="btn-ghost btn-sm" data-to="${r.id}">转为产品</button>`})+`</div>`;
    const fields=DIMS.map(d=>({k:d.k,t:d.t+' (1-10)',type:'number'})).concat([
      {k:'name',t:'候选品名称'},{k:'site',t:'站点',type:'select',opts:['US','EU','JP'].map(v=>({v,t:v}))},
      {k:'category',t:'类目'},{k:'note',t:'备注',type:'textarea'}]);
    root.querySelector('#cAdd').onclick=()=>U.modal({title:'新增候选品',body:U.formFields(fields),
      onOk:async b=>{await DB.put('candidates',U.formValues(b))},after:()=>App.refresh()});
    root.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>{
      const c=await DB.get('candidates',Number(x.dataset.e));
      U.modal({title:'编辑候选品',body:U.formFields(fields,c),onOk:async b=>{
        const v=U.formValues(b);v.id=c.id;await DB.put('candidates',v)},after:()=>App.refresh()});
    });
    root.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>U.confirmBox('删除该候选？',
      async()=>{await DB.del('candidates',Number(x.dataset.d));App.refresh()}));
    root.querySelectorAll('[data-to]').forEach(x=>x.onclick=async()=>{
      const c=await DB.get('candidates',Number(x.dataset.to));
      const stores=await DB.all('stores');
      if(!stores.length){U.toast('请先添加店铺');return}
      await DB.put('products',{storeId:stores[0].id,asin:c.asin||'',sku:(c.name||'').slice(0,12)||'NEW',
        name:c.name,category:c.category,price:0,
        cost:{purchase:0,firstLeg:0,fbaFee:0,commission:.15,storage:0,returnLoss:.05,targetAcos:.25}});
      U.toast('已转为产品，请补全成本结构'); App.go('products');
    });
  };

  /* ============ 17. 竞品追踪 ============ */
  P.competitors=async root=>{
    U.clearCharts();
    const rows=(await DB.all('competitors')).sort((a,b)=>a.date<b.date?1:-1);
    const byAsin={}; rows.forEach(r=>{byAsin[r.asin]=byAsin[r.asin]||[];byAsin[r.asin].push(r)});
    root.innerHTML=`<div class="card"><h3>竞品追踪</h3>
      <div class="sub">手动记录竞品快照（价格 / 评论数 / 排名），形成时间序列。系统不做抓取</div>
      <div class="toolbar"><button class="btn" id="cpAdd">新增快照</button>
        <button class="btn-ghost" id="cpCsv">导出 CSV</button></div>`+
      U.table({cols:[
        {t:'ASIN',k:'asin'},{t:'名称',k:'name'},{t:'日期',k:'date'},
        {t:'价格',num:true,f:r=>U.money(r.price)},{t:'评论数',k:'reviews',num:true},
        {t:'BSR',k:'bsr',num:true},{t:'评分',k:'rating',num:true},{t:'备注',k:'note'}
      ],rows:rows.slice(0,80),empty:'暂无竞品快照',
      actions:r=>`<button class="btn-ghost btn-sm" data-cd="${r.id}">删除</button>`})+`</div>
      <div class="card"><h3>竞品价格走势</h3><div id="cCp" class="chart"></div></div>`;
    root.querySelector('#cpAdd').onclick=()=>U.modal({title:'新增竞品快照',body:U.formFields([
      {k:'asin',t:'ASIN'},{k:'name',t:'名称'},{k:'date',t:'日期',type:'date',def:U.today()},
      {k:'price',t:'价格',type:'number',step:'0.01'},{k:'reviews',t:'评论数',type:'number'},
      {k:'bsr',t:'BSR 排名',type:'number'},{k:'rating',t:'评分',type:'number',step:'0.1'},
      {k:'note',t:'备注'}
    ]),onOk:async b=>{await DB.put('competitors',U.formValues(b))},after:()=>App.refresh()});
    root.querySelector('#cpCsv').onclick=()=>U.exportCSV('commander_competitors.csv',
      rows.map(r=>({ASIN:r.asin,名称:r.name,日期:r.date,价格:r.price,评论数:r.reviews,BSR:r.bsr,评分:r.rating})),
      ['ASIN','名称','日期','价格','评论数','BSR','评分']);
    root.querySelectorAll('[data-cd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该快照？',
      async()=>{await DB.del('competitors',Number(x.dataset.cd));App.refresh()}));
    const asins=Object.keys(byAsin).slice(0,5);
    const dates=Array.from(new Set(rows.map(r=>r.date))).sort();
    U.chart(document.getElementById('cCp'),{
      tooltip:{trigger:'axis'},legend:{top:0},grid:{left:60,right:20,top:30,bottom:30},
      xAxis:{type:'category',data:dates},yAxis:{type:'value'},
      series:asins.map(a=>({name:a,type:'line',smooth:true,
        data:dates.map(d=>{const r=byAsin[a].find(x=>x.date===d);return r?Number(r.price):null})}))
    });
  };

  /* ============ 18. 关键词词库 ============ */
  P.keywords=async root=>{
    const rows=(await DB.all('keywords')).filter(k=>k.kind==='关键词'||!k.kind);
    root.innerHTML=`<div class="card"><h3>关键词词库</h3>
      <div class="sub">手动沉淀核心词、长尾词与否定词；Listing 与广告共用同一词库</div>
      <div class="toolbar"><button class="btn" id="kwAdd">新增关键词</button>
        <button class="btn-ghost" id="kwCsv">导出 CSV</button></div>`+
      U.table({cols:[
        {t:'词',k:'term'},{t:'站点',k:'site'},
        {t:'类型',f:r=>U.tag(r.type||'核心词',(r.type==='否定词')?'red':((r.type==='长尾词')?'yellow':'green'))},
        {t:'月搜索量',k:'volume',num:true},
        {t:'当前排名',k:'rank',num:true},
        {t:'用途',f:r=>U.esc(r.usage||'')}
      ],rows,empty:'暂无关键词',
      actions:r=>`<button class="btn-ghost btn-sm" data-kwd="${r.id}">删除</button>`})+`</div>
      <div class="card"><h3>词库使用建议</h3>
        <div style="font-size:13px;line-height:1.9;color:var(--ink2)">
          核心词放标题前 80 字符与五点首句；长尾词放 Search Terms 与手动精准广告<br>
          否定词持续从搜索词报告里沉淀，高花费零转化的词及时否定<br>
          机器翻译的关键词会偏离真实搜索习惯，务必用母语习惯词
        </div></div>`;
    root.querySelector('#kwAdd').onclick=()=>U.modal({title:'新增关键词',body:U.formFields([
      {k:'term',t:'词'},{k:'site',t:'站点',type:'select',opts:['US','EU','JP'].map(v=>({v,t:v}))},
      {k:'type',t:'类型',type:'select',opts:['核心词','长尾词','否定词'].map(v=>({v,t:v}))},
      {k:'volume',t:'月搜索量',type:'number'},{k:'rank',t:'当前排名',type:'number'},
      {k:'usage',t:'用途',ph:'标题/五点/ST/广告'}
    ],{kind:'关键词'}),onOk:async b=>{const v=U.formValues(b);v.kind='关键词';await DB.put('keywords',v)},
      after:()=>App.refresh()});
    root.querySelector('#kwCsv').onclick=()=>U.exportCSV('commander_keywords.csv',
      rows.map(r=>({词:r.term,站点:r.site,类型:r.type||'核心词',月搜索量:r.volume,排名:r.rank,用途:r.usage})),
      ['词','站点','类型','月搜索量','排名','用途']);
    root.querySelectorAll('[data-kwd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该关键词？',
      async()=>{await DB.del('keywords',Number(x.dataset.kwd));App.refresh()}));
  };

  /* ============ 19. 合规中心 ============ */
  P.compliance=async root=>{
    const stores=await DB.all('stores'); const sm={}; stores.forEach(s=>sm[s.id]=s);
    const rows=(await DB.all('compliance')).filter(c=>App.inScope(c.storeId));
    rows.forEach(r=>{ r._d=U.diffDays(r.expireDate,U.today());
      r._lv=r._d<0?'red':(r._d<=(Number(r.reminderDays)||30)?'yellow':'green'); });
    rows.sort((a,b)=>a._d-b._d);
    root.innerHTML=`<div class="card"><h3>认证 / 税号 / 商标台账</h3>
      <div class="sub">合规是活下来的前提：无认证上架意味着下架 + 罚款风险；到期前自动进入异常提醒</div>
      <div class="toolbar"><button class="btn" id="cmAdd">新增条目</button>
        <button class="btn-ghost" id="cmCsv">导出 CSV</button></div>`+
      U.table({cols:[
        {t:'条目',k:'item'},{t:'类型',k:'type'},{t:'地区',k:'region'},
        {t:'店铺',f:r=>U.esc(sm[r.storeId]?sm[r.storeId].name:'—')},
        {t:'到期日',k:'expireDate'},
        {t:'剩余',num:true,f:r=>r._d<0?('已过期 '+(-r._d)+' 天'):(r._d+' 天')+' '+U.dot(r._lv)},
        {t:'状态',f:r=>U.esc(r.status||'—')}
      ],rows,empty:'暂无合规条目',
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button>
        <button class="btn-ghost btn-sm" data-d="${r.id}">删除</button>`})+`</div>
      <div class="card"><h3>政策提醒与检查清单</h3>
        <div style="font-size:13px;line-height:1.9;color:var(--ink2)">
          欧洲站：CE 认证、WEEE 注册、德国包装法、VAT（IOSS/OSS）缺一不可<br>
          美国站：各州 Sales Tax 经济关联判定、FCC（电子类）、CPC（儿童类）、FDA（食品化妆品）<br>
          日本站：PSE（电器）、食品卫生法、JCT 合规发票<br>
          通用红线：绝不刷评、不跟卖品牌、不用未授权图片与商标；侵权与操纵评论直接封号
        </div></div>`;
    const fields=[{k:'item',t:'条目名称'},
      {k:'type',t:'类型',type:'select',opts:['认证','税号','商标','政策','其他'].map(v=>({v,t:v}))},
      {k:'region',t:'地区',type:'select',opts:['US','EU','JP','UK','全球'].map(v=>({v,t:v}))},
      {k:'storeId',t:'店铺',type:'select',opts:stores.map(s=>({v:s.id,t:s.name}))},
      {k:'expireDate',t:'到期日',type:'date'},{k:'reminderDays',t:'提前提醒天数',type:'number',def:30},
      {k:'status',t:'状态',type:'select',opts:['有效','办理中','已过期'].map(v=>({v,t:v}))}];
    root.querySelector('#cmAdd').onclick=()=>U.modal({title:'新增合规条目',body:U.formFields(fields),
      onOk:async b=>{await DB.put('compliance',U.formValues(b))},after:()=>App.refresh()});
    root.querySelector('#cmCsv').onclick=()=>U.exportCSV('commander_compliance.csv',
      rows.map(r=>({条目:r.item,类型:r.type,地区:r.region,店铺:sm[r.storeId]?sm[r.storeId].name:'',
        到期日:r.expireDate,剩余天数:r._d,状态:r.status})),['条目','类型','地区','店铺','到期日','剩余天数','状态']);
    root.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>{
      const c=await DB.get('compliance',Number(x.dataset.e));
      U.modal({title:'编辑合规条目',body:U.formFields(fields,c),onOk:async b=>{
        const v=U.formValues(b);v.id=c.id;await DB.put('compliance',v)},after:()=>App.refresh()});
    });
    root.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>U.confirmBox('删除该条目？',
      async()=>{await DB.del('compliance',Number(x.dataset.d));App.refresh()}));
  };

  /* ============ 20. 数据与备份 ============ */
  P.data=async root=>{
    const counts={}; let total=0;
    for(const t of window.DB_TABLES){ const c=await DB.count(t); counts[t]=c; total+=c }
    const lastBackup=await DB.getSetting('lastBackup',null);
    root.innerHTML=
      U.kpi([
        {label:'总记录数',value:String(total)},
        {label:'表数量',value:String(window.DB_TABLES.length)},
        {label:'最近备份',value:lastBackup?lastBackup.slice(0,10):'未备份',level:lastBackup?'':'warn'}
      ])+
      `<div class="card"><h3>备份与恢复</h3>
        <div class="sub">数据只存在本机浏览器 IndexedDB；换电脑、清缓存前务必导出 JSON</div>
        <div class="toolbar">
          <button class="btn" id="bExp">导出全库 JSON</button>
          <button class="btn-ghost" id="bImp">导入 JSON（合并）</button>
          <button class="btn-ghost" id="bRep">导入 JSON（覆盖）</button>
          <button class="btn-ghost" id="bSeed">重置为演示数据</button>
          <button class="btn-danger" id="bClr">清空全部数据</button>
        </div>
        <div id="bInfo"></div>
      </div>
      <div class="card"><h3>各表记录数</h3>`+
      U.table({cols:[{t:'表',k:'t'},{t:'记录数',k:'c',num:true}],
        rows:window.DB_TABLES.map(t=>({t,c:counts[t]})),empty:''})+`</div>
      <div class="card"><h3>数据字典</h3>
        <div style="font-size:13px;line-height:1.9;color:var(--ink2)">
          stores 店铺 / products 产品与成本底座 / kpi_daily 每日 KPI / listings Listing 档案 / reviews 评论<br>
          ads 广告活动 / searchterms 搜索词 / inventory 库存 / ship_plans 入仓计划 / returns 退货 / claims 索赔<br>
          promos 促销 / compliance 合规 / nodes 旺季节点 / tasks 待办事项 / diagnosis_log 诊断记录<br>
          competitors 竞品快照 / keywords 关键词与素材 / candidates 选品候选 / patrol 巡店记录
        </div></div>`;
    root.querySelector('#bExp').onclick=async()=>{
      const obj=await DB.exportAll();
      U.download(`commander_backup_${U.today()}.json`,JSON.stringify(obj,null,2),'application/json');
      await DB.setSetting('lastBackup',new Date().toISOString()); U.toast('已导出'); App.refresh();
    };
    const doImport=(mode)=>{
      const inp=document.createElement('input'); inp.type='file'; inp.accept='.json';
      inp.onchange=async()=>{
        const f=inp.files[0]; if(!f) return;
        const txt=await f.text();
        try{
          await DB.importAll(JSON.parse(txt),mode);
          U.toast('导入完成'); App.refresh();
        }catch(e){U.toast('导入失败：'+e.message)}
      };
      inp.click();
    };
    root.querySelector('#bImp').onclick=()=>doImport('merge');
    root.querySelector('#bRep').onclick=()=>U.confirmBox('覆盖导入会清空现有数据，确定？',()=>doImport('replace'));
    root.querySelector('#bSeed').onclick=()=>U.confirmBox('清空现有数据并写入演示数据，确定？',async()=>{
      await DB.clearAll(); await window.DBSeed(); U.toast('已重置'); App.refresh();
    });
    root.querySelector('#bClr').onclick=()=>U.confirmBox('将清空全部本地数据且不可恢复，确定？',async()=>{
      await DB.clearAll(); U.toast('已清空'); App.refresh();
    });
    const info=root.querySelector('#bInfo');
    if(navigator.storage&&navigator.storage.estimate){
      navigator.storage.estimate().then(e=>{
        info.innerHTML=`<div style="font-size:12px;color:var(--ink2)">
          浏览器存储配额约 ${(e.quota/1048576).toFixed(0)} MB，当前已用约 ${((e.usage||0)/1048576).toFixed(2)} MB</div>`;
      });
    }
  };

  /* ============ 21. 设置与阈值 ============ */
  P.settings=async root=>{
    const cur=Object.assign({},U.R());
    root.innerHTML=`<div class="card"><h3>风险阈值设置</h3>
      <div class="sub">规则由你定义，系统严格执行；改完立即影响诊断、风险清单与异常排序</div>
      <div class="grid g3">${Object.keys(cur).map(k=>`
        <label class="f">${SETTING_LABEL[k]||k}<div style="margin-top:4px">
          <input name="${k}" type="number" value="${cur[k]}"></div></label>`).join('')}</div>
      <div class="toolbar" style="margin-top:12px">
        <button class="btn" id="sv">保存阈值</button>
        <button class="btn-ghost" id="rs">恢复默认</button>
      </div>
    </div>
    <div class="card"><h3>产品理念与使用边界</h3>
      <div style="font-size:13px;line-height:1.9;color:var(--ink2)">
        系统负责记录节点、汇总数据、倒推时间；人负责业务判断<br>
        先风险，后经营；先异常，后优化<br>
        本工具不调用亚马逊 API、不做爬虫、不上云，所有数据存于本机浏览器，换设备请先导出 JSON 备份
      </div></div>`;
    root.querySelector('#sv').onclick=async()=>{
      const o={}; root.querySelectorAll('[name]').forEach(el=>o[el.name]=Number(el.value));
      U.setRules(o); await DB.setSetting('rules',o); U.toast('阈值已保存'); App.refresh();
    };
    root.querySelector('#rs').onclick=async()=>{
      await DB.setSetting('rules',null); U.toast('已恢复默认'); App.refresh();
    };
  };
  const SETTING_LABEL={
    stockRed:'断货红线（可售天数）',stockYellow:'补货预警（可售天数）',
    marginRed:'净利率红线(%)',marginYellow:'净利率预警(%)',
    adShareYellow:'广告占比预警(%)',adShareRed:'广告占比红线(%)',
    returnRateYellow:'退货率预警(%)',returnRateRed:'退货率红线(%)',
    agingRed:'库龄红线(天)',agingYellow:'库龄预警(天)',
    nodeRedDays:'节点红色提醒(天)',nodeYellowDays:'节点黄色提醒(天)'
  };

  /* ============ 新增 SOP 页面：选品/财务/工具 ============ */
  P.profit=async root=>{
    const costFields=[
      {k:'name',t:'产品名称'},{k:'sku',t:'SKU'},
      {k:'price',t:'售价($)',type:'number',step:'0.01'},
      {k:'purchase',t:'采购成本($)',type:'number',step:'0.1'},
      {k:'firstLeg',t:'头程($)',type:'number',step:'0.1'},
      {k:'fbaFee',t:'FBA配送费($)',type:'number',step:'0.1'},
      {k:'commission',t:'佣金率(0-1)',type:'number',step:'0.01',def:0.15},
      {k:'storage',t:'仓储费($)',type:'number',step:'0.1'},
      {k:'returnLoss',t:'退货损耗率(0-1)',type:'number',step:'0.01',def:0.05},
      {k:'targetAcos',t:'目标ACOS(0-1)',type:'number',step:'0.01',def:0.25}
    ];
    const cols=[{t:'产品',k:'name'},{t:'SKU',k:'sku'},{t:'售价',k:'price',num:1,f:U.money},
      {t:'净利',k:'x',num:1,f:(v,r)=>U.money(r._net)},
      {t:'净利率',k:'x',num:1,f:(v,r)=>U.tag(U.pct(r._margin),U.marginColor(r._margin))},
      {t:'保本ACOS',k:'x',num:1,f:(v,r)=>U.pct(r._be)}];
    const draw=async()=>{
      const ps=await DB.all('products');
      root.querySelector('#t').innerHTML=U.table({cols,
        rows:ps.map(p=>{const r=U.profit(p);return Object.assign({},p,{_net:r.net,_margin:r.margin,_be:r.breakEvenAcos})}),
        actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑成本</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    };
    root.innerHTML=`${U.card('利润测算','逐 SKU 测算 FBA 净利、净利率与保本 ACOS；成本结构录入一次，广告 / 诊断 / 定价页共用此口径；本页金额为统一美元口径，人民币成本请先换算','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增产品</button><button class="btn-ghost" id="exp">导出 CSV</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增产品',body:U.formFields(costFields),
      onOk:b=>{const o=U.formValues(b);DB.put('products',{name:o.name,sku:o.sku,price:o.price,
        cost:{purchase:o.purchase,firstLeg:o.firstLeg,fbaFee:o.fbaFee,commission:o.commission||.15,storage:o.storage,returnLoss:o.returnLoss||.05,targetAcos:o.targetAcos||.25}}).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除该产品？',async()=>{await DB.del('products',Number(dl));await draw()});
      if(ed){const p=await DB.get('products',Number(ed));const c=p.cost||{};
        U.modal({title:'编辑成本 '+p.sku,body:U.formFields(costFields,{name:p.name,sku:p.sku,price:p.price,purchase:c.purchase,firstLeg:c.firstLeg,fbaFee:c.fbaFee,commission:c.commission,storage:c.storage,returnLoss:c.returnLoss,targetAcos:c.targetAcos}),
          onOk:b=>{const o=U.formValues(b);Object.assign(p,{name:o.name,sku:o.sku,price:o.price,cost:{purchase:o.purchase,firstLeg:o.firstLeg,fbaFee:o.fbaFee,commission:o.commission||.15,storage:o.storage,returnLoss:o.returnLoss||.05,targetAcos:o.targetAcos||.25}});DB.put('products',p).then(draw).then(()=>U.toast('已保存'))}})};
    };
    root.querySelector('#exp').onclick=()=>{DB.all('products').then(ps=>{const rows=ps.map(p=>{const r=U.profit(p);return{sku:p.sku,name:p.name,price:p.price,net:+r.net.toFixed(2),margin:+r.margin.toFixed(2),beAcos:+r.breakEvenAcos.toFixed(2)}});U.exportCSV('profit.csv',rows,['sku','name','price','net','margin','beAcos'])});};
  };

  P.finance=async root=>{
    const cols=[{t:'年月',k:'ym',f:(v,r)=>r.year+'-'+String(r.month).padStart(2,'0')},
      {t:'收入$',k:'revenue',num:1,f:U.money},{t:'产品成本$',k:'productCost',num:1,f:U.money},
      {t:'头程$',k:'headFreight',num:1,f:U.money},{t:'佣金$',k:'commission',num:1,f:U.money},
      {t:'FBA$',k:'fbaFee',num:1,f:U.money},{t:'广告$',k:'adSpend',num:1,f:U.money},
      {t:'退款$',k:'refunds',num:1,f:U.money},{t:'净利$',k:'netProfit',num:1,f:v=>U.tag(U.money(v),v>=0?'green':'red')}];
    const fields=[{k:'year',t:'年',type:'number'},{k:'month',t:'月',type:'number'},{k:'revenue',t:'收入$',type:'number'},
      {k:'productCost',t:'产品成本￥',type:'number'},{k:'headFreight',t:'头程￥',type:'number'},
      {k:'commission',t:'佣金$',type:'number'},{k:'fbaFee',t:'FBA$',type:'number'},
      {k:'adSpend',t:'广告$',type:'number'},{k:'refunds',t:'退款$',type:'number'}];
    const draw=async()=>{
      const rs=await DB.all('finance');
      root.querySelector('#t').innerHTML=U.table({cols,rows:rs,
        actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
      const el=root.querySelector('#ch'); if(el&&window.echarts){
        U.chart(el,{xAxis:{type:'category',data:rs.map(r=>r.year+'-'+String(r.month).padStart(2,'0'))},
          yAxis:{type:'value'},series:[{name:'收入',type:'bar',data:rs.map(r=>r.revenue),itemStyle:{color:'#1E5FA8'}},
            {name:'净利',type:'bar',data:rs.map(r=>r.netProfit),itemStyle:{color:'#27AE60'}}]});
      }
    };
    root.innerHTML=`${U.card('财务核算','月度收入 / 成本 / 费用 / 净利汇总（与亚马逊结算口径对齐，单位已标注币种）','')}
      <div class="toolbar"><button class="btn" id="add">+ 录入月度</button></div>
      <div id="ch" class="chart" style="height:260px"></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'录入月度财务',body:U.formFields(fields),
      onOk:b=>{const o=U.formValues(b);o.netProfit=+(o.revenue-o.productCost-o.headFreight-o.commission-o.fbaFee-o.adSpend-o.refunds).toFixed(2);DB.put('finance',o).then(draw).then(()=>U.toast('已录入'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('finance',Number(dl));await draw()});
      if(ed){const r=await DB.get('finance',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{const o=U.formValues(b);o.netProfit=+(o.revenue-o.productCost-o.headFreight-o.commission-o.fbaFee-o.adSpend-o.refunds).toFixed(2);Object.assign(r,o);DB.put('finance',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.kpiscore=async root=>{
    const cols=[{t:'指标',k:'name'},{t:'目标',k:'target'},{t:'实际',k:'actual',num:1},
      {t:'权重%',k:'weight',num:1},{t:'月份',k:'month'}];
    const fields=[{k:'name',t:'指标'},{k:'target',t:'目标'},{k:'actual',t:'实际'},
      {k:'weight',t:'权重%',type:'number'},{k:'month',t:'月份(如 2026-08)'}];
    const draw=async()=>{
      const rs=await DB.all('kpi_score');
      const total=rs.reduce((s,r)=>s+(Number(r.weight)||0),0);
      const sc=rs.reduce((s,r)=>{
        const t=parseFloat(String(r.target).replace(/[^0-9.\-]/g,'')); const a=parseFloat(String(r.actual).replace(/[^0-9.\-]/g,''));
        if(!isFinite(t)||!isFinite(a)) return s; const rate=t?a/t:1; return s+(rate>1?1:rate)*(Number(r.weight)||0);},0);
      root.querySelector('#t').innerHTML=U.table({cols,rows:rs,
        actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
      root.querySelector('#sum').innerHTML=`综合完成度 <b>${total?U.pct(sc/total*100):'—'}</b>（按权重加权）`;
    };
    root.innerHTML=`${U.card('KPI 绩效','运营人员 / 主管绩效考核，按目标与实际完成度加权计算综合得分','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增指标</button><span id="sum" style="margin-left:12px;color:var(--ink2);font-size:13px"></span></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增 KPI 指标',body:U.formFields(fields),
      onOk:b=>{DB.put('kpi_score',U.formValues(b)).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('kpi_score',Number(dl));await draw()});
      if(ed){const r=await DB.get('kpi_score',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('kpi_score',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.team=async root=>{
    const cols=[{t:'成员',k:'member'},{t:'角色',k:'role'},{t:'负责店铺',k:'stores'},{t:'职责',k:'duty'},
      {t:'状态',k:'status',f:v=>U.tag(v,v==='在职'?'green':(v==='请假'?'yellow':'gray'))}];
    const fields=[{k:'member',t:'成员'},{k:'role',t:'角色'},{k:'stores',t:'负责店铺'},
      {k:'duty',t:'职责'},{k:'status',t:'状态',type:'select',opts:[{v:'在职',t:'在职'},{v:'请假',t:'请假'},{v:'离职',t:'离职'}]}];
    const draw=async()=>root.querySelector('#t').innerHTML=U.table({cols,rows:await DB.all('team'),
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    root.innerHTML=`${U.card('团队管理','成员、角色、负责店铺与职责一目了然','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增成员</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增成员',body:U.formFields(fields),
      onOk:b=>{DB.put('team',U.formValues(b)).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('team',Number(dl));await draw()});
      if(ed){const r=await DB.get('team',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('team',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.toolbox=async root=>{
    const all=await DB.all('toolbox');
    const kinds=['全部',...Array.from(new Set(all.map(x=>x.kind)))];
    const render=kind=>{
      const rows=kind==='全部'?all:all.filter(x=>x.kind===kind);
      root.querySelector('#t').innerHTML=U.table({cols:[
        {t:'类型',k:'kind',f:v=>U.tag(v,'blue')},{t:'名称',k:'title'},
        {t:'内容 / 链接',k:'content',raw:1,f:(v,r)=>r.link?`<a href="${U.esc(r.link)}" target="_blank" style="color:var(--blue)">${U.esc(r.title)}</a> · ${U.esc(r.content)}`:U.esc(r.content)}
      ],rows,actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    };
    const fields=[{k:'kind',t:'类型'},{k:'title',t:'名称'},{k:'content',t:'内容',type:'textarea'},{k:'link',t:'链接(可选)'}];
    root.innerHTML=`${U.card('工具箱','AI 提示词、实用网站、发票模板等运营资产集中管理','')}
      <div class="toolbar" style="flex-wrap:wrap">${kinds.map(k=>`<button class="btn-ghost btn-sm" data-k="${k}">${U.esc(k)}</button>`).join('')}
        <button class="btn" id="add" style="margin-left:auto">+ 新增</button></div><div id="t"></div>`;
    render('全部');
    root.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>render(b.dataset.k));
    root.querySelector('#add').onclick=()=>U.modal({title:'新增工具',body:U.formFields(fields),
      onOk:b=>{DB.put('toolbox',U.formValues(b)).then(()=>location.reload())}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('toolbox',Number(dl));location.reload()});
      if(ed){const r=await DB.get('toolbox',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('toolbox',r).then(()=>location.reload())}})};
    };
  };

  window.Pages=Object.assign(window.Pages||{},P);
})();
