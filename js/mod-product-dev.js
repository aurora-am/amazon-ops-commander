/* Phase 3 batch 1 · 选品开发模块路由页（dev-selection / dev-competitor / dev-profit）
 * 纯前端 SPA：仅 IndexedDB，无后端/无 API/无爬虫。
 * 本文件只搭「数据无关的结构骨架」：导航、Tab 容器、子标签、表格、增删改、导出(XLSX/CSV)、公式字段只读。
 * 业务数字（FBA 202509 费率、头程费率、汇率权威来源、ABA 判定规则）均为可编辑设置 + TODO，不臆造真实数值。
 */
(function(){
  const P={}; const U=window.UI, DB=window.DB;
  const esc=U.esc;
  const num=(v,d)=>{const n=Number(v);return isFinite(n)?n:(d===undefined?null:d);};
  const DEFAULT_RATE=(U.RATES&&U.RATES.USD)?U.RATES.USD:6.71; // B5：默认指向 U.RATES.USD（记录级 rate 字段初始值，不全局硬编码）

  /* ---------- 字段定义辅助 ---------- */
  const F=(k,t,o)=>Object.assign({k,t},o||{});
  const N=(k,t,o)=>F(k,t,Object.assign({type:'number',step:'0.01'},o||{}));   // 数字
  const R=(k,t,o)=>F(k,t,Object.assign({readonly:true,num:true},o||{}));        // 公式只读
  const S=(k,t,opts)=>F(k,t,{type:'select',opts});
  const opt=(v,t)=>({v:v,t:t==null?v:t});
  const URLF=(k,t)=>F(k,t,{type:'text',ph:'图片 URL'});

  /* ---------- 计算公式（已知部分直接实现，待确认部分留 TODO） ---------- */
  const W={mktSize:.2,compete:.15,priceBand:.15,margin:.2,compliance:.15,supply:.15}; // B1 权重（沿用）
  function computeScore(r){
    let s=0; for(const k in W) s+=(num(r[k])||0)*W[k];
    r._score=+(s*10).toFixed(1);
    r._adv=r._score>=75?'优先打爆':(r._score>=55?'可上架':'观望');
  }
  function computeBadRate(r){ r.badRate = r.reviews ? (num(r.badReviews)||0)/num(r.reviews) : null; }

  function computeProfitCheck(r){
    const v=U.profitV2({price:r.price$, purchase:r.purchase$, firstLeg:r.firstLeg$, fbaFee:r.fbaFee$,
      commission:r.commission$, refund:r.refund$, ad:r.ad$, storageOther:r.storageOther$, promo:r.promo$, rate:r.rate});
    r.cost$=v.cost$; r.profit$=v.profit$; r.profitRmb=+v.profitRmb.toFixed(2);
    r.netPct=v.netPct==null?null:+v.netPct.toFixed(2);
    r.breakEvenAcos=v.breakEvenAcos==null?null:+v.breakEvenAcos.toFixed(2);
  }
  function computeCompGross(r){
    const price=num(r.price), purchase=num(r.purchase), firstLeg=num(r.firstLeg),
      fba=num(r.fba), commission=num(r.commission), afterSale=num(r.afterSale);
    const gross=price-purchase-firstLeg-fba-commission-(afterSale||0);
    r.gross=+gross.toFixed(2);
    r.grossPct=price?+(gross/price*100).toFixed(2):null;
  }
  function computeResearchProfit(r){
    const price=num(r.priceUsd)||num(r.priceLocal); if(price==null) return;
    const cost=num(r.costUsd), firstLeg=num(r.firstLeg), fba=num(r.fba), tariff=num(r.tariffUs);
    const comm=price*num(r.commPct,12)/100;
    const gross=price-cost-firstLeg-fba-tariff-comm;
    r.grossUsd=+gross.toFixed(2);
    r.grossPct=+(gross/price*100).toFixed(2);
    // TODO L5: netPct 扣除全年推广费与退款，待用户确认口径后校准
    const promo=num(r.promoYear), refund=num(r.refundPct);
    r.netPct=(promo!=null||refund!=null)?+((gross-(promo||0)-(refund||0))/price*100).toFixed(2):null;
  }
  function computeDevUsFba(r){
    const priceUsd=num(r.price$), rate=num(r.rate,DEFAULT_RATE); if(priceUsd==null) return;
    const salesRmb=priceUsd*rate;
    const fba=num(r.fbaWeight$)+num(r.fbaHandling$)+num(r.fbaPick$);
    const comm=priceUsd*num(r.commPct,15)/100;
    const gross=salesRmb-num(r.purchaseRmb)-num(r.firstLegRmb)-fba-comm;
    r.grossRmb=+gross.toFixed(2);
    r.grossPct=salesRmb?+(gross/salesRmb*100).toFixed(2):null;
  }
  function computeDevGross(r){
    const price=num(r.price); if(price==null) return;
    const buy=num(r.buyPrice)||num(r.costRmb); // 前台/后台：售价 - 采购价 占位（精确口径待确认）
    const gross=price-buy; r.gross=+gross.toFixed(2);
    r.grossPct=price?+(gross/price*100).toFixed(2):null;
  }
  // L4 选品利润指标——按利润预估表2.0 口径对齐：commissionRmb=平台佣金$×汇率；amzShipRmb=FBA配送费$×汇率；taxRmb=关税$×汇率；netReceive=售价−佣金−FBA−预扣(广告+退货)。仓储其他/其他促销 模板有但 L4 暂未单列
  function computeProfitMetrics(r){
    // 汇率：记录级可编辑；未填时按货币从 U.RATES 取默认（USD 兜底 DEFAULT_RATE）
    if(r.rate==null || r.rate===''){
      const code={'美元':'USD','英镑':'GBP','欧元':'EUR','加元':'CAD','墨西哥比索':'MXN','日元':'JPY'}[r.currency];
      r.rate=(code && U.RATES && U.RATES[code]!=null) ? U.RATES[code] : DEFAULT_RATE;
    }
    const rate=num(r.rate,DEFAULT_RATE);
    const priceRmb=num(r.price)*rate;
    // 头程：未填 firstLegRmb 时，按渠道 × 计费重量（实重与体积重取大）÷6000 由 U.firstLegCost 估算
    if(r.firstLegRmb==null || r.firstLegRmb===''){
      const realKg=num(r.weightG)/1000;
      const vl=num(r.volL), vw=num(r.volW), vh=num(r.volH);
      const volKg=(vl&&vw&&vh)?U.volWeight(vl,vw,vh,6000):0;
      const chgKg=Math.max(realKg, volKg);
      const ch={'空运':'air','专线':'seaExpress','海运':'seaExpress','铁运':'seaTruck','卡航':'seaTruck'}[r.channel]||'seaExpress';
      r.firstLegRmb=U.firstLegCost(chgKg, ch);
    }
    const firstLeg=num(r.firstLegRmb)||0, cost=num(r.costRmb)||0;
    const preDeduct=num(r.preDeduct); const pd=(preDeduct==null)?priceRmb*(0.07+0.05):preDeduct; // 广告7%+退货5%
    const fx=num(r.fxLoss); const fl=(fx==null)?priceRmb*0.01:fx; // 汇损1% 占位（L4 待确认）
    // —— 按利润预估表2.0 口径补全 L4 四项指标（模板：平台佣金$=售价$×佣金率%；FBA配送费$录入项；模板无税列，税=关税$×汇率）——
    const commPct=num(r.commPct,15);                                  // 平台佣金率%（模板默认15%）
    const commissionRmb=num(r.price)*commPct/100*rate;                 // 平台佣金$ × 汇率
    const fbaFee$=num(r.fbaFee$);                                      // FBA配送费$（模板列G，直接录入）
    const amzShipRmb=(fbaFee$!=null?fbaFee$:0)*rate;                   // 亚马逊配送费￥
    const tariff$=num(r.tariff$);                                       // 关税$（美线进口税；模板无单列，参考 research 表 tariffUs）
    const taxRmb=(tariff$!=null?tariff$:0)*rate;                       // 税/关税￥
    const profit=priceRmb-cost-firstLeg-amzShipRmb-taxRmb-commissionRmb-pd-fl;
    r.priceRmb=+priceRmb.toFixed(2);
    r.commissionRmb=+commissionRmb.toFixed(2);
    r.amzShipRmb=+amzShipRmb.toFixed(2);
    r.taxRmb=+taxRmb.toFixed(2);
    r.preDeduct=+pd.toFixed(2); r.fxLoss=+fl.toFixed(2);
    r.profitRmb=+profit.toFixed(2);
    r.profitRatio=priceRmb?+(profit/priceRmb*100).toFixed(2):null;
    // netReceive 后台到账 = 售价￥ − 佣金￥ − FBA￥ − 预扣(广告+退货)；不含采购/头程/关税/汇损（那些是成本与汇损，已计入 profitRmb）
    r.netReceive=+((priceRmb-commissionRmb-amzShipRmb-pd)).toFixed(2);
  }

  /* ---------- 尺寸/币种解析辅助（供 profit 类 compute 调用 U.* 公式） ---------- */
  // 解析 "30x20x10" / "30×20×10" / "30*20*10" → [l,w,h]（数值，单位保持原样）
  function parseTriple(str){
    if(str==null) return null;
    const m=String(str).split(/[x×*]/).map(s=>Number(s.trim())).filter(n=>isFinite(n)&&n>0);
    return m.length>=3 ? m.slice(0,3) : (m.length===1 ? [m[0],m[0],m[0]] : null);
  }
  const CM2INCH=0.393701;
  // FBA tier 文本（key 或 中文标签 或 旧值'标准'/'大件'/'超大件'）→ 规范 tier key
  function fbaTierKey(val){
    if(!val) return null;
    const FR=U.FBA_RATES; if(!FR) return null;
    const keys={'smallStandard':'smallStandard','largeStandard':'largeStandard','smallBulky':'smallBulky','largeBulky':'largeBulky',
      'oversize-0-50':'oversize-0-50','oversize-50-70':'oversize-50-70','oversize-70-150':'oversize-70-150','oversize-150plus':'oversize-150plus'};
    if(keys[val]) return val;
    const label2key={};
    Object.keys(FR.tiers).forEach(k=>{ if(k!=='oversize') label2key[FR.tiers[k].label]=k; });
    Object.keys(FR.tiers.oversize.bands).forEach(b=>{ label2key[FR.tiers.oversize.bands[b].label]='oversize-'+b; });
    if(label2key[val]) return label2key[val];
    if(val==='标准') return 'largeStandard';     // 旧 seed 值兼容
    if(val==='小号标准') return 'smallStandard';
    if(val==='大件') return 'largeBulky';
    if(val==='超大件') return 'oversize-0-50';
    return null;
  }

  // 1-产品尺寸录入表：头程抛重(÷6000/÷5000) + 输入尺寸自动算 FBA 分段/计费重/配送费（用户亦可在 feeCheck 手填覆盖）
  function computeSize(r){
    // 头程抛重（cm）：优先用包装尺寸，回退产品尺寸
    const cmTriple = parseTriple(r.pkgSizeCm) || parseTriple(r.sizeCm);
    if(cmTriple){
      const v=cmTriple[0]*cmTriple[1]*cmTriple[2];
      r.volDiv6000=+(v/6000).toFixed(3);
      r.volDiv5000=+(v/5000).toFixed(3);
    }
    // FBA 分段/计费重/配送费：由包装 inch 尺寸（pkgSizeCm）+ 包装实重(lb) 自动算
    const pkgCm=parseTriple(r.pkgSizeCm);
    if(pkgCm && r.pkgWeightLb!=null){
      const dims={ l:pkgCm[0]*CM2INCH, w:pkgCm[1]*CM2INCH, h:pkgCm[2]*CM2INCH, weightLb:num(r.pkgWeightLb) };
      const est=U.fbaEstimate(dims, {priceBand:'mid', includeSurcharge:true});
      r.fbaTier=U.fbaTierLabel(est.tier);          // 中文标签，便于阅读
      r.fbaChargeWtLb=est.chargeableLb;            // 计费重量 lb
      r.estFee=est.fee;                            // 预估 FBA 配送费 $（含 3.5% 燃油附加费）
    }
  }
  // 2-配送费预估核对：用户手填 FBA 尺寸分段 + 计费重量 → 自动算预估配送费（fbaRealFee 仍由用户填实际值覆盖）
  function computeFeeCheck(r){
    if(r.fbaTier && r.fbaWeightLb!=null){
      const key=fbaTierKey(r.fbaTier);
      if(key){
        const fee=U.fbaFee(key, num(r.fbaWeightLb), {priceBand:'mid', includeSurcharge:true});
        if(fee!=null) r.estFee=fee;
      }
    }
  }
  // ABA 汇总：录入 q1-q4 后自动判定 trend/capacity/recommend + 无参数统计
  function computeAbaRow(r){
    const res=U.computeAba(r);
    r.trend=res.trend; r.capacity=res.capacity; r.recommend=res.recommend;
    const ranks=[r.rankQ1,r.rankQ2,r.rankQ3,r.rankQ4].map(x=>Number(x));
    r.noParamSum=ranks.filter(x=>isFinite(x)&&x===10000).length; // 无参数(=10000)季度计数
  }

  /* ---------- 通用单表挂载（toolbar + 表格 + 增删改 + 导出） ---------- */
  function mountSheet(cfg, bodyEl){
    async function draw(){
      bodyEl.innerHTML='<div class="empty">加载中…</div>';
      let rows=await DB.all(cfg.store);
      if(cfg.sheet) rows=rows.filter(r=>r.sheet===cfg.sheet);
      rows.forEach(r=>cfg.compute&&cfg.compute(r));
      const cols=cfg.cols||cfg.fields.map(f=>({t:f.t,k:f.k,num:(f.type==='number'||f.num)||false,raw:f.raw,f:f.f}));
      bodyEl.innerHTML=`<div class="card"><h3>${esc(cfg.title||cfg.label)}</h3>`+
        (cfg.sub?`<div class="sub">${esc(cfg.sub)}</div>`:'')+
        `<div class="toolbar"><button class="btn" id="addBtn">+ 新增</button>
          <button class="btn-ghost" id="expX">导出 Excel</button>
          <button class="btn-ghost" id="expC">导出 CSV</button></div>`+
        U.table({cols,rows,empty:cfg.empty||'暂无数据',
          actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button>
            <button class="btn-ghost btn-sm" data-d="${r.id}">删除</button>`})+
        `</div>`;
      const headers=cfg.fields.map(f=>({key:f.k,label:f.t}));
      bodyEl.querySelector('#addBtn').onclick=()=>{
        const v0={}; if(cfg.sheet) v0.sheet=cfg.sheet;
        U.modal({title:cfg.addTitle||('新增 · '+(cfg.title||cfg.label)),body:U.formFields(cfg.fields,v0),
          onOk:async b=>{ let v=U.formValues(b); if(cfg.pack) v=cfg.pack(v);
            if(cfg.sheet) v.sheet=cfg.sheet; if(cfg.compute) cfg.compute(v);
            await DB.put(cfg.store,v); U.toast('已保存'); },after:draw});
      };
      bodyEl.querySelector('#expX').onclick=()=>{
        const exRows=rows.map(r=>{const o={}; headers.forEach(h=>o[h.key]=r[h.key]); return o;});
        U.exportXLSX((cfg.xlsxName||cfg.label||cfg.title||'export')+'.xlsx',
          [{name:(cfg.label||cfg.title||'Sheet').slice(0,31),rows:exRows,headers}]);
      };
      bodyEl.querySelector('#expC').onclick=()=>{
        const exRows=rows.map(r=>{const o={}; headers.forEach(h=>o[h.key]=r[h.key]); return o;});
        U.exportCSV((cfg.xlsxName||cfg.label||cfg.title||'export')+'.csv',exRows,headers.map(h=>h.label));
      };
      bodyEl.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>{
        const rec=await DB.get(cfg.store,Number(x.dataset.e)); if(cfg.compute) cfg.compute(rec);
        U.modal({title:cfg.editTitle||('编辑 · '+(cfg.title||cfg.label)),body:U.formFields(cfg.fields,rec),
          onOk:async b=>{ let v=U.formValues(b); v.id=rec.id; if(cfg.pack) v=cfg.pack(v);
            if(cfg.sheet) v.sheet=cfg.sheet; if(cfg.compute) cfg.compute(v);
            await DB.put(cfg.store,v); U.toast('已保存'); },after:draw});
      });
      bodyEl.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>U.confirmBox('删除该记录？',
        async()=>{ await DB.del(cfg.store,Number(x.dataset.d)); draw(); }));
    }
    draw();
  }

  /* ---------- 多 sheet 子标签挂载（B9：子标签切换 + 导出保持多 sheet） ---------- */
  function mountSubTabs(sheetCfgs, bodyEl, title){
    let cur=sheetCfgs[0].key;
    bodyEl.innerHTML=`<div class="card"><h3>${esc(title)}</h3>
      <div class="sub">多 sheet 子标签切换（B9）；「导出 Excel」一次导出全部 sheet</div>
      <div class="toolbar"><button class="btn" id="addBtn">+ 新增（当前 sheet）</button>
        <button class="btn-ghost" id="expX">导出 Excel（全部 sheet）</button>
        <button class="btn-ghost" id="expC">导出 CSV（当前 sheet）</button></div>`+
      U.subTabs(sheetCfgs)+`</div>`;
    const subBody=bodyEl.querySelector('.sub-body');
    async function drawSheet(cfg){
      subBody.innerHTML='<div class="empty">加载中…</div>';
      let rows=await DB.all(cfg.store);
      if(cfg.sheet) rows=rows.filter(r=>r.sheet===cfg.sheet);
      rows.forEach(r=>cfg.compute&&cfg.compute(r));
      const cols=cfg.cols||cfg.fields.map(f=>({t:f.t,k:f.k,num:(f.type==='number'||f.num)||false,raw:f.raw,f:f.f}));
      subBody.innerHTML=U.table({cols,rows,empty:cfg.empty||'暂无数据',
        actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button>
          <button class="btn-ghost btn-sm" data-d="${r.id}">删除</button>`});
      subBody.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>{
        const rec=await DB.get(cfg.store,Number(x.dataset.e)); if(cfg.compute) cfg.compute(rec);
        U.modal({title:cfg.editTitle||('编辑 · '+cfg.label),body:U.formFields(cfg.fields,rec),
          onOk:async b=>{ let v=U.formValues(b); v.id=rec.id; if(cfg.sheet) v.sheet=cfg.sheet;
            if(cfg.compute) cfg.compute(v); await DB.put(cfg.store,v); U.toast('已保存'); },after:()=>drawSheet(cfg)});
      });
      subBody.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>U.confirmBox('删除该记录？',
        async()=>{ await DB.del(cfg.store,Number(x.dataset.d)); drawSheet(cfg); }));
    }
    const curCfg=()=>sheetCfgs.find(s=>s.key===cur);
    bodyEl.querySelector('#addBtn').onclick=()=>{
      const cfg=curCfg(); const v0={}; if(cfg.sheet) v0.sheet=cfg.sheet;
      U.modal({title:'新增 · '+cfg.label,body:U.formFields(cfg.fields,v0),
        onOk:async b=>{ let v=U.formValues(b); if(cfg.sheet) v.sheet=cfg.sheet; if(cfg.compute) cfg.compute(v);
          await DB.put(cfg.store,v); U.toast('已保存'); },after:()=>drawSheet(cfg)});
    };
    bodyEl.querySelector('#expX').onclick=async()=>{
      const sheets=[];
      for(const cfg of sheetCfgs){
        let rows=await DB.all(cfg.store);
        if(cfg.sheet) rows=rows.filter(r=>r.sheet===cfg.sheet);
        rows.forEach(r=>cfg.compute&&cfg.compute(r));
        const headers=cfg.fields.map(f=>({key:f.k,label:f.t}));
        const exRows=rows.map(r=>{const o={}; headers.forEach(h=>o[h.key]=r[h.key]); return o;});
        sheets.push({name:cfg.label.slice(0,31),rows:exRows,headers});
      }
      U.exportXLSX((title||'export')+'.xlsx',sheets);
    };
    bodyEl.querySelector('#expC').onclick=async()=>{
      const cfg=curCfg(); let rows=await DB.all(cfg.store); if(cfg.sheet) rows=rows.filter(r=>r.sheet===cfg.sheet);
      rows.forEach(r=>cfg.compute&&cfg.compute(r));
      const headers=cfg.fields.map(f=>({key:f.k,label:f.t}));
      const exRows=rows.map(r=>{const o={}; headers.forEach(h=>o[h.key]=r[h.key]); return o;});
      U.exportCSV((cfg.xlsxName||cfg.label)+'.csv',exRows,headers.map(h=>h.label));
    };
    U.bindSubTabs(bodyEl, sheetCfgs, subBody, (s,k,b)=>{ cur=k; const cfg=s.find(x=>x.key===k); drawSheet(cfg); });
    drawSheet(curCfg());
  }

  /* ===================== 页面 1 · dev-selection ===================== */
  const CAND_FIELDS=[
    N('mktSize','市场规模(1-10)'),N('compete','竞争度(1-10)'),N('priceBand','价格带(1-10)'),
    N('margin','毛利空间(1-10)'),N('compliance','合规风险(1-10)'),N('supply','供应链(1-10)'),
    F('name','候选品名称'),S('site','站点',['US','EU','JP'].map(opt)),F('category','类目'),
    F('note','备注',{type:'textarea'}),
    R('_score','综合分',{f:r=>r._score==null?'—':U.f2(r._score)}),
    R('_adv','建议',{f:r=>r._adv?U.tag(r._adv,r._adv==='优先打爆'?'green':(r._adv==='可上架'?'yellow':'gray')):''})
  ];
  const CAND_CFG={store:'candidates',title:'选品立项（候选评分卡）',sub:'六维(1-10)加权自动算综合分与建议（B1）',
    fields:CAND_FIELDS, compute:computeScore, empty:'暂无候选品，点击「新增」',
    xlsxName:'选品立项',
    cols:[
      {t:'候选品',k:'name'},{t:'站点',k:'site'},{t:'类目',k:'category'},
      {t:'综合分',k:'_score',num:true,f:r=>r._score==null?'—':U.f2(r._score)},
      {t:'建议',k:'_adv',f:r=>r._adv?U.tag(r._adv,r._adv==='优先打爆'?'green':(r._adv==='可上架'?'yellow':'gray')):''},
      {t:'备注',k:'note'}
    ]};
  const PROJ_CFG={store:'project_progress',title:'立项进度（项目检视表）',
    fields:[
      F('progress','选品项目进展'),F('candidateId','关联候选品ID',{type:'number',ph:'candidates.id'}),
      F('startDate','开始时间',{type:'date'}),F('doneDate','完成时间',{type:'date'}),
      F('note','完成情况说明',{type:'textarea'})
    ], empty:'暂无立项进度', xlsxName:'选品立项-进度'};

  const MARKET_SHEETS=[
    {key:'cat',label:'大类目筛选',store:'market_analysis',sheet:'cat',
      fields:[F('catName','确定类目'),N('ratio','各类目占比'),N('china','中国'),N('us','美国')],empty:'暂无数据'},
    {key:'faq',label:'常见问题筛选',store:'market_analysis',sheet:'faq',
      fields:[F('qType','类型'),F('summary','综合说明',{type:'textarea'}),F('note','备注',{type:'textarea'})],empty:'暂无数据'},
    {key:'trend',label:'趋势图',store:'market_analysis',sheet:'trend',
      fields:[URLF('googleTrend','谷歌趋势图'),URLF('aliIndex','阿里采购指数')],empty:'暂无数据'},
    {key:'kw1src',label:'关键词1—数据源',store:'market_analysis',sheet:'kw1src',
      fields:[F('asin','ASIN'),F('brand','品牌'),F('country','国家'),N('monthSales','月销量'),N('monthAmt','月销售额'),
        N('bsr','BSR排名'),N('price','价格'),R('marginPct','毛利率%',{f:r=>r.marginPct==null?'—':U.pct(r.marginPct)}),
        N('fbaFee','FBA运费'),N('rating','评分'),N('reviews','评论数'),N('rev30','近30天评论'),N('onDays','上架天数'),
        F('bb','BB卖家'),R('monopolyPct','前十垄断%',{f:r=>r.monopolyPct==null?'—':U.pct(r.monopolyPct)}),N('cap','关键词市场容量')],
      empty:'暂无数据'},
    {key:'top100src',label:'TOP100—数据源',store:'market_analysis',sheet:'top100src',
      fields:[F('pName','商品名称'),F('brand','品牌'),F('cat','品类'),N('bsr','BSR排名'),N('price','价格'),N('rating','评分'),
        N('reviews','评论数'),N('dSales','预估日销量'),N('mSales','预估月销量'),N('mAmt','预估月销售额'),
        R('margin','毛利率',{f:r=>r.margin==null?'—':U.pct(r.margin)}),N('fbaFee','FBA运费'),N('rev30','近30天评论'),
        N('onDays','上架天数'),F('bb','BB卖家'),F('asin','ASIN'),URLF('link','Link')],empty:'暂无数据'},
    {key:'kw1dim',label:'关键词1—维度分析',store:'market_analysis',sheet:'kw1dim',
      fields:[N('cap','关键词市场容量'),R('top10Mono','前十垄断',{f:r=>r.top10Mono==null?'—':U.pct(r.top10Mono)}),
        F('priceRange','主要价格区间'),F('reviewDist','评论数分布'),F('onDist','上架时间分布'),
        F('ratingDist','评分分布'),F('feeDist','运费分布'),F('revRateDist','留评率分布')],empty:'暂无数据'},
    {key:'topDaily',label:'top日单量分析',store:'market_analysis',sheet:'topDaily',
      fields:[N('rank','排名'),N('dSales','日单量'),F('brand','品牌'),F('asin','ASIN'),N('onDays','上架天数'),
        N('price','售价$'),N('fee','运费'),N('revRate','留评率'),R('sharePct','品牌占有率%',{f:r=>r.sharePct==null?'—':U.pct(r.sharePct)})],
      empty:'暂无数据'},
    {key:'profit',label:'利润表',store:'market_analysis',sheet:'profit',
      fields:[N('dSales','日销量'),N('price','售价'),N('rate','汇率',{def:DEFAULT_RATE}),N('cost','成本'),
        N('weightKg','重量kg'),N('fba','FBA($/￥)'),N('commission','佣金'),N('loss','退款'),N('airFee','空运头程'),
        N('seaFee','海运头程'),N('totalCost','总成本'),R('profit','利润',{f:r=>r.profit==null?'—':U.money(r.profit)}),
        R('profitPct','利润率%',{f:r=>r.profitPct==null?'—':U.pct(r.profitPct)}),
        R('airRoi','空运ROI%',{f:r=>r.airRoi==null?'—':U.pct(r.airRoi)}),
        R('seaRoi','海运ROI%',{f:r=>r.seaRoi==null?'—':U.pct(r.seaRoi)})],
      empty:'暂无数据'},
    {key:'top100comp',label:'TOP100—竞品及店铺分析',store:'market_analysis',sheet:'top100comp',
      fields:[F('country','国家'),URLF('img','图片'),F('pName','产品名'),F('kw','关键词'),N('kwRank','关键词类目排名'),
        N('cpCount','竞品数量'),URLF('saleLink','销售链接'),F('seller','主要卖家'),N('onDays','上架天数'),
        N('reviews','单品reviews'),N('price','售价$'),URLF('buyLink','采购链接'),N('buyPrice','采购价格￥'),
        N('shipFee','运费$'),N('weightKg','重量kg'),N('gross','毛利$'),R('grossPct','毛利率%',{f:r=>r.grossPct==null?'—':U.pct(r.grossPct)}),
        N('rev30Total','近30天总')],empty:'暂无数据'},
    {key:'supplier',label:'供应商采购信息',store:'market_analysis',sheet:'supplier',
      fields:[N('seq','序列'),URLF('img1','产品图片1'),URLF('img2','产品图片2'),F('company','公司名称'),
        F('contact','联系人'),F('tel','电话'),F('addr','地址'),URLF('web','网址'),N('buyPrice','采购价￥'),
        N('targetPrice','对标售价$'),F('param1','款式参数1'),F('param2','款式参数2')],empty:'暂无数据'},
    {key:'feasibility',label:'可行性及竞争度',store:'market_analysis',sheet:'feasibility',
      fields:[N('salesRatio','销量占比'),N('maySales','5月销售大盘'),N('forecast','未来大盘预测'),F('ratioAna','销量占比分析')],empty:'暂无数据'},
    {key:'otherPlat',label:'其他平台类目分析',store:'market_analysis',sheet:'otherPlat',
      fields:[URLF('web','网页'),F('kw','关键词'),F('note','注释'),F('kwSearch','关键词搜索')],empty:'暂无数据'}
  ];

  const ABA_SHEETS=[
    {key:'summary',label:'汇总',store:'aba_keywords',sheet:'summary',
      compute:computeAbaRow,
      fields:[F('term','搜索词'),N('rankQ1','排名1-3月'),N('rankQ2','排名4-6月'),N('rankQ3','排名7-9月'),
        N('rankQ4','排名10-12月'),N('rank10000','排名10000'),R('noParamSum','无参数总和',{f:r=>r.noParamSum==null?'—':r.noParamSum}),
        R('trend','趋势',{f:r=>r.trend||'—'}),R('capacity','容量',{f:r=>r.capacity||'—'}),R('recommend','推荐',{f:r=>r.recommend||'—'})],empty:'暂无数据'},
    {key:'q1',label:'1-3月',store:'aba_keywords',sheet:'q1',
      fields:[N('seq','序列'),F('term','搜索词'),N('rank','搜索频率排名')],empty:'暂无数据'},
    {key:'q2',label:'4-6月',store:'aba_keywords',sheet:'q2',
      fields:[N('seq','序列'),F('term','搜索词'),N('rank','搜索频率排名')],empty:'暂无数据'},
    {key:'q3',label:'7-9月',store:'aba_keywords',sheet:'q3',
      fields:[N('seq','序列'),F('term','搜索词'),N('rank','搜索频率排名')],empty:'暂无数据'},
    {key:'q4',label:'10-12月',store:'aba_keywords',sheet:'q4',
      fields:[N('seq','序列'),F('term','搜索词'),N('rank','搜索频率排名')],empty:'暂无数据'},
    {key:'y2020',label:'2020年',store:'aba_keywords',sheet:'y2020',
      fields:[N('seq','序列'),F('term','搜索词'),N('rank','搜索频率排名')],empty:'暂无数据'},
    {key:'dedup',label:'去重词库(Sheet2)',store:'aba_keywords',sheet:'dedup',
      fields:[N('seq','序列'),F('term','搜索词'),F('dedup','去重')],empty:'暂无数据'}
  ];

  const RESEARCH_SHEETS=[
    {key:'market',label:'市场分析',store:'research',sheet:'market',
      fields:[F('brand','品牌'),N('dSales','日销量'),N('mSales','月销量'),N('mSalesAmt','月销售额'),N('asinCount','计数项ASIN'),
        R('sharePct','市场份额%',{f:r=>r.sharePct==null?'—':U.pct(r.sharePct)})],empty:'暂无数据'},
    {key:'comp',label:'竞品分析',store:'research',sheet:'comp',
      fields:[F('brand','品牌'),F('asin','ASIN'),R('sharePct','市场份额%',{f:r=>r.sharePct==null?'—':U.pct(r.sharePct)}),
        URLF('link','Link'),URLF('mainImg','主图'),F('subRank','小类排名'),F('mainRank','大类排名'),N('reviews','review数'),
        N('rating','评分'),N('price','价格$'),N('onDays','上线天数'),N('dSales','预估日销'),N('mSales','预估月销'),
        N('mAmt','预估月销售额'),F('tech','技术'),F('sellingPoint','卖点',{type:'textarea'}),F('complaint','客诉点',{type:'textarea'}),F('note','备注',{type:'textarea'})],
      empty:'暂无数据'},
    {key:'compBrand',label:'竞品品牌分析',store:'research',sheet:'compBrand',
      fields:[F('brand','竞品品牌'),F('segment','细分市场'),R('sharePct','市场份额%',{f:r=>r.sharePct==null?'—':U.pct(r.sharePct)}),F('metric','指标'),F('status','情况')],empty:'暂无数据'},
    {key:'scene',label:'用户场景分析',store:'research',sheet:'scene',
      fields:[F('kw','关键词'),N('num','数量'),R('ratio','占比%',{f:r=>r.ratio==null?'—':U.pct(r.ratio)}),
        F('group','用户群体'),F('scene','使用场景'),F('feature','功能特点')],empty:'暂无数据'},
    {key:'need',label:'用户需求分析',store:'research',sheet:'need',
      fields:[F('brand','Brand'),F('asin','Asin'),F('badType','差评类型'),R('ratio','占比%',{f:r=>r.ratio==null?'—':U.pct(r.ratio)}),N('total','总计')],empty:'暂无数据'},
    {key:'test',label:'产品测试报告',store:'research',sheet:'test',
      fields:[URLF('img','产品示图'),F('summary','测试汇总',{type:'textarea'}),F('note','备注',{type:'textarea'}),F('testItems','测试项',{type:'textarea'})],empty:'暂无数据'},
    {key:'profit',label:'利润分析',store:'research',sheet:'profit',
      fields:[F('shipMode','运输方式'),F('country','国家'),F('size','size'),N('priceLocal','售价(当地)'),N('rate','汇率',{def:DEFAULT_RATE}),
        N('priceUsd','售价$'),N('costUsd','产品成本$'),N('firstLeg','头程$'),N('fba','FBA发货费'),N('tariffUs','美国关税'),
        N('commPct','佣金率%'),N('refundPct','退款率%'),N('promoYear','全年推广费'),
        R('netPct','净利率%(扣12%佣金)',{f:r=>r.netPct==null?'—':U.pct(r.netPct)}),
        R('grossUsd','毛利$',{f:r=>r.grossUsd==null?'—':U.money(r.grossUsd)}),
        R('grossPct','平台毛利率%',{f:r=>r.grossPct==null?'—':U.pct(r.grossPct)}),F('note','备注',{type:'textarea'})],
      compute:computeResearchProfit,empty:'暂无数据'},
    {key:'io',label:'投入产出表',store:'research',sheet:'io',
      fields:[F('product','产品'),F('stage','阶段'),F('goal','阶段目标'),N('eta','预计时间'),N('mktIn','营销站内'),N('mktOut','营销站外'),
        N('total','合计'),F('action','动作',{type:'textarea'}),N('saleEstD','销售预计日'),N('saleEstM','销售预计月')],empty:'暂无数据'},
    {key:'source',label:'数据源',store:'research',sheet:'source',
      fields:[N('rank','排名'),F('mainRank','大类排名'),F('asin','ASIN'),F('product','商品'),F('brand','品牌'),F('cat','分类'),
        N('mSales','月销量'),N('dSales','日销量'),N('price','价格'),N('mAmt','月销售额'),N('reviews','评论数'),N('rating','评分'),
        N('onDays','上架天数'),F('shipMode','发货方式')],empty:'暂无数据'}
  ];

  P['dev-selection']=async root=>{
    U.clearCharts();
    const tabs=[
      {key:'t1',label:'选品立项',render:el=>{
        el.innerHTML=`<div class="card"><h3>选品立项 · 候选评分 + 立项进度</h3>
          <div class="sub">六维评分自动算综合分与建议；立项进度单独记录（纯本地录入，不抓取）</div></div>`;
        const wrap=el.querySelector('.card');
        const c1=document.createElement('div'), c2=document.createElement('div');
        wrap.appendChild(c1); wrap.appendChild(c2);
        mountSheet(CAND_CFG,c1); mountSheet(PROJ_CFG,c2);
      }},
      {key:'t2',label:'多维度市场分析',render:el=>mountSubTabs(MARKET_SHEETS,el,'多维度市场分析')},
      {key:'t3',label:'ABA 关键词调研',render:el=>mountSubTabs(ABA_SHEETS,el,'ABA 关键词调研')},
      {key:'t4',label:'选品调研表',render:el=>mountSubTabs(RESEARCH_SHEETS,el,'选品调研表')}
    ];
    root.innerHTML=`<div class="card"><h3>选品立项 & 市场调研</h3>
      <div class="sub">六维评分 + 市场/关键词/调研一体化工作台（纯本地录入，不抓取）</div>
      ${U.tabs(tabs)}<div id="tabBody"></div></div>`;
    const body=root.querySelector('#tabBody');
    U.bindTabs(root,tabs,body,(ts,k,b)=>{ const t=ts.find(x=>x.key===k); t.render(b); });
    tabs[0].render(body);
  };

  /* ===================== 页面 2 · dev-competitor ===================== */
  const COMP_BASIC_CFG={store:'competitor_basic',title:'基础竞品分析表',
    fields:[
      F('name','品名'),F('category','类目'),F('recDate','记录时间',{type:'date'}),N('rank','排名'),
      URLF('img','主图'),F('asin','ASIN'),N('sales30','近30天销量'),F('catRank','类目排名'),
      F('title','标题',{type:'textarea'}),F('bullets','五点描述',{type:'textarea'}),F('keywords','关键词',{type:'textarea'}),
      N('price','售价'),N('fbaFee','FBA配送费'),URLF('priceTrend','历史价格趋势'),
      N('priceMin','历史最低价$'),N('priceMax','历史最高价$'),F('onDate','上架时间',{type:'date'}),F('variant','变体'),
      N('reviews','评价数'),N('rating','评分'),N('badReviews','差评数'),
      R('badRate','差评率',{f:r=>r.badRate==null?'—':U.pct(r.badRate)}),
      F('pkgSize','包装尺寸'),F('pkgWeight','包装重量'),F('goodContent','好评主要内容',{type:'textarea'}),
      F('badContent','差评主要内容',{type:'textarea'}),F('reviewSummary','评价总结',{type:'textarea'}),F('optimize','新品可优化项目',{type:'textarea'})
    ], compute:computeBadRate, empty:'暂无竞品，点击「新增」', xlsxName:'基础竞品分析表',
    cols:[
      {t:'品名',k:'name'},{t:'ASIN',k:'asin'},{t:'售价',k:'price',num:true,f:r=>U.money(r.price)},
      {t:'近30天销量',k:'sales30',num:true},{t:'评分',k:'rating',num:true},{t:'评价数',k:'reviews',num:true},
      {t:'差评率',k:'badRate',num:true,f:r=>r.badRate==null?'—':U.pct(r.badRate)},
      {t:'主图',k:'img',f:r=>U.imgField(r.img)}
    ]};

  const COMP_MULTI_SHEETS=[
    {key:'summary',label:'总结',store:'competitor_multi',sheet:'summary',
      fields:[F('lifeCycle','生命周期',{type:'textarea'}),F('intraComp','站内竞争',{type:'textarea'}),
        F('kwTop100','关键词TOP100',{type:'textarea'}),F('quality','质量结论',{type:'textarea'}),F('pNameCn','产品名称中文'),
        N('purchase','采购成本'),F('overseaShip','海外仓储运输方式'),N('headCost','国外头程运输成本'),N('shipCost','配送成本'),
        N('commission','平台佣金'),R('gross','毛利',{f:r=>r.gross==null?'—':U.money(r.gross)}),N('afterSale','售后成本'),
        N('price','售价'),R('grossPct','毛利率%',{f:r=>r.grossPct==null?'—':U.pct(r.grossPct)})],
      compute:computeCompGross,empty:'暂无数据'},
    {key:'priceCalc',label:'价格测算',store:'competitor_multi',sheet:'priceCalc',
      fields:[F('pNameCn','产品名称中文'),N('L','长inch'),N('W','宽inch'),N('H','高inch'),N('gWeight','毛重pounds'),
        N('nWeight','净重pounds'),N('purchase','采购成本'),F('inShipMode','国内仓储运输方式'),N('inShipCost','国内运输成本'),
        F('outShipMode','海外仓储运输方式'),N('outHeadCost','国外头程运输成本'),N('shipCost','配送成本'),N('commission','平台佣金'),
        N('commPct','平台佣金率'),R('gross','毛利',{f:r=>r.gross==null?'—':U.money(r.gross)}),N('afterSale','售后成本'),N('price','售价'),
        R('grossPct','毛利率%',{f:r=>r.grossPct==null?'—':U.pct(r.grossPct)})],
      compute:computeCompGross,empty:'暂无数据'},
    {key:'intraComp',label:'站内竞争分析',store:'competitor_multi',sheet:'intraComp',
      fields:[F('c1','一级类目'),F('c2','二级类目'),F('c3','三级类目'),F('c4','四级类目')],empty:'暂无数据'},
    {key:'perfComp',label:'同类性能对比',store:'competitor_multi',sheet:'perfComp',
      fields:[F('product','产品'),N('price','具体价格$'),F('desc','产品说明',{type:'textarea'}),F('priceRange','价格区间'),F('specs','规格',{type:'textarea'}),F('report','测评报告',{type:'textarea'})],empty:'暂无数据'},
    {key:'basicInfo',label:'产品基础信息',store:'competitor_multi',sheet:'basicInfo',
      fields:[F('sku','SKU'),F('pNameCn','产品名称中文'),N('L','长inch'),N('W','宽inch'),N('H','高inch'),N('gWeight','毛重pounds'),
        N('nWeight','净重pounds'),F('accessory','产品配件'),N('moq','MOQ'),N('purchaseNoTax','采购成本不含税'),N('purchaseTax','含税采购成本'),
        F('supply','供应链专员'),F('orderDate','首单下单时间',{type:'date'}),N('leadTime','货期')],empty:'暂无数据'},
    {key:'bedReview',label:'床单差评分析',store:'competitor_multi',sheet:'bedReview',
      fields:[F('problem','问题',{type:'textarea'}),F('analysis','问题分析',{type:'textarea'}),N('qty','数量汇总'),F('note','备注',{type:'textarea'}),
        R('ratio','比例%',{f:r=>r.ratio==null?'—':U.pct(r.ratio)})],empty:'暂无数据'},
    {key:'priceDim',label:'价格维度',store:'competitor_multi',sheet:'priceDim',
      fields:[N('priceRange','价格区间销量'),N('asinCount','计数项ASIN'),N('estSales','求和项预计销量')],empty:'暂无数据'},
    {key:'sizeSlope',label:'尺寸-销量斜率',store:'competitor_multi',sheet:'sizeSlope',
      fields:[F('rowLabel','行标签'),N('sumPrice','求和项价格'),N('sumEstSales','求和项预计销量')],empty:'暂无数据'},
    {key:'brand',label:'品牌分析',store:'competitor_multi',sheet:'brand',
      fields:[F('rowLabel','行标签'),N('minP','最小价'),N('maxP','最大价'),N('avgP','平均价'),N('sumEstSales','求和项预计销量'),N('sumRating','求和项评分'),N('sumReviews','求和项评论')],empty:'暂无数据'},
    {key:'traffic',label:'流量端口',store:'competitor_multi',sheet:'traffic',
      fields:[F('rowLabel','行标签'),N('asinCount','计数项ASIN'),N('sumEstSales','求和项预计销量'),N('minP','最小价'),N('maxP','最大价'),N('avgP','平均价'),N('avgRating','平均评分'),N('sumReviews','求和项评论')],empty:'暂无数据'},
    {key:'total',label:'总表',store:'competitor_multi',sheet:'total',
      fields:[F('port','流量端口'),F('page','页面'),N('hash','#'),F('pName','商品名称'),F('brand','品牌'),N('price','价格'),
        N('price30','价格30'),N('minPrice','最低售价'),N('net','净利'),N('fba','FBA费用'),
        R('netPct','净利率%',{f:r=>r.netPct==null?'—':U.pct(r.netPct)}),F('lqs','LQS'),F('cat','品类'),F('seller','卖家'),
        N('rank','排名'),N('bsr30','BSR30'),N('stock','库存'),N('estSales','预计销量'),N('estRev','预估收入'),N('reviews','评论'),
        N('rpr','RPR'),F('effDate1','生效日期1',{type:'date'}),F('effDate2','生效日期2',{type:'date'}),N('rating','评分'),URLF('bestsellerUrl','畅销产品分类网址')],
      empty:'暂无数据'}
  ];

  // B4：competitor_plan 严格白名单，绝不含任何 刷单/测评中介 字段
  const COMP_PLAN_SHEETS=[
    {key:'research',label:'产品调研',store:'competitor_plan',sheet:'research',
      fields:[F('recDate','调研日期',{type:'date'}),F('no','编号'),F('kwSite','关键词及站点'),F('brand','品牌'),URLF('img','图片'),
        F('note','备注(尺寸重量/卖点/运营特点)',{type:'textarea'}),N('rating','评分'),N('reviews','评论量'),N('localPrice','当地价格'),
        N('rank','排名'),F('pubDate','发布日期',{type:'date'}),N('months','月数'),N('estMonthSales','预计月销量')],empty:'暂无数据'},
    {key:'costCalc',label:'产品成本推算',store:'competitor_plan',sheet:'costCalc',
      fields:[F('product','产品'),F('asin','ASIN'),N('year','年'),N('month','月'),
        R('profit','利润',{f:r=>r.profit==null?'—':U.money(r.profit)}),
        R('breakEvenPrice','盈亏价',{f:r=>r.breakEvenPrice==null?'—':U.money(r.breakEvenPrice)}),
        R('breakEvenPct','盈亏率%',{f:r=>r.breakEvenPct==null?'—':U.pct(r.breakEvenPct)}),
        R('rmbCost','RMB预定产品成本',{f:r=>r.rmbCost==null?'—':U.money(r.rmbCost,'￥')}),
        R('costRatio','成本占比%',{f:r=>r.costRatio==null?'—':U.pct(r.costRatio)}),
        R('realCostRatio','实际产品成本占比%',{f:r=>r.realCostRatio==null?'—':U.pct(r.realCostRatio)}),
        N('price','价格'),N('fbaSingle','单个fba物流'),N('firstLeg','头程'),N('productCost','产品成本'),N('estSales','预计销量')],
      empty:'暂无数据'},
    {key:'promoPlan',label:'推广计划',store:'competitor_plan',sheet:'promoPlan',
      fields:[F('product','产品'),F('asin','ASIN'),F('rivalAsin','对手ASIN'),N('rivalReview','对手上评出单'),N('rivalPrice','对手价格'),
        F('rankNote','排名和备注',{type:'textarea'}),F('pushDate','推进日期',{type:'date'}),N('priceUsd','价格$'),N('rivalStock','店铺剩余库存'),
        F('product2','产品',{ph:'可重复'}),N('costRmb','产品成本RMB'),N('estSales','预计销量'),N('estMonthShipCostRmb','预计月头程RMB'),
        R('amzCommRmb','亚马逊佣金RMB',{f:r=>r.amzCommRmb==null?'—':U.money(r.amzCommRmb,'￥')}),
        R('fbaRmb','FBA费用RMB',{f:r=>r.fbaRmb==null?'—':U.money(r.fbaRmb,'￥')}),
        R('totalHeadRmb','总头程RMB',{f:r=>r.totalHeadRmb==null?'—':U.money(r.totalHeadRmb,'￥')}),
        N('estMonthAdRmb','预计月均广告费RMB'),R('estRevRmb','预计收入RMB',{f:r=>r.estRevRmb==null?'—':U.money(r.estRevRmb,'￥')}),
        R('totalProdCostRmb','总产品成本RMB',{f:r=>r.totalProdCostRmb==null?'—':U.money(r.totalProdCostRmb,'￥')}),
        R('lossRmb','亏损RMB',{f:r=>r.lossRmb==null?'—':U.money(r.lossRmb,'￥')}),N('otherCostRmb','其他投入费用RMB')],
      empty:'暂无数据'}
  ];

  P['dev-competitor']=async root=>{
    U.clearCharts();
    const tabs=[
      {key:'t1',label:'基础竞品分析表',render:el=>mountSheet(COMP_BASIC_CFG,el)},
      {key:'t2',label:'竞品多维度分析',render:el=>mountSubTabs(COMP_MULTI_SHEETS,el,'竞品多维度分析')},
      {key:'t3',label:'竞品调研&推广计划表',render:el=>mountSubTabs(COMP_PLAN_SHEETS,el,'竞品调研&推广计划表')}
    ];
    root.innerHTML=`<div class="card"><h3>竞品深度分析</h3>
      <div class="sub">基础表 + 多维度 + 调研&推广计划（纯本地录入，不抓取）</div>
      ${U.tabs(tabs)}<div id="tabBody"></div></div>`;
    const body=root.querySelector('#tabBody');
    U.bindTabs(root,tabs,body,(ts,k,b)=>{ const t=ts.find(x=>x.key===k); t.render(b); });
    tabs[0].render(body);
  };

  /* ===================== 页面 3 · dev-profit ===================== */
  const PRODUCTS_CFG={store:'products',title:'利润测算（产品成本快速估算）',sub:'沿用 products.cost；净利用 U.profit 计算（B2 旧视角）',
    fields:[
      F('name','产品名称'),F('sku','SKU'),N('price','售价($)'),
      N('purchase','采购成本￥'),N('firstLeg','头程￥'),N('fbaFee','FBA费$'),N('commission','佣金率',{def:0.15}),
      N('storage','仓储$'),N('returnLoss','退货率',{def:0.05}),N('targetAcos','目标ACOS',{def:0.25})
    ],
    pack:v=>{ const id=v.id; return {id:id||undefined,name:v.name,sku:v.sku,price:num(v.price),
      cost:{purchase:num(v.purchase),firstLeg:num(v.firstLeg),fbaFee:num(v.fbaFee),commission:num(v.commission,0.15),
        storage:num(v.storage),returnLoss:num(v.returnLoss,0.05),targetAcos:num(v.targetAcos,0.25)}}; },
    compute:r=>{ const p=U.profit({price:r.price,cost:r.cost||{}}); r._net=p.net; r._margin=p.margin; r._be=p.breakEvenAcos; },
    empty:'暂无产品，点击「新增」', xlsxName:'利润测算',
    cols:[
      {t:'产品',k:'name'},{t:'SKU',k:'sku'},{t:'售价',k:'price',num:true,f:r=>U.money(r.price)},
      {t:'净利',k:'_net',num:true,f:r=>r._net==null?'—':U.money(r._net)},
      {t:'净利率',k:'_margin',num:true,f:r=>r._margin==null?'—':U.pct(r._margin)},
      {t:'保本ACOS',k:'_be',num:true,f:r=>r._be==null?'—':U.pct(r._be)}
    ]};

  const PROFIT_CHECK_SHEETS=[
    {key:'size',label:'1-产品尺寸录入表',store:'profit_check',sheet:'size',
      compute:computeSize,
      fields:[F('onDate','上架日期',{type:'date'}),F('pName','品名'),URLF('img','图片'),F('asin','ASIN'),F('sku','后台SKU'),
        F('fnsku','FNSKU'),F('sizeCm','产品尺寸cm'),N('weightKg','产品实重kg'),F('pkgSizeCm','包装尺寸cm'),N('pkgWeightKg','包装实重kg'),
        N('lxwxhCm','长宽高cm'),N('lxwxhInch','长宽高inch'),F('pxWxHinch','产品尺寸inch(占位)'),F('pkgLxwxHcm','包装长宽高cm'),
        F('pkgLxWxHinch','包装长宽高inch'),N('pkgWeightLb','包装实重lb'),
        R('volDiv6000','头程抛重kg(÷6000)',{f:r=>r.volDiv6000==null?'—':U.f2(r.volDiv6000)}),
        R('volDiv5000','头程抛重kg(÷5000)',{f:r=>r.volDiv5000==null?'—':U.f2(r.volDiv5000)}),
        R('fbaTier','FBA尺寸分段',{f:r=>r.fbaTier||'—'}),
        R('fbaChargeWtLb','FBA计费重量lb',{f:r=>r.fbaChargeWtLb==null?'—':U.f2(r.fbaChargeWtLb)}),
        R('estFee','预估FBA配送费$',{f:r=>r.estFee==null?'—':U.money(r.estFee)})],
      empty:'暂无数据'},
    {key:'feeCheck',label:'2-配送费预估核对',store:'profit_check',sheet:'feeCheck',
      compute:computeFeeCheck,
      fields:[F('asin','ASIN'),F('sku','后台SKU'),N('fbaWeightLb','FBA计费重量lb'),F('fbaTier','FBA尺寸分段'),
        N('estFee','预估配送费$',{ph:'录入分段+重量后由 U.fbaFee 自动算(B3)'}),N('fbaRealWeight','FBA实际包装计重'),N('fbaRealFee','FBA实际配送费$'),F('update','UPDATE',{type:'date'})],
      empty:'暂无数据'},
    {key:'profit2',label:'3-利润预估表2.0（母口径 B2）',store:'profit_check',sheet:'profit2',
      fields:[F('sku','SKU'),N('purchase$','采购价$'),N('firstLeg$','头程运费预估$'),N('fbaFee$','FBA配送费$'),N('commission$','平台佣金$'),
        N('refund$','退款预估$'),N('ad$','总体广告预估$'),N('storageOther$','仓储其他$'),N('promo$','其他促销$'),N('price$','售价$'),
        N('rate','汇率',{def:DEFAULT_RATE}),S('shipMode','发货方式',['快递','空运','海运'].map(opt)),S('version','版本',['预估','核对'].map(opt)),
        N('volDiv5000','材积/5000'),N('volDiv6000','材积/6000'),
        R('cost$','成本$',{f:r=>r.cost$==null?'—':U.money(r.cost$)}),
        R('profit$','利润$',{f:r=>r.profit$==null?'—':U.money(r.profit$)}),
        R('profitRmb','利润￥',{f:r=>r.profitRmb==null?'—':U.money(r.profitRmb,'￥')}),
        R('netPct','净利率%',{f:r=>r.netPct==null?'—':U.pct(r.netPct)}),
        R('breakEvenAcos','保本ACOS%',{f:r=>r.breakEvenAcos==null?'—':U.pct(r.breakEvenAcos)})],
      compute:computeProfitCheck,empty:'暂无数据'},
    {key:'fbaLogic',label:'FBA配送费计算逻辑（参照表）',store:'profit_check',sheet:'fbaLogic',
      fields:[F('note','说明',{type:'textarea',ph:'尺寸换算/尺寸分段/费率(202509版)，由设置页维护 fba_rate'})],
      empty:'参照表（由 B3 费率表读取，非录入）'}
  ];

  const PROFIT_METRICS_CFG={store:'profit_metrics',title:'选品利润指标',
    fields:[
      S('channel','渠道',['空运','专线','海运','铁运','卡航'].map(opt)),
      S('currency','货币',['美元','英镑','欧元','加元','墨西哥比索','日元'].map(opt)),
      N('price','商品售价'),N('weightG','单个重量/g'),N('freightPerG','货代/1g'),N('firstLegRmb','头程FBA运费/RMB'),
      N('costRmb','商品成本/RMB'),      N('rate','汇率',{ph:'未填则按币种取 U.RATES 默认'}),
      N('commPct','平台佣金率%',{def:15}),N('fbaFee$','FBA配送费$'),N('tariff$','关税$'),
      R('priceRmb','兑换后售价/RMB',{f:r=>r.priceRmb==null?'—':U.money(r.priceRmb,'￥')}),
      R('profitRmb','利润/RMB',{f:r=>r.profitRmb==null?'—':U.money(r.profitRmb,'￥')}),
      R('profitRatio','利润比%',{f:r=>r.profitRatio==null?'—':U.pct(r.profitRatio)}),
      R('taxRmb','税/RMB',{f:r=>r.taxRmb==null?'—':U.money(r.taxRmb,'￥')}),
      R('commissionRmb','抽点/RMB',{f:r=>r.commissionRmb==null?'—':U.money(r.commissionRmb,'￥')}),
      R('preDeduct','预扣(广告7%+退货5%)',{f:r=>r.preDeduct==null?'—':U.money(r.preDeduct,'￥')}),
      R('netReceive','AMZ后台到账',{f:r=>r.netReceive==null?'—':U.money(r.netReceive,'￥')}),
      R('amzShipRmb','亚马逊配送费/RMB',{f:r=>r.amzShipRmb==null?'—':U.money(r.amzShipRmb,'￥')}),
      R('fxLoss','汇损',{f:r=>r.fxLoss==null?'—':U.money(r.fxLoss,'￥')}),
      N('volL','体积长'),N('volW','体积宽'),N('volH','体积高'),N('volWeightKg','体积重/kg'),N('qty','数量'),N('unitWeight','单个重量')
    ], compute:computeProfitMetrics, empty:'暂无数据', xlsxName:'选品利润指标'};

  const PROD_ANALYSIS_SHEETS=[
    {key:'req',label:'产品需求定型',store:'product_analysis',sheet:'req',
      fields:[F('cnName','中文名'),F('enName','英文名(核心关键词)'),URLF('img','图片'),F('func','产品基本功能',{type:'textarea'}),
        F('scene','使用场景',{type:'textarea'}),F('marketAna','市场情况分析',{type:'textarea'})],empty:'暂无数据'},
    {key:'season',label:'季节性和趋势分析',store:'product_analysis',sheet:'season',
      fields:[URLF('googleTrend','Google趋势图'),URLF('trendImg','趋势图'),F('asinRankTrend','ASIN-Rank趋势')],empty:'暂无数据'},
    {key:'us',label:'市场调研数据-US',store:'product_analysis',sheet:'us',
      fields:[URLF('img','图片'),F('brand','品牌'),URLF('link','链接'),F('asin','Asin'),F('onDate','上架时间',{type:'date'}),
        N('rating','评分'),N('reviewsTotal','Review总数'),N('price','价格'),N('mainRank','大类排名'),N('estDSales','预计日销量'),
        F('segment','产品细分类型'),F('segmentDetail','细分详情',{type:'textarea'})],empty:'暂无数据'},
    {key:'uk',label:'市场调研数据-UK备用',store:'product_analysis',sheet:'uk',
      fields:[URLF('img','图片'),F('brand','品牌'),URLF('link','链接'),F('asin','Asin'),F('onDate','上架时间',{type:'date'}),
        N('rating','评分'),N('reviewsTotal','Review总数'),N('price','价格'),N('mainRank','大类排名'),N('estDSales','预计日销量'),
        F('segment','产品细分类型'),F('segmentDetail','细分详情',{type:'textarea'})],empty:'暂无数据'},
    {key:'jp',label:'市场调研数据-JP备用',store:'product_analysis',sheet:'jp',
      fields:[URLF('img','图片'),F('brand','品牌'),URLF('link','链接'),F('asin','Asin'),F('onDate','上架时间',{type:'date'}),
        N('rating','评分'),N('reviewsTotal','Review总数'),N('price','价格'),N('mainRank','大类排名'),N('estDSales','预计日销量'),
        F('segment','产品细分类型'),F('segmentDetail','细分详情',{type:'textarea'})],empty:'暂无数据'}
  ];

  const DEV_PLAN_SHEETS=[
    {key:'front',label:'1.前台看',store:'dev_plan',sheet:'front',
      fields:[S('site','站点',['US','EU','JP'].map(opt)),URLF('img','图片'),F('pName','产品名'),F('kw','关键词'),N('cpCount','竞品数量'),
        F('mainSeller','主要卖家'),URLF('saleLink','销售链接'),N('reviews','单品reviews'),N('feedback','店铺Feedback'),N('rating','Review星级'),
        F('badPoint','差评点',{type:'textarea'}),F('sellingPoint','主要产品卖点',{type:'textarea'}),N('price','售价'),URLF('buyLink','采购链接'),
        N('buyPrice','采购价格￥'),N('weightG','重量g'),R('gross','毛利',{f:r=>r.gross==null?'—':U.money(r.gross)}),F('lifeCycle','生命周期'),
        R('grossPct','毛利率%',{f:r=>r.grossPct==null?'—':U.pct(r.grossPct)})],compute:computeDevGross,empty:'暂无数据'},
    {key:'back',label:'2.后台看',store:'dev_plan',sheet:'back',
      fields:[URLF('img','图片'),F('pName','产品名'),URLF('buyLink','采购链接'),N('buyPrice','采购价格'),URLF('rivalLink','对标卖家链接'),
        N('rivalPrice','对标卖家售价'),R('gross','毛利',{f:r=>r.gross==null?'—':U.money(r.gross)}),N('sales','销量'),F('lifeCycle','生命周期'),
        N('cpCount','竞品数量'),R('grossPct','毛利率%',{f:r=>r.grossPct==null?'—':U.pct(r.grossPct)})],compute:computeDevGross,empty:'暂无数据'},
    {key:'side',label:'3.旁边看',store:'dev_plan',sheet:'side',
      fields:[F('bigRetailer','大零售商'),URLF('bigBrandSite','大品牌网站'),F('mainStyle','主流款'),F('newStyle','新款'),F('priceRange','售价区间'),
        F('sellingPoint','卖点'),F('weakness','缺点'),F('position','定位'),F('onPlatform','平台是否有售')],empty:'暂无数据'},
    {key:'position',label:'4.产品定位',store:'dev_plan',sheet:'position',
      fields:[F('segment','细分市场'),F('targetMarket','目标市场选择',{type:'textarea'})],empty:'暂无数据'},
    {key:'need',label:'5.产品需求分析',store:'dev_plan',sheet:'need',
      fields:[F('top100','top100分析'),F('style','产品款式'),F('capacity','容量'),F('color','颜色'),F('cupStyle','罩杯款式')],empty:'暂无数据'},
    {key:'supplier',label:'供应商产品筛选',store:'dev_plan',sheet:'supplier',
      fields:[F('supplier','供应商名称'),F('styleFeature','产品款式和特点'),F('priceRange','价格区间'),F('conclusion','结论')],empty:'暂无数据'},
    {key:'project',label:'项目检视表',store:'dev_plan',sheet:'project',
      fields:[F('progress','项目进展'),F('startDate','开始时间',{type:'date'}),F('doneDate','完成时间',{type:'date'}),F('note','完成情况说明',{type:'textarea'})],empty:'暂无数据'},
    {key:'usFba',label:'US-FBA成本分析表',store:'dev_plan',sheet:'usFba',
      fields:[F('cm','CM'),F('country','国家'),F('account','账号'),F('brand','品牌'),F('sku','SKU'),F('cnName','产品中文名'),
        F('asin','ASIN'),N('price$','售价$'),R('grossRmb','毛利￥',{f:r=>r.grossRmb==null?'—':U.money(r.grossRmb,'￥')}),
        R('grossPct','毛利率%',{f:r=>r.grossPct==null?'—':U.pct(r.grossPct)}),N('purchaseRmb','采购价￥'),N('weightG','重量g'),
        N('firstLegRmb','头程运费￥'),N('tariff','关税'),N('fbaHandling$','FBA Order Handling$'),N('fbaPick$','FBA Pick&Pack$'),
        N('fbaWeight$','FBA Weight Handling$'),N('commPct','Commision%',{def:15}),N('referralFee$','Referral Fee$'),N('rate','汇率',{def:DEFAULT_RATE}),
        N('firstLegRate','头程费率')],compute:computeDevUsFba,empty:'暂无数据'},
    {key:'flow',label:'开发流程图',store:'dev_plan',sheet:'flow',
      fields:[F('steps','流程步骤',{type:'textarea',ph:'非表格，富文本/步骤列表'})],empty:'暂无数据'}
  ];

  function renderProfitPage(el){
    el.innerHTML=`<div class="card"><h3>利润测算 & 产品利润核对表</h3>
      <div class="sub">区块A 沿用产品成本（快速估算）；区块B 母口径利润预估表2.0（B2）</div></div>`;
    const wrap=el.querySelector('.card');
    const a=document.createElement('div'), b=document.createElement('div');
    wrap.appendChild(a); wrap.appendChild(b);
    mountSheet(PRODUCTS_CFG,a);
    mountSubTabs(PROFIT_CHECK_SHEETS,b,'产品利润核对表');
  }

  P['dev-profit']=async root=>{
    U.clearCharts();
    const tabs=[
      {key:'t1',label:'利润测算 / 产品利润核对表',render:el=>renderProfitPage(el)},
      {key:'t2',label:'选品利润指标',render:el=>mountSheet(PROFIT_METRICS_CFG,el)},
      {key:'t3',label:'通用产品分析表',render:el=>mountSubTabs(PROD_ANALYSIS_SHEETS,el,'通用产品分析表')},
      {key:'t4',label:'产品开发表',render:el=>mountSubTabs(DEV_PLAN_SHEETS,el,'产品开发表')}
    ];
    root.innerHTML=`<div class="card"><h3>利润测算 & 产品开发</h3>
      <div class="sub">母口径利润 + 选品利润指标 + 通用分析 + 开发表（纯本地录入）</div>
      ${U.tabs(tabs)}<div id="tabBody"></div></div>`;
    const body=root.querySelector('#tabBody');
    U.bindTabs(root,tabs,body,(ts,k,b)=>{ const t=ts.find(x=>x.key===k); t.render(b); });
    tabs[0].render(body);
  };

  window.Pages=Object.assign(window.Pages||{},P);
})();
