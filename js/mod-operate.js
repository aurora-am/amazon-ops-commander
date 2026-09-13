(function(){
  const P={}; const U=window.UI, DB=window.DB;
  const nf={t:'—',f:()=>'—'};

  async function pm(){const ps=await DB.all('products');const m={};ps.forEach(p=>m[p.id]=p);return m}
  async function sm(){const ss=await DB.all('stores');const m={};ss.forEach(s=>m[s.id]=s);return m}

  /* ============ 6. 诊断中心 ============ */
  const TABS=[['ads','广告诊断'],['profit','单品利润诊断'],['listing','Listing诊断'],['inventory','库存风险诊断'],['account','账户健康诊断']];
  P.diagnosis=async root=>{
    const tab=App.state.diagTab||'ads';
    const prods=(await DB.all('products')).filter(p=>App.inScope(p.storeId));
    const PM=await pm(), SM=await sm();
    const ads=await DB.all('ads'), invs=await DB.all('inventory'), ls=await DB.all('listings');
    const avg=await U.dailyAvgMap();
    const r=U.R(); const rows=[];
    if(tab==='ads'){
      ads.filter(a=>App.inScope(a.storeId)).forEach(a=>{
        const p=PM[a.productId]; if(!p) return;
        const pf=U.profit(p); const be=pf.breakEvenAcos;
        const acos=a.sales?a.spend/a.sales*100:null;
        const share=a.spend&&Number(a.dailyBudget)?a.spend/a.dailyBudget*100:null;
        let lv='green',txt='ACOS 在保本线内';
        if(acos==null){lv='gray';txt='缺少销售数据，无法判断'}
        else if(acos>be){lv='red';txt=`ACOS ${acos.toFixed(1)}% > 保本 ${be.toFixed(1)}%，每单亏损`}
        else if(acos>be*0.8){lv='yellow';txt=`ACOS ${acos.toFixed(1)}% 接近保本线 ${be.toFixed(1)}%`}
        if(a.sales===0&&a.spend>0){lv='yellow';txt='有花费无产出，检查关键词与竞价'}
        rows.push({obj:a,level:lv,target:`${p.sku} ${a.name}`,text:txt,
          detail:`花费 $${U.f2(a.spend)} · 销售 $${U.f2(a.sales)} · 预算使用 ${share==null?'—':share.toFixed(0)+'%'}`,link:'ads'});
      });
    }else if(tab==='profit'){
      prods.forEach(p=>{
        const pf=U.profit(p); const lv=U.marginColor(pf.margin);
        rows.push({obj:p,level:lv,target:`${p.sku} ${p.name}`,
          text:`净利率 ${pf.margin==null?'—':pf.margin.toFixed(1)}%（目标 >${r.marginYellow}%）`,
          detail:`售价 $${U.f2(pf.price)} · 总成本 $${U.f2(pf.total)} · 净利 $${U.f2(pf.net)} · 保本ACOS ${pf.breakEvenAcos==null?'—':pf.breakEvenAcos.toFixed(1)}%`,link:'products'});
      });
    }else if(tab==='listing'){
      ls.forEach(l=>{
        const p=PM[l.productId]; if(!p||!App.inScope(p.storeId)) return;
        let score=0; score+=l.title&&l.title.length>40?25:10; score+=(Number(l.bullets)||0)>=5?25:(Number(l.bullets)||0)*4;
        score+=(Number(l.images)||0)>=7?25:(Number(l.images)||0)*3; score+=Number(l.aPlus)?15:0;
        score+=l.keywords?10:0;
        const lv=score>=85?'green':(score>=60?'yellow':'red');
        rows.push({obj:l,level:lv,target:`${p.sku} ${p.name}`,
          text:`健康分 ${score}/100`,
          detail:`五点 ${l.bullets||0}/5 · 图片 ${l.images||0}/7 · A+ ${Number(l.aPlus)?'有':'无'} · 关键词 ${l.keywords?'已填':'未填'}`,link:'listing'});
      });
    }else if(tab==='inventory'){
      invs.forEach(i=>{
        const p=PM[i.productId]; if(!p||!App.inScope(p.storeId)) return;
        const daily=avg[i.productId]!=null?avg[i.productId]:(Number(i.dailySalesAvg)||0);
        const avail=(Number(i.fbaQty)||0)+(Number(i.inboundQty)||0)-(Number(i.reserveQty)||0);
        const cover=daily>0?avail/daily:null;
        let lv='green',txt='库存健康';
        if(cover==null){lv='gray';txt='缺少日均销量'}
        else if(cover<r.stockRed){lv='red';txt=`可售 ${cover.toFixed(0)} 天，最晚补货 ${U.addDays(U.today(),Math.max(0,Math.floor(cover)-(Number(i.leadDays)||0)))}`}
        else if(cover<r.stockYellow){lv='yellow';txt=`可售 ${cover.toFixed(0)} 天，需安排补货`}
        if((Number(i.aging180)||0)>0){lv='red';txt+=` · 库龄>180天 ${i.aging180} 件`}
        rows.push({obj:i,level:lv,target:`${p.sku} ${p.name}`,text:txt,
          detail:`FBA ${i.fbaQty||0} · 在途 ${i.inboundQty||0} · 预留 ${i.reserveQty||0} · 日均 ${daily} · 周期 ${i.leadDays||0} 天`,link:'inventory'});
      });
    }else{
      (await DB.all('stores')).filter(s=>App.inScope(s.id)).forEach(s=>{
        const ach=Number(s.ach);
        const lv=(s.status&&s.status!=='正常')?'red':(ach&&ach<200?'yellow':'green');
        rows.push({obj:s,level:lv,target:s.name,
          text:`状态 ${s.status||'正常'} · ACH ${ach||'—'} · 绩效通知 ${s.notices||0}`,
          detail:`站点 ${s.site} · ${s.note||''}`,link:'stores'});
      });
    }
    const order={red:0,yellow:1,green:2,gray:3};
    rows.sort((a,b)=>order[a.level]-order[b.level]);
    root.innerHTML=
      `<div class="card"><h3>诊断中心</h3>
        <div class="sub">每条异常可一键转为待办事项；完成后下次诊断会标记已处置</div>
        <div class="toolbar">${TABS.map(([k,t])=>`<button class="btn-ghost" data-tab="${k}" style="${k===tab?'border-color:var(--blue);color:var(--blue)':''}">${t}</button>`).join('')}
          <button class="btn" id="dSave">保存本轮诊断记录</button>
        </div>
        <table><thead><tr><th style="width:60px">级别</th><th>对象</th><th>结论</th><th>明细</th><th style="width:150px">操作</th></tr></thead>
        <tbody>${rows.length?rows.map((x,i)=>`<tr>
          <td>${U.dot(x.level)}</td><td>${U.esc(x.target)}</td><td>${U.esc(x.text)}</td>
          <td style="color:var(--ink2);font-size:12px">${U.esc(x.detail)}</td>
          <td><button class="btn-ghost btn-sm" data-t="${U.esc(x.target+'：'+x.text)}" data-l="${x.level}">转待办</button>
          <button class="btn-ghost btn-sm" data-g="${x.link}">去处理</button></td></tr>`).join('')
        :`<tr><td colspan="5" class="empty">无数据，请先录入对应模块数据</td></tr>`}</tbody></table>
      </div>
      <div class="card"><h3>诊断历史与闭环追踪</h3><div id="dHist"><div class="empty">加载中</div></div></div>`;

    root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{App.state.diagTab=b.dataset.tab;App.refresh()});
    root.querySelectorAll('[data-t]').forEach(b=>b.onclick=async()=>{
      const lv=b.dataset.l==='red'?'红':(b.dataset.l==='yellow'?'黄':'绿');
      await DB.put('tasks',{source:'诊断',title:b.dataset.t,priority:lv,dueDate:U.today(),relatedId:null,done:false});
      U.toast('已转为待办');
    });
    root.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>App.go(b.dataset.g));
    root.querySelector('#dSave').onclick=async()=>{
      await DB.put('diagnosis_log',{type:tab,date:U.today(),
        findings:rows.map(x=>({level:x.level,target:x.target,text:x.text})),
        score:Math.round(rows.filter(x=>x.level==='green').length/Math.max(1,rows.length)*100),
        followUpTaskIds:[]});
      U.toast('诊断记录已保存'); App.refresh();
    };
    const hist=(await DB.all('diagnosis_log')).filter(h=>h.type===tab).sort((a,b)=>a.date<b.date?1:-1).slice(0,8);
    const box=root.querySelector('#dHist');
    box.innerHTML=hist.length?`<table><thead><tr><th>日期</th><th>类型</th><th>健康占比</th><th>红灯</th><th>黄灯</th></tr></thead><tbody>`+
      hist.map(h=>`<tr><td>${U.esc(h.date)}</td><td>${U.esc(h.type)}</td><td>${h.score}%</td>
        <td>${h.findings.filter(f=>f.level==='red').length}</td><td>${h.findings.filter(f=>f.level==='yellow').length}</td></tr>`).join('')+`</tbody></table>`
      :`<div class="empty">暂无诊断记录，点击「保存本轮诊断记录」开始积累</div>`;
  };

  /* ============ 7. 店铺与站点 ============ */
  P.stores=async root=>{
    const stores=await DB.all('stores');
    const prods=await DB.all('products');
    const ahs=await DB.all('account_health');
    const ahm={}; ahs.forEach(a=>ahm[a.storeId]=a);
    root.innerHTML=`<div class="card"><h3>店铺与站点</h3>
      <div class="sub">多店铺、多站点（US/EU/JP）统一管理；删除店铺不会自动删除产品，请谨慎</div>
      <div class="toolbar"><button class="btn" id="sAdd">新增店铺</button></div>`+
      U.table({cols:[
        {t:'店铺',k:'name'},{t:'站点',k:'site'},{t:'站点域名',k:'marketplace'},
        {t:'状态',k:'status',f:r=>r.status==='正常'?U.tag('正常','green'):U.tag(r.status||'—','red')},
        {t:'AHR',num:true,f:r=>{const a=ahm[r.id];return a&&a.ahr!=null?U.esc(a.ahr):'—'}},
        {t:'绩效通知',num:true,f:r=>{const a=ahm[r.id];return a&&a.policyWarnings!=null?U.esc(a.policyWarnings):'—'}},
        {t:'停售ASIN',num:true,f:r=>{const a=ahm[r.id];return a&&a.suppressed!=null?U.esc(a.suppressed):'—'}},
        {t:'SKU 数',f:r=>String(prods.filter(p=>p.storeId===r.id).length)},
        {t:'备注',k:'note'}
      ],rows:stores,empty:'暂无店铺',
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button>
        <button class="btn-ghost btn-sm" data-d="${r.id}">删除</button>`})+`</div>`;
    const fields=[
      {k:'name',t:'店铺名称'},{k:'site',t:'站点',type:'select',opts:[{v:'US',t:'US 美国'},{v:'EU',t:'EU 欧洲'},{v:'JP',t:'JP 日本'}]},
      {k:'marketplace',t:'站点域名',ph:'Amazon.com'},
      {k:'status',t:'状态',type:'select',opts:[{v:'正常',t:'正常'},{v:'观察',t:'观察'},{v:'受限',t:'受限'}]},
      {k:'ach',t:'账户健康分 ACH',type:'number'},{k:'notices',t:'绩效通知数',type:'number'},
      {k:'note',t:'备注'}
    ];
    root.querySelector('#sAdd').onclick=()=>U.modal({title:'新增店铺',body:U.formFields(fields),
      onOk:async b=>{await DB.put('stores',U.formValues(b))},after:()=>App.refresh()});
    root.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>{
      const s=await DB.get('stores',Number(x.dataset.e));
      U.modal({title:'编辑店铺',body:U.formFields(fields,s),onOk:async b=>{
        const v=U.formValues(b);v.id=s.id;await DB.put('stores',v)},after:()=>App.refresh()});
    });
    root.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>U.confirmBox('删除该店铺？产品数据会保留但失去归属',
      async()=>{await DB.del('stores',Number(x.dataset.d));App.refresh()}));
  };

  /* ============ 8. 产品与成本（利润守门人） ============ */
  P.products=async root=>{
    U.clearCharts();
    const stores=await sm();
    const prods=(await DB.all('products')).filter(p=>App.inScope(p.storeId));
    const rows=prods.map(p=>Object.assign({_p:U.profit(p)},p));
    root.innerHTML=
      U.kpi([
        {label:'SKU 数',value:String(rows.length)},
        {label:'平均净利率',value:U.pct(rows.length?rows.reduce((a,b)=>a+(b._p.margin||0),0)/rows.length:null),
          level:(rows.length&&rows.reduce((a,b)=>a+(b._p.margin||0),0)/rows.length<U.R().marginRed)?'alert':''},
        {label:'亏损 SKU',value:String(rows.filter(r=>(r._p.margin||0)<U.R().marginRed).length),level:'alert'},
        {label:'平均保本 ACOS',value:U.pct(rows.length?rows.reduce((a,b)=>a+(b._p.breakEvenAcos||0),0)/rows.length:null)}
      ])+
      `<div class="card"><h3>产品与成本底座</h3>
        <div class="sub">成本结构只录一次，保本 ACOS / 保本 ROI 全站唯一口径，广告页与诊断页共用</div>
        <div class="toolbar"><button class="btn" id="pAdd">新增产品</button>
          <button class="btn-ghost" id="pCsv">导出 CSV</button></div>`+
      U.table({cols:[
        {t:'SKU',k:'sku'},{t:'ASIN',k:'asin'},{t:'名称',k:'name'},
        {t:'店铺',f:r=>U.esc(stores[r.storeId]?stores[r.storeId].name:'—')},
        {t:'售价',num:true,f:r=>U.money(r.price)},
        {t:'总成本',num:true,f:r=>U.money(r._p.total)},
        {t:'净利',num:true,f:r=>U.money(r._p.net)},
        {t:'净利率',num:true,f:r=>U.pct(r._p.margin)+' '+U.dot(U.marginColor(r._p.margin))},
        {t:'保本ACOS',num:true,f:r=>U.pct(r._p.breakEvenAcos)}
      ],rows,empty:'暂无产品，点击新增',
      actions:r=>`<button class="btn-ghost btn-sm" data-c="${r.id}">成本</button>
        <button class="btn-ghost btn-sm" data-pr="${r.id}">定价</button>
        <button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button>
        <button class="btn-ghost btn-sm" data-d="${r.id}">删除</button>`})+`</div>
      <div class="card"><h3>成本结构与利润拆解（点击某行「成本」查看）</h3><div id="pcBox" class="empty">选择一个产品查看利润拆解与敏感性分析</div></div>`;

    const fields=[{k:'sku',t:'SKU'},{k:'asin',t:'ASIN'},{k:'name',t:'产品名称'},
      {k:'storeId',t:'店铺',type:'select',opts:Object.values(stores).map(s=>({v:s.id,t:s.name}))},
      {k:'category',t:'类目'},{k:'price',t:'售价',type:'number',step:'0.01'}];
    root.querySelector('#pAdd').onclick=()=>U.modal({title:'新增产品',body:U.formFields(fields),
      onOk:async b=>{const v=U.formValues(b);v.cost={purchase:0,firstLeg:0,fbaFee:0,commission:.15,storage:0,returnLoss:.05,targetAcos:.25};
        await DB.put('products',v)},after:()=>App.refresh()});
    root.querySelector('#pCsv').onclick=()=>U.exportCSV('commander_products.csv',
      rows.map(r=>({SKU:r.sku,ASIN:r.asin,名称:r.name,店铺:stores[r.storeId]?stores[r.storeId].name:'',
        售价:r.price,总成本:+r._p.total.toFixed(2),净利:+r._p.net.toFixed(2),净利率:+(r._p.margin||0).toFixed(2),
        保本ACOS:+(r._p.breakEvenAcos||0).toFixed(2)})),
      ['SKU','ASIN','名称','店铺','售价','总成本','净利','净利率','保本ACOS']);
    const edit=(p)=>U.modal({title:'编辑产品',body:U.formFields(fields,p),
      onOk:async b=>{const v=U.formValues(b);v.id=p.id;v.cost=p.cost||{};await DB.put('products',v)},after:()=>App.refresh()});
    root.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>edit(await DB.get('products',Number(x.dataset.e))));
    root.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>U.confirmBox('删除该产品？',
      async()=>{await DB.del('products',Number(x.dataset.d));App.refresh()}));
    root.querySelectorAll('[data-c]').forEach(x=>x.onclick=async()=>{
      const p=await DB.get('products',Number(x.dataset.c));
      U.modal({title:'成本结构 · '+p.sku,body:U.formFields([
        {k:'purchase',t:'采购价'},{k:'firstLeg',t:'头程'},{k:'fbaFee',t:'FBA 配送费'},
        {k:'commission',t:'佣金率(0-1)',step:'0.01'},{k:'storage',t:'月仓储费'},
        {k:'returnLoss',t:'退货损耗率(0-1)',step:'0.01'},{k:'targetAcos',t:'目标 ACOS(0-1)',step:'0.01'}
      ],p.cost||{}),onOk:async b=>{p.cost=U.formValues(b);await DB.put('products',p);U.toast('成本已更新')},
      after:()=>App.refresh()});
    });
    root.querySelectorAll('[data-pr]').forEach(x=>x.onclick=async()=>{
      const p=await DB.get('products',Number(x.dataset.pr));
      const base=U.profit(p);
      const sens=[-10,-5,0,5,10].map(d=>{
        const q=Object.assign({},p,{price:p.price*(1+d/100)});
        return {d,pf:U.profit(q)};
      });
      U.modal({title:'定价与利润敏感性 · '+p.sku,
        body:`<div style="font-size:13px;line-height:1.9">
          当前售价 $${U.f2(p.price)} · 净利 $${U.f2(base.net)} · 净利率 ${U.pct(base.margin)}<br>
          保本 ACOS ${U.pct(base.breakEvenAcos)} · 保本 ROI ${base.breakEvenRoi?base.breakEvenRoi.toFixed(2):'—'}
        </div>
        <table style="margin-top:10px"><thead><tr><th>调价</th><th>售价</th><th>净利</th><th>净利率</th></tr></thead><tbody>
        ${sens.map(s=>`<tr><td>${s.d>0?'+':''}${s.d}%</td><td>$${U.f2(s.pf.price)}</td><td>$${U.f2(s.pf.net)}</td>
          <td>${U.pct(s.pf.margin)} ${U.dot(U.marginColor(s.pf.margin))}</td></tr>`).join('')}</tbody></table>
        <div style="margin-top:10px;font-size:12px;color:var(--ink2)">
          调价需同时看竞品价格带与转化率，系统只给敏感性，定价判断由你做。
        </div>`,okText:'知道了'});
    });
    const box=root.querySelector('#pcBox');
    if(rows.length){
      const p=rows[0]; const pf=p._p;
      box.className=''; box.innerHTML=`<div style="font-size:13px;line-height:2">
        示例（${U.esc(p.sku)}）：采购 $${U.f2(pf.purchase)} + 头程 $${U.f2(pf.firstLeg)} + FBA $${U.f2(pf.fba)}
        + 佣金 $${U.f2(pf.commFee)} + 仓储 $${U.f2(pf.storage)} + 退货损耗 $${U.f2(pf.retCost)}
        + 广告(目标ACOS) $${U.f2(pf.adCost)} = 总成本 $${U.f2(pf.total)}；净利 $${U.f2(pf.net)}（${U.pct(pf.margin)}）</div>`;
    }
  };

  /* ============ 9. Listing 工作台 ============ */
  P.listing=async root=>{
    const PM=await pm();
    const ls=(await DB.all('listings')).filter(l=>PM[l.productId]&&App.inScope(PM[l.productId].storeId));
    const revs=await DB.all('reviews');
    root.innerHTML=
      `<div class="card"><h3>Listing 档案与健康检查</h3>
        <div class="sub">结构完整性 + 转化率对比；健康分只做汇总，是否优化由你判断</div>
        <div class="toolbar"><button class="btn" id="lAdd">新增 Listing</button></div>`+
      U.table({cols:[
        {t:'产品',f:r=>U.esc(PM[r.productId]?PM[r.productId].sku:'—')},
        {t:'标题',f:r=>U.esc((r.title||'').slice(0,40))},
        {t:'五点',f:r=>`${r.bullets||0}/5`},{t:'图片',f:r=>`${r.images||0}/7`},
        {t:'A+',f:r=>Number(r.aPlus)?U.tag('已上线','green'):U.tag('未上线','yellow')},
        {t:'关键词',f:r=>r.keywords?U.tag('已填','green'):U.tag('未填','red')},
        {t:'最近审查',f:r=>U.esc(r.lastAudit||'—')}
      ],rows:ls,empty:'暂无 Listing',
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button>`})+`</div>
      <div class="grid g2">
        <div class="card"><h3>评论洞察</h3>
          <div class="sub">手动粘贴评论，系统按词典归类原因，你来判断改什么</div>
          <div class="toolbar"><button class="btn" id="rAdd">录入评论</button></div>`+
          U.table({cols:[
            {t:'产品',f:r=>U.esc(PM[r.productId]?PM[r.productId].sku:'—')},
            {t:'日期',k:'date'},{t:'星级',k:'rating'},
            {t:'情感',f:r=>U.tag(r.sentiment||'—',r.sentiment==='负'?'red':(r.sentiment==='中'?'yellow':'green'))},
            {t:'原因标签',k:'reasonTags'},{t:'原文',f:r=>U.esc((r.quote||'').slice(0,30))}
          ],rows:revs.slice(0,30),empty:'暂无评论记录',
          actions:r=>`<button class="btn-ghost btn-sm" data-rd="${r.id}">删除</button>`})+`
          <div id="cRev" class="chart" style="margin-top:10px"></div></div>
        <div class="card"><h3>文案素材库</h3>
          <div class="sub">标题公式 / 卖点模板 / A+ 模块创意，随用随取</div>
          <div class="toolbar"><button class="btn" id="kAdd">新增素材</button></div>`+
          U.table({cols:[{t:'类型',k:'kind'},{t:'内容',k:'text'}],
            rows:(await DB.all('keywords')).filter(k=>k.kind!=='关键词'),empty:'暂无素材',
            actions:r=>`<button class="btn-ghost btn-sm" data-kd="${r.id}">删除</button>`})+`
          <div style="margin-top:12px;font-size:12px;color:var(--ink2);line-height:1.8">
            标题公式：品牌 + 核心关键词 + 关键属性 + 核心卖点 + 规格/数量<br>
            五点结构：痛点切入 → 解决方案 → 参数规格 → 场景适用 → 售后保障<br>
            注意：非母语机器翻译的 Listing 转化率极差，务必母语校对
          </div></div>
      </div>`;
    const lfields=[{k:'productId',t:'产品',type:'select',opts:Object.values(PM).filter(p=>App.inScope(p.storeId)).map(p=>({v:p.id,t:p.sku+' '+p.name}))},
      {k:'title',t:'标题',type:'textarea'},{k:'bullets',t:'五点数量',type:'number'},
      {k:'images',t:'图片数量',type:'number'},{k:'aPlus',t:'A+ 是否上线',type:'select',opts:[{v:1,t:'是'},{v:0,t:'否'}]},
      {k:'keywords',t:'关键词',type:'textarea'},{k:'lastAudit',t:'最近审查日期',type:'date'}];
    root.querySelector('#lAdd').onclick=()=>U.modal({title:'新增 Listing',body:U.formFields(lfields),
      onOk:async b=>{await DB.put('listings',U.formValues(b))},after:()=>App.refresh()});
    root.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>{
      const l=await DB.get('listings',Number(x.dataset.e));
      U.modal({title:'编辑 Listing',body:U.formFields(lfields,l),onOk:async b=>{
        const v=U.formValues(b);v.id=l.id;await DB.put('listings',v)},after:()=>App.refresh()});
    });
    root.querySelector('#rAdd').onclick=()=>U.modal({title:'录入评论',body:U.formFields([
      {k:'productId',t:'产品',type:'select',opts:Object.values(PM).map(p=>({v:p.id,t:p.sku}))},
      {k:'date',t:'日期',type:'date',def:U.today()},
      {k:'rating',t:'星级',type:'select',opts:[1,2,3,4,5].map(v=>({v,t:String(v)}))},
      {k:'sentiment',t:'情感',type:'select',opts:['正','中','负'].map(v=>({v,t:v}))},
      {k:'reasonTags',t:'原因标签',ph:'尺寸,描述不符,质量,物流,包装,客服'},
      {k:'quote',t:'原文摘要',type:'textarea'}
    ]),onOk:async b=>{await DB.put('reviews',U.formValues(b))},after:()=>App.refresh()});
    root.querySelectorAll('[data-rd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该评论记录？',
      async()=>{await DB.del('reviews',Number(x.dataset.rd));App.refresh()}));
    root.querySelector('#kAdd').onclick=()=>U.modal({title:'新增素材',body:U.formFields([
      {k:'kind',t:'类型',type:'select',opts:['标题公式','卖点模板','A+模块','客服话术'].map(v=>({v,t:v}))},
      {k:'text',t:'内容',type:'textarea'}
    ]),onOk:async b=>{await DB.put('keywords',U.formValues(b))},after:()=>App.refresh()});
    root.querySelectorAll('[data-kd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该素材？',
      async()=>{await DB.del('keywords',Number(x.dataset.kd));App.refresh()}));

    const cnt={}; revs.forEach(r=>{const t=(r.reasonTags||'未分类').split(/[,，]/);
      t.forEach(x=>{const k=x.trim()||'未分类';cnt[k]=(cnt[k]||0)+1})});
    U.chart(document.getElementById('cRev'),{
      tooltip:{trigger:'axis'},
      grid:{left:70,right:20,top:10,bottom:20},
      xAxis:{type:'value'},yAxis:{type:'category',data:Object.keys(cnt)},
      series:[{type:'bar',data:Object.values(cnt),itemStyle:{color:'#C0392B'}}]
    });
  };

  /* ============ 10. 广告管理 ============ */
  P.ads=async root=>{
    U.clearCharts();
    const PM=await pm();
    const ads=(await DB.all('ads')).filter(a=>App.inScope(a.storeId));
    const rows=ads.map(a=>{
      const p=PM[a.productId]||{}; const pf=p.price?U.profit(p):null;
      return Object.assign({},a,{_acos:a.sales?a.spend/a.sales*100:null,
        _be:pf?pf.breakEvenAcos:null,_ctr:(a.clicks&&a.impressions)?a.clicks/a.impressions*100:null,
        _cpc:(a.clicks&&a.spend)?a.spend/a.clicks:null,_sku:p.sku||'—'});
    });
    rows.sort((a,b)=>(b.spend||0)-(a.spend||0));
    const waste=rows.filter(r=>r.spend>0&&(!r.sales||r.sales===0));
    root.innerHTML=
      U.kpi([
        {label:'广告花费合计',value:U.money(rows.reduce((a,b)=>a+(Number(b.spend)||0),0))},
        {label:'广告销售合计',value:U.money(rows.reduce((a,b)=>a+(Number(b.sales)||0),0))},
        {label:'综合 ACOS',value:U.pct(rows.reduce((a,b)=>a+(Number(b.sales)||0),0)?
          rows.reduce((a,b)=>a+(Number(b.spend)||0),0)/rows.reduce((a,b)=>a+(Number(b.sales)||0),0)*100:null)},
        {label:'超保本线活动',value:String(rows.filter(r=>r._acos!=null&&r._be!=null&&r._acos>r._be).length),level:'alert'},
        {label:'有花费无产出',value:String(waste.length),level:waste.length?'warn':''}
      ])+
      `<div class="card"><h3>广告活动</h3>
        <div class="sub">ACOS 与保本线同源：保本 ACOS 取自产品成本底座，口径唯一</div>
        <div class="toolbar"><button class="btn" id="aAdd">新增活动</button>
          <button class="btn-ghost" id="aCsv">导出 CSV</button></div>`+
      U.table({cols:[
        {t:'SKU',k:'_sku'},{t:'活动',k:'name'},{t:'类型',k:'campaignType'},
        {t:'花费',num:true,f:r=>U.money(r.spend)},{t:'销售',num:true,f:r=>U.money(r.sales)},
        {t:'ACOS',num:true,f:r=>U.pct(r._acos)+' '+U.dot(r._acos==null?'gray':(r._be!=null&&r._acos>r._be?'red':'green'))},
        {t:'保本ACOS',num:true,f:r=>U.pct(r._be)},
        {t:'CTR',num:true,f:r=>U.pct(r._ctr)},{t:'CPC',num:true,f:r=>U.money(r._cpc)}
      ],rows,empty:'暂无广告数据',
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button>
        <button class="btn-ghost btn-sm" data-d="${r.id}">删除</button>`})+`</div>
      <div class="grid g2">
        <div class="card"><h3>花费 Top 活动</h3><div id="cAds" class="chart"></div></div>
        <div class="card"><h3>搜索词分析</h3>
          <div class="sub">从后台导出搜索词报告后，在「数据导入」页导入</div>
          <div class="toolbar"><button class="btn" id="stAdd">手动新增</button></div>`+
          U.table({cols:[{t:'词',k:'term'},{t:'曝光',k:'impressions',num:true},{t:'点击',k:'clicks',num:true},
            {t:'花费',num:true,f:r=>U.money(r.spend)},{t:'订单',k:'orders',num:true},
            {t:'ACOS',num:true,f:r=>U.pct(r.sales?r.spend/r.sales*100:null)}],
            rows:(await DB.all('searchterms')).slice(0,30),empty:'暂无搜索词数据',
            actions:r=>`<button class="btn-ghost btn-sm" data-sd="${r.id}">删除</button>`})+`</div>
      </div>`;
    const afields=[{k:'productId',t:'产品',type:'select',opts:Object.values(PM).map(p=>({v:p.id,t:p.sku}))},
      {k:'name',t:'活动名称'},{k:'campaignType',t:'类型',type:'select',opts:['SP-Auto','SP-Manual','SB','SD'].map(v=>({v,t:v}))},
      {k:'dailyBudget',t:'日预算',type:'number'},{k:'spend',t:'花费',type:'number',step:'0.01'},
      {k:'sales',t:'广告销售',type:'number',step:'0.01'},{k:'impressions',t:'曝光',type:'number'},
      {k:'clicks',t:'点击',type:'number'},{k:'date',t:'日期',type:'date',def:U.today()}];
    root.querySelector('#aAdd').onclick=()=>U.modal({title:'新增广告活动',body:U.formFields(afields),
      onOk:async b=>{await DB.put('ads',U.formValues(b))},after:()=>App.refresh()});
    root.querySelector('#aCsv').onclick=()=>U.exportCSV('commander_ads.csv',
      rows.map(r=>({SKU:r._sku,活动:r.name,类型:r.campaignType,花费:r.spend,销售:r.sales,
        ACOS:r._acos==null?'':+r._acos.toFixed(2),保本ACOS:r._be==null?'':+r._be.toFixed(2)})),
      ['SKU','活动','类型','花费','销售','ACOS','保本ACOS']);
    root.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>{
      const a=await DB.get('ads',Number(x.dataset.e));
      U.modal({title:'编辑活动',body:U.formFields(afields,a),onOk:async b=>{
        const v=U.formValues(b);v.id=a.id;await DB.put('ads',v)},after:()=>App.refresh()});
    });
    root.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>U.confirmBox('删除该活动？',
      async()=>{await DB.del('ads',Number(x.dataset.d));App.refresh()}));
    root.querySelector('#stAdd').onclick=()=>U.modal({title:'新增搜索词',body:U.formFields([
      {k:'term',t:'搜索词'},{k:'impressions',t:'曝光',type:'number'},{k:'clicks',t:'点击',type:'number'},
      {k:'spend',t:'花费',type:'number',step:'0.01'},{k:'sales',t:'销售',type:'number',step:'0.01'},
      {k:'orders',t:'订单',type:'number'},{k:'date',t:'日期',type:'date',def:U.today()}
    ]),onOk:async b=>{await DB.put('searchterms',U.formValues(b))},after:()=>App.refresh()});
    root.querySelectorAll('[data-sd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该搜索词？',
      async()=>{await DB.del('searchterms',Number(x.dataset.sd));App.refresh()}));

    const top=rows.slice(0,8);
    U.chart(document.getElementById('cAds'),{
      tooltip:{trigger:'axis'},grid:{left:90,right:20,top:10,bottom:20},
      xAxis:{type:'value'},yAxis:{type:'category',data:top.map(r=>r.name).reverse()},
      series:[{type:'bar',data:top.map(r=>+(Number(r.spend)||0).toFixed(2)).reverse(),itemStyle:{color:'#1E5FA8'}}]
    });
  };

  /* ============ 11. 库存与履约 ============ */
  P.inventory=async root=>{
    const PM=await pm(), r=U.R();
    const invs=(await DB.all('inventory')).filter(i=>PM[i.productId]&&App.inScope(PM[i.productId].storeId));
    const plans=await DB.all('ship_plans');
    // 日均销量：优先用 kpi_daily 近 30 天日均订单动态计算；无销售数据时才回退到录入兜底值
    const avg=await U.dailyAvgMap();
    const rows=invs.map(i=>{
      const dyn = avg[i.productId]!=null ? avg[i.productId] : (Number(i.dailySalesAvg)||0);
      const avail=(Number(i.fbaQty)||0)+(Number(i.inboundQty)||0)-(Number(i.reserveQty)||0);
      const cover=dyn>0?avail/dyn:null;
      const need=dyn*(Number(i.leadDays)||0)*1.2;
      return Object.assign({},i,{_sku:PM[i.productId].sku,_avail:avail,_cover:cover,_daily:dyn,_dyn:avg[i.productId]!=null,
        _lastOrder:cover==null?'—':U.addDays(U.today(),Math.max(0,Math.floor(cover)-(Number(i.leadDays)||0))),
        _suggest:Math.max(0,Math.round(need-avail))});
    });
    root.innerHTML=
      U.kpi([
        {label:'断货风险 SKU',value:String(rows.filter(x=>x._cover!=null&&x._cover<r.stockRed).length),level:'alert'},
        {label:'预警区间 SKU',value:String(rows.filter(x=>x._cover!=null&&x._cover>=r.stockRed&&x._cover<r.stockYellow).length),level:'warn'},
        {label:'在途件数',value:U.f0(rows.reduce((a,b)=>a+(Number(b.inboundQty)||0),0))},
        {label:'库龄>180 天',value:U.f0(rows.reduce((a,b)=>a+(Number(b.aging180)||0),0)),level:'alert'}
      ])+
      `<div class="card"><h3>库存台账与补货计算</h3>
        <div class="sub">可售天数 = (FBA + 在途 - 预留) / 日均销量；建议补货量按补货周期 × 1.2 安全系数。日均销量取自近 30 天日均订单，每日自动更新（kpi_daily 无数据时才用录入兜底值）</div>
        <div class="toolbar"><button class="btn" id="iAdd">新增库存记录</button>
          <button class="btn-ghost" id="iCsv">导出 CSV</button></div>`+
      U.table({cols:[
        {t:'SKU',k:'_sku'},{t:'FBA',k:'fbaQty',num:true},{t:'在途',k:'inboundQty',num:true},
        {t:'预留',k:'reserveQty',num:true},{t:'日均(近30天)',num:true,f:x=>`${(Number(x._daily)||0).toFixed(1)}${x._dyn?'':' (兜底)'}`,num:true},
        {t:'可售天数',num:true,f:x=>x._cover==null?'—':x._cover.toFixed(0)+' 天 '+U.dot(x._cover<r.stockRed?'red':(x._cover<r.stockYellow?'yellow':'green'))},
        {t:'最晚补货',f:x=>U.esc(x._lastOrder)},{t:'建议补货',num:true,f:x=>U.f0(x._suggest)},
        {t:'库龄90/180',f:x=>`${x.aging90||0} / ${x.aging180||0}`}
      ],rows,empty:'暂无库存数据',
      actions:x=>`<button class="btn-ghost btn-sm" data-e="${x.id}">编辑</button>`})+`</div>
      <div class="grid g2">
        <div class="card"><h3>入仓计划</h3>
          <div class="sub">旺季按节点倒推入仓；系统记计划与差异，物流执行由你安排</div>
          <div class="toolbar"><button class="btn" id="spAdd">新增入仓计划</button></div>`+
          U.table({cols:[{t:'计划名',k:'name'},{t:'发货日',k:'shipDate'},{t:'预计到仓',k:'etaDate'},
            {t:'件数',k:'qty',num:true},{t:'状态',k:'status'},{t:'接收差异',k:'diff',num:true}],
            rows:plans,empty:'暂无入仓计划',
            actions:x=>`<button class="btn-ghost btn-sm" data-spd="${x.id}">删除</button>`})+`</div>
        <div class="card"><h3>库龄与长期仓储费</h3>
          <div class="sub">库龄 >180 天即长期仓储费风险；优先清仓或提报促销</div>
          <div id="cAge" class="chart"></div></div>
      </div>`;
    const ifields=[{k:'productId',t:'产品',type:'select',opts:Object.values(PM).map(p=>({v:p.id,t:p.sku}))},
      {k:'fbaQty',t:'FBA 可售',type:'number'},{k:'inboundQty',t:'在途',type:'number'},
      {k:'reserveQty',t:'预留',type:'number'},{k:'dailySalesAvg',t:'日均销量兜底(近30天有数据时不生效)',type:'number',step:'0.1'},
      {k:'leadDays',t:'补货周期(天)',type:'number'},{k:'aging90',t:'库龄>90天件数',type:'number'},
      {k:'aging180',t:'库龄>180天件数',type:'number'}];
    root.querySelector('#iAdd').onclick=()=>U.modal({title:'新增库存记录',body:U.formFields(ifields),
      onOk:async b=>{await DB.put('inventory',U.formValues(b))},after:()=>App.refresh()});
    root.querySelector('#iCsv').onclick=()=>U.exportCSV('commander_inventory.csv',
      rows.map(x=>({SKU:x._sku,FBA:x.fbaQty,在途:x.inboundQty,预留:x.reserveQty,日均:x._daily,
        可售天数:x._cover==null?'':Math.round(x._cover),最晚补货:x._lastOrder,建议补货:x._suggest,
        库龄90:x.aging90||0,库龄180:x.aging180||0})),
      ['SKU','FBA','在途','预留','日均','可售天数','最晚补货','建议补货','库龄90','库龄180']);
    root.querySelectorAll('[data-e]').forEach(x=>x.onclick=async()=>{
      const i=await DB.get('inventory',Number(x.dataset.e));
      U.modal({title:'编辑库存',body:U.formFields(ifields,i),onOk:async b=>{
        const v=U.formValues(b);v.id=i.id;await DB.put('inventory',v)},after:()=>App.refresh()});
    });
    root.querySelector('#spAdd').onclick=()=>U.modal({title:'新增入仓计划',body:U.formFields([
      {k:'name',t:'计划名称'},{k:'shipDate',t:'发货日',type:'date'},
      {k:'etaDate',t:'预计到仓',type:'date'},{k:'qty',t:'件数',type:'number'},
      {k:'status',t:'状态',type:'select',opts:['待发货','在途','已到仓','接收中'].map(v=>({v,t:v}))},
      {k:'diff',t:'接收差异',type:'number'}
    ]),onOk:async b=>{await DB.put('ship_plans',U.formValues(b))},after:()=>App.refresh()});
    root.querySelectorAll('[data-spd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该计划？',
      async()=>{await DB.del('ship_plans',Number(x.dataset.spd));App.refresh()}));
    U.chart(document.getElementById('cAge'),{
      tooltip:{trigger:'axis'},legend:{data:['库龄>90','库龄>180'],top:0},
      grid:{left:60,right:20,top:30,bottom:30},
      xAxis:{type:'category',data:rows.map(x=>x._sku)},yAxis:{type:'value'},
      series:[{name:'库龄>90',type:'bar',stack:'a',data:rows.map(x=>Number(x.aging90)||0),itemStyle:{color:'#D4A017'}},
        {name:'库龄>180',type:'bar',stack:'a',data:rows.map(x=>Number(x.aging180)||0),itemStyle:{color:'#C0392B'}}]
    });
  };

  /* ============ 12. 退货与索赔 ============ */
  P.returns=async root=>{
    U.clearCharts();
    const PM=await pm();
    const rets=(await DB.all('returns')).filter(x=>PM[x.productId]&&App.inScope(PM[x.productId].storeId));
    const claims=await DB.all('claims');
    const cnt={}; rets.forEach(r=>{const k=r.reason||'未分类';cnt[k]=(cnt[k]||0)+1});
    root.innerHTML=
      U.kpi([
        {label:'退货单',value:String(rets.length)},
        {label:'退款金额',value:U.money(rets.reduce((a,b)=>a+(Number(b.refundAmount)||0),0))},
        {label:'待索赔金额',value:U.money(claims.filter(c=>!c.claimed).reduce((a,b)=>a+(Number(b.amount)||0),0)),level:'warn'},
        {label:'已索赔',value:U.money(claims.filter(c=>c.claimed).reduce((a,b)=>a+(Number(b.amount)||0),0))}
      ])+
      `<div class="grid g2">
        <div class="card"><h3>退货记录</h3>
          <div class="sub">退货原因与差评标签交叉看，才能判断是产品问题还是描述问题</div>
          <div class="toolbar"><button class="btn" id="rtAdd">新增退货</button></div>`+
          U.table({cols:[{t:'SKU',f:r=>U.esc(PM[r.productId]?PM[r.productId].sku:'—')},
            {t:'日期',k:'date'},{t:'原因',k:'reason'},{t:'退款',num:true,f:r=>U.money(r.refundAmount)},
            {t:'已处理',f:r=>r.resolved?U.tag('是','green'):U.tag('否','yellow')}],
            rows:rets.slice(0,50),empty:'暂无退货数据',
            actions:r=>`<button class="btn-ghost btn-sm" data-rd="${r.id}">删除</button>`})+`</div>
        <div class="card"><h3>FBA 丢失损坏索赔</h3>
          <div class="sub">FBA 仓内丢失/损坏可向平台索赔，超过窗口期无法追回</div>
          <div class="toolbar"><button class="btn" id="clAdd">新增索赔</button></div>`+
          U.table({cols:[{t:'类型',k:'type'},{t:'发生日',k:'date'},{t:'件数',k:'qty',num:true},
            {t:'金额',num:true,f:r=>U.money(r.amount)},
            {t:'状态',f:r=>r.claimed?U.tag('已索赔','green'):U.tag('待索赔','red')},
            {t:'窗口截止',k:'windowEnd'}],
            rows:claims,empty:'暂无索赔记录',
            actions:r=>`<button class="btn-ghost btn-sm" data-cl="${r.id}">标记已索赔</button>
              <button class="btn-ghost btn-sm" data-cld="${r.id}">删除</button>`})+`
          <div id="cRet" class="chart" style="margin-top:10px"></div></div>
      </div>`;
    root.querySelector('#rtAdd').onclick=()=>U.modal({title:'新增退货',body:U.formFields([
      {k:'productId',t:'产品',type:'select',opts:Object.values(PM).map(p=>({v:p.id,t:p.sku}))},
      {k:'date',t:'日期',type:'date',def:U.today()},
      {k:'reason',t:'原因',type:'select',opts:['尺寸不符','描述不符','质量问题','物流损坏','不喜欢','其他'].map(v=>({v,t:v}))},
      {k:'refundAmount',t:'退款金额',type:'number',step:'0.01'},
      {k:'resolved',t:'已处理',type:'select',opts:[{v:0,t:'否'},{v:1,t:'是'}]}
    ]),onOk:async b=>{await DB.put('returns',U.formValues(b))},after:()=>App.refresh()});
    root.querySelectorAll('[data-rd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该退货记录？',
      async()=>{await DB.del('returns',Number(x.dataset.rd));App.refresh()}));
    root.querySelector('#clAdd').onclick=()=>U.modal({title:'新增索赔',body:U.formFields([
      {k:'type',t:'类型',type:'select',opts:['仓内丢失','仓内损坏','客户退货未入库','多收仓储费'].map(v=>({v,t:v}))},
      {k:'date',t:'发生日',type:'date',def:U.today()},{k:'qty',t:'件数',type:'number'},
      {k:'amount',t:'金额',type:'number',step:'0.01'},
      {k:'windowEnd',t:'索赔窗口截止',type:'date',def:U.addDays(U.today(),60)}
    ]),onOk:async b=>{const v=U.formValues(b);v.claimed=false;await DB.put('claims',v)},after:()=>App.refresh()});
    root.querySelectorAll('[data-cl]').forEach(x=>x.onclick=async()=>{
      const c=await DB.get('claims',Number(x.dataset.cl));c.claimed=true;await DB.put('claims',c);App.refresh()});
    root.querySelectorAll('[data-cld]').forEach(x=>x.onclick=()=>U.confirmBox('删除该索赔？',
      async()=>{await DB.del('claims',Number(x.dataset.cld));App.refresh()}));
    U.chart(document.getElementById('cRet'),{
      tooltip:{trigger:'item'},legend:{bottom:0},
      series:[{type:'pie',radius:['40%','65%'],data:Object.keys(cnt).map(k=>({name:k,value:cnt[k]})),
        color:['#C0392B','#D4A017','#1E5FA8','#7E8C99','#27AE60']}]
    });
  };

  /* ============ 13. 促销台账 ============ */
  P.promos=async root=>{
    const PM=await pm();
    const rows=(await DB.all('promos')).filter(x=>!x.productId||(PM[x.productId]&&App.inScope(PM[x.productId].storeId)));
    root.innerHTML=`<div class="card"><h3>促销与 Coupon 台账</h3>
      <div class="sub">Deal 费与 Coupon 折让会直接吃掉毛利，提报前先算净利，不要为冲 GMV 亏本参加</div>
      <div class="toolbar"><button class="btn" id="pmAdd">新增促销</button>
        <button class="btn-ghost" id="pmCsv">导出 CSV</button></div>`+
      U.table({cols:[
        {t:'SKU',f:r=>U.esc(PM[r.productId]?PM[r.productId].sku:'全店')},
        {t:'类型',k:'type'},{t:'开始',k:'startDate'},{t:'结束',k:'endDate'},
        {t:'折扣',f:r=>U.pct(r.discount)},
        {t:'费用',num:true,f:r=>U.money(r.fee)},
        {t:'状态',f:r=>{
          const t=U.today();
          if(r.endDate&&r.endDate<t) return U.tag('已结束','gray');
          if(r.startDate&&r.startDate>t) return U.tag('未开始','yellow');
          return U.tag('进行中','green');}}
      ],rows,empty:'暂无促销记录',
      actions:r=>`<button class="btn-ghost btn-sm" data-pd="${r.id}">删除</button>`})+`</div>`;
    root.querySelector('#pmAdd').onclick=()=>U.modal({title:'新增促销',body:U.formFields([
      {k:'productId',t:'产品',type:'select',opts:[{v:'',t:'全店'}].concat(Object.values(PM).map(p=>({v:p.id,t:p.sku})))},
      {k:'type',t:'类型',type:'select',opts:['Coupon','Lightning Deal','7-Day Deal','Prime 专享'].map(v=>({v,t:v}))},
      {k:'startDate',t:'开始',type:'date'},{k:'endDate',t:'结束',type:'date'},
      {k:'discount',t:'折扣(%)',type:'number',step:'0.1'},
      {k:'fee',t:'活动费用',type:'number',step:'0.01'}
    ]),onOk:async b=>{const v=U.formValues(b);if(v.productId==='')delete v.productId;
      await DB.put('promos',v)},after:()=>App.refresh()});
    root.querySelector('#pmCsv').onclick=()=>U.exportCSV('commander_promos.csv',
      rows.map(r=>({SKU:PM[r.productId]?PM[r.productId].sku:'全店',类型:r.type,开始:r.startDate,结束:r.endDate,
        折扣:r.discount,费用:r.fee})),['SKU','类型','开始','结束','折扣','费用']);
    root.querySelectorAll('[data-pd]').forEach(x=>x.onclick=()=>U.confirmBox('删除该促销？',
      async()=>{await DB.del('promos',Number(x.dataset.pd));App.refresh()}));
  };

  /* ============ 14. 数据导入（CSV） ============ */
  const IMPORT_TARGETS={
    kpi_daily:{t:'每日业务数据（Business Reports）',fields:['date','sessions','orders','sales','adSpend','adSales','refunds']},
    searchterms:{t:'搜索词报告（Search Term Report）',fields:['term','impressions','clicks','spend','sales','orders','date']},
    ads:{t:'广告活动报告',fields:['name','campaignType','spend','sales','impressions','clicks','date']},
    returns:{t:'退货报告',fields:['date','reason','refundAmount']},
    inventory:{t:'库存报告',fields:['fbaQty','inboundQty','reserveQty']}
  };
  P.imports=async root=>{
    const PM=await pm();
    const tgt=App.state.impTarget||'kpi_daily';
    root.innerHTML=`<div class="card"><h3>后台报告 CSV 导入</h3>
      <div class="sub">从卖家后台导出报告后在此导入，本地解析入库，不做任何联网抓取。导入前请确认列名映射正确</div>
      <div class="toolbar">
        <select id="iTgt" class="mini">${Object.keys(IMPORT_TARGETS).map(k=>`<option value="${k}" ${k===tgt?'selected':''}>${IMPORT_TARGETS[k].t}</option>`).join('')}</select>
        <input type="file" id="iFile" accept=".csv,.txt" style="max-width:240px">
        <button class="btn-ghost" id="iSample">查看示例格式</button>
      </div>
      <label class="f">或直接粘贴 CSV 内容</label>
      <textarea id="iText" placeholder="date,sessions,orders,sales,adSpend,adSales,refunds"></textarea>
      <div class="toolbar" style="margin-top:10px">
        <button class="btn" id="iParse">解析并配置映射</button>
      </div>
      <div id="iMap"></div>
    </div>
    <div class="card"><h3>导入说明</h3>
      <div style="font-size:13px;line-height:1.9;color:var(--ink2)">
        1. 卖家后台 → 数据报告 → 业务报告 / 广告报告 → 导出 CSV<br>
        2. 在此选择目标表，粘贴或选择文件后解析<br>
        3. 系统按列名匹配字段，未匹配到的留空即不导入<br>
        4. 含 SKU/ASIN 列时可按产品匹配，否则归属到下方所选店铺<br>
        5. 导入为追加写入，相同日期相同产品会被覆盖更新
      </div>
    </div>`;
    let parsed=[];
    root.querySelector('#iTgt').onchange=e=>{App.state.impTarget=e.target.value;App.refresh()};
    root.querySelector('#iSample').onclick=()=>U.modal({title:'示例格式',okText:'关闭',
      body:`<pre style="font-size:12px;line-height:1.6;white-space:pre-wrap">date,sessions,orders,sales,adSpend,adSales,refunds
2026-09-01,1200,72,2150.40,320.50,980.20,3
2026-09-02,1310,80,2380.10,340.00,1102.30,2</pre>`});
    const readFile=f=>new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsText(f,'utf-8')});
    root.querySelector('#iFile').onchange=async e=>{
      const f=e.target.files[0]; if(!f) return;
      root.querySelector('#iText').value=await readFile(f);
    };
    root.querySelector('#iParse').onclick=async()=>{
      const storeList=await DB.all('stores');
      const txt=root.querySelector('#iText').value;
      if(!txt.trim()){U.toast('请先粘贴或选择文件');return}
      parsed=U.parseCSV(txt);
      if(!parsed.length){U.toast('解析结果为空');return}
      const headers=Object.keys(parsed[0]);
      const fields=IMPORT_TARGETS[tgt].fields;
      const box=root.querySelector('#iMap');
      box.innerHTML=`<div class="card" style="background:#EFF5FB">
        <h3>字段映射（共 ${parsed.length} 行）</h3>
        <div class="grid g3">${fields.map(f=>`
          <label class="f">${f}
            <select name="map_${f}" style="margin-top:4px">
              <option value="">— 不导入 —</option>
              ${headers.map(h=>`<option value="${U.esc(h)}" ${h.toLowerCase()===f.toLowerCase()?'selected':''}>${U.esc(h)}</option>`).join('')}
            </select></label>`).join('')}
          <label class="f">产品匹配列（SKU/ASIN）
            <select name="matchCol" style="margin-top:4px">
              <option value="">— 归属所选店铺 —</option>
              ${headers.map(h=>`<option value="${U.esc(h)}">${U.esc(h)}</option>`).join('')}
            </select></label>
          <label class="f">归属店铺
            <select name="fallbackStore" style="margin-top:4px">
              ${storeList.map(s=>`<option value="${s.id}">${U.esc(s.name)}</option>`).join('')}
            </select></label>
          <label class="f">日期列（如报告含日期）
            <select name="dateCol" style="margin-top:4px">
              <option value="">— 用今天 —</option>
              ${headers.map(h=>`<option value="${U.esc(h)}" ${/date|日期/i.test(h)?'selected':''}>${U.esc(h)}</option>`).join('')}
            </select></label>
        </div>
        <div class="toolbar" style="margin-top:12px"><button class="btn" id="iRun">确认导入 ${parsed.length} 行</button></div>
      </div>`;
      box.querySelector('#iRun').onclick=async()=>{
        const sel=box.querySelectorAll('select');
        const map={},extra={};
        sel.forEach(s=>{
          if(s.name.startsWith('map_')) map[s.name.slice(4)]=s.value;
          else extra[s.name]=s.value;
        });
        const skuIdx={};
        Object.values(PM).forEach(p=>{if(p.sku)skuIdx[String(p.sku).toLowerCase()]=p.id;
          if(p.asin)skuIdx[String(p.asin).toLowerCase()]=p.id});
        let ok=0,skip=0;
        for(const row of parsed){
          const o={};
          let matched=null;
          if(extra.matchCol){ const key=String(row[extra.matchCol]||'').toLowerCase(); matched=skuIdx[key]||null }
          if(matched){ o.productId=matched; const p=PM[matched]; if(p)o.storeId=p.storeId }
          else { o.storeId=Number(extra.fallbackStore)||null; if(!o.storeId){skip++;continue} }
          if(extra.dateCol&&row[extra.dateCol]) o.date=String(row[extra.dateCol]).slice(0,10);
          else o.date=U.today();
          Object.keys(map).forEach(f=>{
            if(!map[f]) return;
            let v=row[map[f]];
            if(v!=null&&v!=='') v=String(v).replace(/[$,%\s]/g,'');
            o[f]=(v===''||v==null)?null:(isNaN(Number(v))?v:Number(v));
          });
          await DB.put(tgt,o); ok++;
        }
        U.toast(`导入完成：成功 ${ok} 行，跳过 ${skip} 行`);
        App.refresh();
      };
    };
  };

  /* ============ 新增 SOP 页面：库存/售后/推广 ============ */
  P.purchase=async root=>{
    const cols=[{t:'供应商',k:'supplier'},{t:'SKU',k:'sku'},{t:'产品',k:'productName'},
      {t:'数量',k:'qty',num:1},{t:'单价￥',k:'unitPrice',num:1,f:v=>U.money(v,'￥')},
      {t:'金额￥',k:'amount',num:1,f:v=>U.money(v,'￥')},{t:'下单日',k:'orderDate'},{t:'预计到货',k:'etaDate'},
      {t:'状态',k:'status',f:v=>U.tag(v,v==='已到货'?'green':(v==='在途'?'yellow':'gray'))}];
    const fields=[{k:'supplier',t:'供应商'},{k:'sku',t:'SKU'},{k:'productName',t:'产品名称'},
      {k:'qty',t:'数量',type:'number'},{k:'unitPrice',t:'单价(￥)',type:'number',step:'0.1'},
      {k:'orderDate',t:'下单日',type:'date'},{k:'etaDate',t:'预计到货',type:'date'},
      {k:'status',t:'状态',type:'select',opts:[{v:'已到货',t:'已到货'},{v:'在途',t:'在途'},{v:'待发货',t:'待发货'}]}];
    const draw=async()=>root.querySelector('#t').innerHTML=U.table({cols,rows:await DB.all('purchase'),
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    root.innerHTML=`${U.card('采购记录','供应商 / 批次 / 交期一目了然，关联库存补货决策','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增采购</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增采购',body:U.formFields(fields),
      onOk:b=>{const o=U.formValues(b);o.amount=+(o.qty*o.unitPrice).toFixed(2);DB.put('purchase',o).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('purchase',Number(dl));await draw()});
      if(ed){const r=await DB.get('purchase',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{const o=U.formValues(b);o.amount=+(o.qty*o.unitPrice).toFixed(2);Object.assign(r,o);DB.put('purchase',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.logistics=async root=>{
    const cols=[{t:'渠道',k:'channel'},{t:'方式',k:'mode'},{t:'起运地',k:'origin'},
      {t:'时效(天)',k:'transitDays',num:1},{t:'单价(￥/kg)',k:'pricePerKg',num:1,f:U.money},
      {t:'最低收费',k:'minCharge',num:1,f:U.money},{t:'备注',k:'note'}];
    const fields=[{k:'channel',t:'渠道'},{k:'mode',t:'方式',type:'select',opts:[{v:'海运',t:'海运'},{v:'空运',t:'空运'},{v:'快递',t:'快递'},{v:'铁路',t:'铁路'}]},
      {k:'origin',t:'起运地'},{k:'transitDays',t:'时效(天)',type:'number'},{k:'pricePerKg',t:'单价(￥/kg)',type:'number',step:'0.1'},
      {k:'minCharge',t:'最低收费',type:'number',step:'1'},{k:'note',t:'备注',type:'textarea'}];
    const draw=async()=>root.querySelector('#t').innerHTML=U.table({cols,rows:await DB.all('logistics'),
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    root.innerHTML=`${U.card('物流比价','多渠道时效 / 单价 / 最低收费横向对比，择优下单','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增渠道</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增物流渠道',body:U.formFields(fields),
      onOk:b=>{DB.put('logistics',U.formValues(b)).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('logistics',Number(dl));await draw()});
      if(ed){const r=await DB.get('logistics',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('logistics',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.qc=async root=>{
    const cols=[{t:'SKU',k:'sku'},{t:'产品',k:'productName'},{t:'质检项目',k:'item'},
      {t:'标准',k:'standard'},{t:'结果',k:'result',f:v=>U.tag(v,v==='合格'?'green':(v==='不合格'?'red':'yellow'))},
      {t:'日期',k:'date'},{t:'质检员',k:'inspector'}];
    const fields=[{k:'sku',t:'SKU'},{k:'productName',t:'产品名称'},{k:'item',t:'质检项目'},
      {k:'standard',t:'标准'},{k:'result',t:'结果',type:'select',opts:[{v:'合格',t:'合格'},{v:'不合格',t:'不合格'},{v:'待检',t:'待检'}]},
      {k:'date',t:'日期',type:'date'},{k:'inspector',t:'质检员'}];
    const draw=async()=>root.querySelector('#t').innerHTML=U.table({cols,rows:await DB.all('qc'),
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    root.innerHTML=`${U.card('质检','出厂前 / 入仓前质检记录，不合格批次拦截','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增质检</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增质检',body:U.formFields(fields),
      onOk:b=>{DB.put('qc',U.formValues(b)).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('qc',Number(dl));await draw()});
      if(ed){const r=await DB.get('qc',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('qc',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.newlaunch=async root=>{
    const prods=await DB.all('products'); const pm={}; prods.forEach(p=>pm[p.id]=p.name);
    const cols=[{t:'产品',k:'pid',f:(v,r)=>pm[r.productId]||pm[+r.productId]||('#'+r.productId)},
      {t:'阶段',k:'phase'},{t:'周次',k:'week',num:1},{t:'动作',k:'action'},
      {t:'目标',k:'target'},{t:'实际',k:'actual'},{t:'状态',k:'status',f:v=>U.tag(v,v==='已完成'?'green':(v==='进行中'?'yellow':'gray'))}];
    const fields=[{k:'productId',t:'产品',type:'select',opts:prods.map(p=>({v:p.id,t:p.name}))},
      {k:'phase',t:'阶段',type:'select',opts:[{v:'准备期',t:'准备期'},{v:'爆发期1',t:'爆发期1'},{v:'爆发期2',t:'爆发期2'},{v:'稳定期',t:'稳定期'}]},
      {k:'week',t:'周次',type:'number'},{k:'action',t:'动作'},{k:'target',t:'目标'},{k:'actual',t:'实际'},
      {k:'status',t:'状态',type:'select',opts:[{v:'未开始',t:'未开始'},{v:'进行中',t:'进行中'},{v:'已完成',t:'已完成'},{v:'滞后',t:'滞后'}]}];
    const draw=async()=>root.querySelector('#t').innerHTML=U.table({cols,rows:await DB.all('newlaunch'),
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    root.innerHTML=`${U.card('新品推广节奏','按准备期→爆发期→稳定期跟踪动作、目标与实际，及时发现滞后','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增节奏</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增推广节奏',body:U.formFields(fields),
      onOk:b=>{DB.put('newlaunch',U.formValues(b)).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('newlaunch',Number(dl));await draw()});
      if(ed){const r=await DB.get('newlaunch',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('newlaunch',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.appeal=async root=>{
    const cols=[{t:'类型',k:'type',f:v=>U.tag(v,'blue')},{t:'场景',k:'scene'},{t:'模板标题',k:'title'},
      {t:'模板内容',k:'body',raw:1,f:v=>'<span style="font-size:12px;color:var(--ink2)">'+U.esc(String(v||'').slice(0,60))+(String(v||'').length>60?'…':'')+'</span>'}];
    const fields=[{k:'type',t:'类型'},{k:'scene',t:'场景'},{k:'title',t:'模板标题'},{k:'body',t:'模板内容',type:'textarea'}];
    const draw=async()=>root.querySelector('#t').innerHTML=U.table({cols,rows:await DB.all('appeal'),
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    root.innerHTML=`${U.card('申诉模板','账户暂停 / ASIN 下架 / 绩效警告 / 侵权投诉等场景的申诉话术库','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增模板</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增申诉模板',body:U.formFields(fields),
      onOk:b=>{DB.put('appeal',U.formValues(b)).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('appeal',Number(dl));await draw()});
      if(ed){const r=await DB.get('appeal',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('appeal',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.reply=async root=>{
    const cols=[{t:'类型',k:'type',f:v=>U.tag(v,'blue')},{t:'场景',k:'scene'},
      {t:'话术',k:'body',raw:1,f:v=>'<span style="font-size:12px;color:var(--ink2)">'+U.esc(String(v||'').slice(0,60))+(String(v||'').length>60?'…':'')+'</span>'}];
    const fields=[{k:'type',t:'类型'},{k:'scene',t:'场景'},{k:'body',t:'话术内容',type:'textarea'}];
    const draw=async()=>root.querySelector('#t').innerHTML=U.table({cols,rows:await DB.all('reply'),
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    root.innerHTML=`${U.card('回复模板','差评 / 咨询 / 退货 / 物流 / 索评等站内信话术库','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增话术</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增回复模板',body:U.formFields(fields),
      onOk:b=>{DB.put('reply',U.formValues(b)).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('reply',Number(dl));await draw()});
      if(ed){const r=await DB.get('reply',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('reply',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  P.influencer=async root=>{
    const cols=[{t:'红人',k:'name'},{t:'平台',k:'platform'},{t:'粉丝',k:'fans',num:1,f:U.f0},
      {t:'领域',k:'niche'},{t:'报价$',k:'quote',num:1,f:U.money},
      {t:'状态',k:'status',f:v=>U.tag(v,v==='已合作'?'green':(v==='联系中'?'yellow':'gray'))},{t:'备注',k:'note'}];
    const fields=[{k:'name',t:'红人'},{k:'platform',t:'平台',type:'select',opts:[{v:'Instagram',t:'Instagram'},{v:'YouTube',t:'YouTube'},{v:'TikTok',t:'TikTok'}]},
      {k:'fans',t:'粉丝数',type:'number'},{k:'niche',t:'领域'},{k:'quote',t:'报价($)',type:'number',step:'1'},
      {k:'status',t:'状态',type:'select',opts:[{v:'联系中',t:'联系中'},{v:'已合作',t:'已合作'},{v:'已结束',t:'已结束'},{v:'待定',t:'待定'}]},{k:'note',t:'备注',type:'textarea'}];
    const draw=async()=>root.querySelector('#t').innerHTML=U.table({cols,rows:await DB.all('influencer'),
      actions:r=>`<button class="btn-ghost btn-sm" data-e="${r.id}">编辑</button><button class="btn-ghost btn-sm" data-d="${r.id}">删</button>`});
    root.innerHTML=`${U.card('站外红人','红人资源池：平台 / 粉丝 / 报价 / 合作状态','')}
      <div class="toolbar"><button class="btn" id="add">+ 新增红人</button></div><div id="t"></div>`;
    await draw();
    root.querySelector('#add').onclick=()=>U.modal({title:'新增红人',body:U.formFields(fields),
      onOk:b=>{DB.put('influencer',U.formValues(b)).then(draw).then(()=>U.toast('已添加'))}});
    root.querySelector('#t').onclick=async e=>{const ed=e.target.dataset.e,dl=e.target.dataset.d;
      if(dl)U.confirmBox('删除？',async()=>{await DB.del('influencer',Number(dl));await draw()});
      if(ed){const r=await DB.get('influencer',Number(ed));U.modal({title:'编辑',body:U.formFields(fields,r),
        onOk:b=>{Object.assign(r,U.formValues(b));DB.put('influencer',r).then(draw).then(()=>U.toast('已保存'))}})};
    };
  };

  window.Pages=Object.assign(window.Pages||{},P);
})();
