(function(){
  const P={};
  const U=window.UI, DB=window.DB;

  const STEPS=[
    {id:'account',t:'账户',items:['账户健康 ACH 分数','绩效通知/警告','商品停售或抑制','验证码/二审风险']},
    {id:'sales',t:'销售',items:['销售额与订单环比','转化率是否异常','客单价变化','是否断崖式下跌']},
    {id:'ads',t:'广告',items:['广告花费与预算','ACOS 是否超保本线','高花费零转化活动','排名/曝光异动']},
    {id:'inventory',t:'库存',items:['可售天数','断货风险','在途与接收差异','长期仓储费风险']},
    {id:'cvr',t:'转化',items:['主图与五点完整性','A+ 是否正常展示','新增差评','价格与 Buy Box']},
    {id:'after',t:'售后',items:['退货率','退款单','FBA 丢失损坏待索赔','客服未回复']},
    {id:'policy',t:'政策',items:['类目/合规要求变更','认证与税号有效期','平台政策通知','知识产权风险']}
  ];

  async function productMap(){
    const ps=await DB.all('products'); const m={}; ps.forEach(p=>m[p.id]=p); return m;
  }
  async function anomalies(){
    const out=[];
    const stores=await DB.all('stores'); const prods=await DB.all('products');
    const invs=await DB.all('inventory'); const ads=await DB.all('ads');
    const comps=await DB.all('compliance'); const nodes=await DB.all('nodes');
    let ahs=[]; try{ ahs=await DB.all('account_health'); }catch(e){ ahs=[]; }
    const pm={}; prods.forEach(p=>pm[p.id]=p);
    const sm={}; stores.forEach(s=>sm[s.id]=s);
    const r=U.R();
    const avg=await U.dailyAvgMap();
    invs.forEach(i=>{
      const p=pm[i.productId]; if(!p) return;
      const daily=avg[i.productId]!=null?avg[i.productId]:(Number(i.dailySalesAvg)||0);
      const cover=daily>0?(i.fbaQty+i.inboundQty-i.reserveQty)/daily:null;
      if(cover!=null&&cover<r.stockRed) out.push({level:'red',type:'库存',storeId:p.storeId,countdown:Math.floor(cover),
        text:`${p.sku} 可售仅 ${cover.toFixed(0)} 天（<${r.stockRed} 天），最晚补货日 ${U.addDays(U.today(),Math.max(0,Math.floor(cover)-i.leadDays))}`,link:'inventory',key:`库存|COVER|${p.id}`});
      else if(cover!=null&&cover<r.stockYellow) out.push({level:'yellow',type:'库存',storeId:p.storeId,countdown:Math.floor(cover),
        text:`${p.sku} 可售 ${cover.toFixed(0)} 天，需安排补货`,link:'inventory',key:`库存|COVER|${p.id}`});
      if(num180(i)>0) out.push({level:'red',type:'库存',storeId:p.storeId,
        text:`${p.sku} 库龄 >180 天 ${i.aging180} 件，长期仓储费风险`,link:'inventory',key:`库存|AGING|${p.id}`});
    });
    ads.forEach(a=>{
      const p=pm[a.productId]; if(!p) return;
      const pf=U.profit(p); const be=pf.breakEvenAcos; const acos=a.sales?a.spend/a.sales*100:null;
      if(acos!=null&&be!=null&&acos>be) out.push({level:'red',type:'广告',storeId:p.storeId,
        text:`${a.name} ACOS ${acos.toFixed(1)}% 超保本线 ${be.toFixed(1)}%`,link:'ads',key:`广告|ACOS|${a.productId}`});
      if(a.spend>0&&(!a.sales||a.sales===0)) out.push({level:'yellow',type:'广告',storeId:p.storeId,
        text:`${a.name} 有花费无产出`,link:'ads',key:`广告|NOSALE|${a.productId}`});
    });
    prods.forEach(p=>{
      const pf=U.profit(p);
      if(pf.margin!=null&&pf.margin<r.marginRed) out.push({level:'red',type:'利润',storeId:p.storeId,
        text:`${p.sku} 净利率 ${pf.margin.toFixed(1)}% 低于 ${r.marginRed}%`,link:'products',key:`利润|MARGIN|${p.id}`});
    });
    comps.forEach(c=>{
      const d=U.diffDays(c.expireDate,U.today());
      if(d<0) out.push({level:'red',type:'合规',storeId:c.storeId,expired:true,countdown:d,
        text:`${c.item} 已过期 ${-d} 天`,link:'compliance',key:`合规|EXP|${c.storeId}|${c.item}`});
      else if(d<=(c.reminderDays||30)) out.push({level: d<=r.nodeRedDays?'red':'yellow',type:'合规',storeId:c.storeId,countdown:d,
        text:`${c.item} 将在 ${d} 天后到期`,link:'compliance',key:`合规|EXP|${c.storeId}|${c.item}`});
    });
    ahs.forEach(a=>{
      const st=sm[a.storeId]; const sn=st?st.name:'店铺';
      if(a.ahr!=null&&a.ahr<200) out.push({level:'red',type:'账户',storeId:a.storeId,
        text:`${sn} 账户健康分 AHR ${a.ahr} 低于 200，存在停号风险`,link:'stores',key:`账户|AHR|${a.storeId}`});
      else if(a.ahr!=null&&a.ahr<300) out.push({level:'yellow',type:'账户',storeId:a.storeId,
        text:`${sn} 账户健康分 AHR ${a.ahr}，需关注`,link:'stores',key:`账户|AHR|${a.storeId}`});
      if(a.suppressed>0) out.push({level:'red',type:'账户',storeId:a.storeId,
        text:`${sn} 有 ${a.suppressed} 个 ASIN 被停售/抑制，需申诉恢复`,link:'stores',key:`账户|SUP|${a.storeId}`});
      if(a.policyWarnings>0) out.push({level:'yellow',type:'账户',storeId:a.storeId,
        text:`${sn} 有 ${a.policyWarnings} 条政策警告待处理`,link:'stores',key:`账户|POL|${a.storeId}`});
    });
    nodes.forEach(n=>{
      if(n.done) return;
      const d=U.diffDays(n.deadline,U.today());
      if(d<0){ if(d>=-30) out.push({level:'gray',type:'节点',storeId:null,expired:true,countdown:d,
        text:`${n.site} ${n.eventName} · ${n.type} 已逾期 ${(-d)} 天（截止 ${n.deadline}）`,link:'peak',key:`节点|EXP|${n.id}`}); return; }
      if(d<=r.nodeYellowDays) out.push({level:d<=r.nodeRedDays?'red':'yellow',type:'节点',storeId:null,countdown:d,
        text:`${n.site} ${n.eventName} · ${n.type} 截止 ${n.deadline}（剩 ${d} 天）`,link:'peak',key:`节点|DUE|${n.id}`});
    });
    const order={red:0,yellow:1,gray:2};
    const typeOrder={合规:0,账户:1,库存:2,利润:3,广告:4,节点:5};
    const to=t=>t!=null?typeOrder[t]:9;
    out.sort((a,b)=>(order[a.level]-order[b.level])||(to(a.type)-to(b.type))
      ||(a.countdown==null?1:(b.countdown==null?-1:a.countdown-b.countdown)));
    return out;
  }
  function num180(i){return Number(i.aging180)||0}

  /* ============ 1. 店铺总览 ============ */
  P.dashboard=async root=>{
    U.clearCharts();
    const kpi=await DB.all('kpi_daily');
    const f=App.filters;
    const inRange=r=>{
      const d=r.date;
      if(f.from&&d<f.from) return false;
      if(f.to&&d>f.to) return false;
      return App.inScope(r.storeId);
    };
    const cur=kpi.filter(inRange);
    const from=f.from||U.addDays(U.today(),-29), to=f.to||U.today();
    const len=Math.max(1,U.diffDays(to,from)+1);
    const prevFrom=U.addDays(from,-len), prevTo=U.addDays(from,-1);
    const prev=kpi.filter(r=>r.date>=prevFrom&&r.date<=prevTo&&App.inScope(r.storeId));
    const sum=(arr,k)=>arr.reduce((a,b)=>a+(Number(b[k])||0),0);
    const s1=sum(cur,'sales'), s0=sum(prev,'sales');
    const o1=sum(cur,'orders'), o0=sum(prev,'orders');
    const ad1=sum(cur,'adSpend'), ads1=sum(cur,'adSales');
    const se1=sum(cur,'sessions');
    const chg=(a,b)=>{ if(!b) return '—'; const v=(a-b)/b*100;
      const cls=v>=0?'t-green':'t-red'; return `<span class="tag ${cls}">${v>=0?'+':''}${v.toFixed(1)}%</span>`};
    const acos1=ads1?ad1/ads1*100:null;
    const cvr1=se1?o1/se1*100:null;
    const prods=await DB.all('products'); const pm={}; prods.forEach(p=>pm[p.id]=p);
    let estNet=0,estSales=0;
    cur.forEach(r=>{const p=pm[r.productId]; if(!p)return; const pf=U.profit(p);
      estSales+=Number(r.sales)||0; estNet+=(Number(r.sales)||0)*(pf.margin||0)/100;});
    const netPct=estSales?estNet/estSales*100:null;

    // 综合 ACOS 保本线（按销售额加权）
    let wBeNum=0,wBeDen=0;
    cur.forEach(r=>{const p=pm[r.productId]; if(!p)return; const pf=U.profit(p);
      if(pf.breakEvenAcos!=null&&r.sales){ wBeNum+=pf.breakEvenAcos*r.sales; wBeDen+=r.sales; }});
    const beW=wBeDen?wBeNum/wBeDen:null;
    let acosLevel='';
    if(acos1!=null){ if(beW!=null&&acos1>beW) acosLevel='alert'; else if(acos1>25) acosLevel='warn'; }
    const netLevel=netPct!=null?(netPct<U.R().marginRed?'alert':(netPct<U.R().marginYellow?'warn':'')):'';

    root.innerHTML=
      U.kpi([
        {label:'销售额',value:U.money(s1),sub:'环比 '+chg(s1,s0),level:''},
        {label:'订单数',value:U.f0(o1),sub:'环比 '+chg(o1,o0)},
        {label:'转化率',value:U.pct(cvr1),sub:'会话 '+U.f0(se1)},
        {label:'广告花费',value:U.money(ad1),sub:'占销售额 '+(s1?U.pct(ad1/s1*100):'—'),
          level:(s1&&ad1/s1*100>U.R().adShareRed)?'alert':((s1&&ad1/s1*100>U.R().adShareYellow)?'warn':'')},
        {label:'综合 ACOS',value:U.pct(acos1),sub:beW!=null?('保本线 '+U.pct(beW)):'广告销售 '+U.money(ads1),level:acosLevel},
        {label:'估算净利',value:U.money(estNet),sub:'净利率 '+U.pct(netPct),level:netLevel}
      ])+
      `<div class="grid g2">
        <div class="card"><h3>销售与广告趋势</h3><div id="cSales" class="chart"></div></div>
        <div class="card"><h3>今日异常提醒</h3><div class="sub">排序铁律：合规 > 账户 > 库存 > 利润 > 广告 > 节点</div>
          <div id="anomBox"><div class="empty">加载中</div></div></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>转化漏斗（会话 → 订单 → 退款）</h3><div id="cFunnel" class="chart"></div></div>
        <div class="card"><h3>店铺销售构成</h3><div id="cPie" class="chart"></div></div>
      </div>`;

    const byDate={};
    cur.forEach(r=>{byDate[r.date]=byDate[r.date]||{sales:0,ad:0};
      byDate[r.date].sales+=Number(r.sales)||0; byDate[r.date].ad+=Number(r.adSpend)||0});
    const dates=Object.keys(byDate).sort();
    const cSalesEl=document.getElementById('cSales');
    if(dates.length) U.chart(cSalesEl,{
      tooltip:{trigger:'axis'},
      legend:{data:['销售额','广告花费'],top:0},
      xAxis:{type:'category',data:dates},
      yAxis:[{type:'value',name:'销售额'},{type:'value',name:'广告'}],
      series:[{name:'销售额',type:'line',smooth:true,data:dates.map(d=>+(byDate[d].sales).toFixed(2)),
        itemStyle:{color:'#1E5FA8'},areaStyle:{color:'#CFE0F2'}},
        {name:'广告花费',type:'line',smooth:true,yAxisIndex:1,data:dates.map(d=>+(byDate[d].ad).toFixed(2)),
        itemStyle:{color:'#C0392B'}}]
    }); else cSalesEl.innerHTML=U.empty('本期暂无销售数据','调整筛选区间或店铺范围后重试');

    const rf=sum(cur,'refunds');
    const cFunnelEl=document.getElementById('cFunnel');
    if(se1>0) U.chart(cFunnelEl,{
      tooltip:{trigger:'item'},
      series:[{type:'funnel',left:'10%',width:'80%',
        data:[{name:'会话',value:se1},{name:'订单',value:o1},{name:'退款',value:rf},{name:'净订单',value:Math.max(0,o1-rf)}],
        color:['#1E5FA8','#D4A017','#C0392B','#27AE60']}]
    }); else cFunnelEl.innerHTML=U.empty('本期暂无流量数据');

    const stores=await DB.all('stores'); const sm={}; stores.forEach(s=>sm[s.id]=s);
    const pie={}; cur.forEach(r=>{const n=sm[r.storeId]?sm[r.storeId].name:'未分配';pie[n]=(pie[n]||0)+(Number(r.sales)||0)});
    const cPieEl=document.getElementById('cPie');
    if(Object.keys(pie).length) U.chart(cPieEl,{
      tooltip:{trigger:'item'},
      legend:{bottom:0},
      series:[{type:'pie',radius:['40%','65%'],data:Object.keys(pie).map(k=>({name:k,value:+pie[k].toFixed(2)})),
        color:['#1E5FA8','#D4A017','#27AE60','#7E8C99','#C0392B']}]
    }); else cPieEl.innerHTML=U.empty('本期暂无销售构成数据');

    // 异常提醒：顶部统计 + 列表（去重 + 转待办闭环）
    const list=await anomalies();
    const cnt={紧急:0,高:0,中:0}; list.forEach(a=>{cnt[U.severityOf(a)]++;});
    const tasksAll=await DB.all('tasks');
    const doneKeys=new Set(tasksAll.filter(t=>t.sourceKey).map(t=>t.sourceKey));
    const byKey={}; list.forEach(a=>byKey[a.key]=a.text);
    const box=document.getElementById('anomBox');
    box.innerHTML=list.length?U.statBar(cnt,list.length)+
      `<div style="max-height:300px;overflow:auto">`+list.map(a=>U.alertItem(a,doneKeys)).join('')+`</div>`
      :U.empty('当前范围内无异常','继续保持先风险后经营的巡检节奏');
    box.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>App.go(b.dataset.nav));
    box.querySelectorAll('[data-task]').forEach(b=>b.onclick=async()=>{
      const key=b.dataset.task, lv=b.dataset.lv;
      if(doneKeys.has(key)){ U.toast('该异常已转为待办'); App.go('tasks'); return; }
      await DB.put('tasks',{source:'巡检',title:byKey[key]||key,sourceKey:key,
        priority:lv==='red'?'红':'黄',dueDate:U.addDays(U.today(),7),relatedId:null,done:false});
      U.toast('已转为待办（默认 +7 天）'); App.refresh();
    });
  };

  /* ============ 2. 风险清单 ============ */
  P.risk=async root=>{
    const stores=(await DB.all('stores')).filter(s=>App.inScope(s.id));
    const list=await anomalies();
    const domains=['合规','账户','库存','广告','利润','节点'];
    const idx={};
    const rank={green:0,gray:1,yellow:2,red:3};
    list.forEach(a=>{
      const sid=a.storeId||'ALL'; idx[sid]=idx[sid]||{};
      const cur=idx[sid][a.type]||'green';
      if(rank[a.level]>rank[cur]) idx[sid][a.type]=a.level;
    });
    const cell=(sid,d)=>{
      const v=(idx[sid]&&idx[sid][d])||null;
      const nodeAll=(idx['ALL']&&idx['ALL'][d])||null;
      const show=v||(d==='节点'?nodeAll:null)||'green';
      return `<td class="heat">${U.dot(show)}</td>`;
    };
    root.innerHTML=
      U.kpi([
        {label:'红灯项',value:String(list.filter(a=>a.level==='red').length),level:'alert',sub:'需立即处理'},
        {label:'黄灯项',value:String(list.filter(a=>a.level==='yellow').length),level:'warn',sub:'需要关注'},
        {label:'受影响的店铺',value:String(new Set(list.map(a=>a.storeId)).size),sub:'共 '+stores.length+' 家在范围内'}
      ])+
      `<div class="card"><h3>店铺 × 风险域热力矩阵</h3>
        <div class="sub">单元格可点击下钻；系统只做汇总与提醒，是否处置由你判断</div>
        <table><thead><tr><th>店铺</th>${domains.map(d=>`<th style="text-align:center">${d}</th>`).join('')}</tr></thead>
        <tbody>${stores.map(s=>`<tr><td>${U.esc(s.name)} <span style="color:var(--ink2);font-size:11px">${s.site}</span></td>
          ${domains.map(d=>cell(s.id,d)).join('')}</tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><h3>异常明细</h3>`+
      (list.length?`        <table><thead><tr><th>级别</th><th>严重度</th><th>类型</th><th>店铺</th><th>说明</th></tr></thead><tbody>`+
        list.map(a=>{const st=stores.find(s=>s.id===a.storeId); const lvl=a.level==='gray'?'gray':a.level;
          return `<tr><td>${U.dot(lvl)}</td><td>${U.sevTag(U.severityOf(a))}</td><td>${U.esc(a.type)}</td>
          <td>${U.esc(st?st.name:'全局')}</td><td>${U.esc(a.text)}</td></tr>`}).join('')+`</tbody></table>`
        :`<div class="empty">无异常</div>`)+`</div>`;
    root.querySelectorAll('.heat').forEach(td=>{td.style.cursor='pointer'});
  };

  /* ============ 3. 每日巡店 SOP ============ */
  P.patrol=async root=>{
    const stores=await DB.all('stores');
    if(!stores.length){root.innerHTML=`<div class="empty">请先在「店铺与站点」添加店铺</div>`;return}
    const sidSel=App.state.patrolStore||stores[0].id;
    const date=U.today();
    const recs=(await DB.all('patrol')).filter(r=>r.storeId===sidSel&&r.date===date);
    const map={}; recs.forEach(r=>map[r.step]=r);
    const done=STEPS.filter(s=>map[s.id]).length;
    root.innerHTML=
      `<div class="card"><h3>今日巡店 SOP · ${U.esc(stores.find(s=>s.id===sidSel).name)}</h3>
        <div class="sub">固定顺序：账户 → 销售 → 广告 → 库存 → 转化 → 售后 → 政策。先风险，后经营；先异常，后优化。</div>
        <div class="toolbar">
          <select id="pStore" class="mini" style="max-width:220px">
            ${stores.map(s=>`<option value="${s.id}" ${s.id===sidSel?'selected':''}>${U.esc(s.name)}</option>`).join('')}
          </select>
          <span style="font-size:12px;color:var(--ink2)">进度 ${done}/7</span>
          <div class="bar" style="flex:1;min-width:120px"><i style="width:${done/7*100}%"></i></div>
          <button class="btn-ghost" id="pReport">生成日报</button>
        </div>
      </div>`+
      STEPS.map((s,i)=>{
        const r=map[s.id]||{};
        const st=r.status||'';
        return `<div class="sop-step ${st==='异常'?'bad':(st?'done':'')}">
          <div class="sop-head"><div class="sop-idx">${i+1}</div><b>${s.t}</b>
            ${st?U.tag(st,st==='异常'?'red':'green'):U.tag('未检查','gray')}
            <div style="margin-left:auto;display:flex;gap:6px">
              <button class="btn-ghost btn-sm" data-st="${s.id}" data-v="正常">正常</button>
              <button class="btn-danger btn-sm" data-st="${s.id}" data-v="异常">异常</button>
            </div>
          </div>
          <ul class="check">${s.items.map(it=>`<li>· ${U.esc(it)}</li>`).join('')}</ul>
          <input data-note="${s.id}" placeholder="异常备注（选填）" value="${U.esc(r.note||'')}" style="margin-top:8px">
        </div>`;
      }).join('');

    root.querySelector('#pStore').onchange=e=>{App.state.patrolStore=Number(e.target.value);App.refresh()};
    root.querySelectorAll('[data-st]').forEach(b=>b.onclick=async()=>{
      const step=b.dataset.st, v=b.dataset.v;
      const noteEl=root.querySelector(`[data-note="${step}"]`);
      const ex=recs.find(r=>r.step===step);
      await DB.put('patrol',{id:ex?ex.id:undefined,storeId:sidSel,date,step,status:v,note:noteEl?noteEl.value:''});
      if(v==='异常'){
        await DB.put('tasks',{source:'巡检',title:`${stores.find(s=>s.id===sidSel).name} · ${STEPS.find(s=>s.id===step).t}巡检异常`,
          priority:'红',dueDate:date,relatedId:null,done:false});
      }
      U.toast('已记录'); App.refresh();
    });
    root.querySelectorAll('[data-note]').forEach(el=>{
      el.onchange=async()=>{
        const step=el.dataset.note; const ex=recs.find(r=>r.step===step);
        if(ex){ex.note=el.value; await DB.put('patrol',ex); U.toast('备注已保存')}
      };
    });
    root.querySelector('#pReport').onclick=()=>{
      const txt=[`【巡店日报】${date} ${stores.find(s=>s.id===sidSel).name}`]
        .concat(STEPS.map((s,i)=>`${i+1}. ${s.t}：${(map[s.id]&&map[s.id].status)||'未检查'} ${(map[s.id]&&map[s.id].note)||''}`))
        .join('\n');
      U.modal({title:'巡店日报',body:`<textarea style="min-height:260px">${U.esc(txt)}</textarea>`,okText:'复制并关闭',
        onOk:b=>{const t=b.querySelector('textarea');t.select();try{document.execCommand('copy')}catch(e){} U.toast('已复制')}});
    };
  };

  /* ============ 4. 大促时间表 ============ */
  P.peak=async root=>{
    U.clearCharts();
    const all=await DB.all('nodes');
    const site=App.state.peakSite||'ALL';
    const year=App.state.peakYear||new Date().getFullYear();
    const nodes=all.filter(n=>(site==='ALL'||n.site===site)&&(!year||n.year===year));
    const st=n=>{
      if(n.done) return {c:'gray',t:'已完成',d:null};
      const d=U.diffDays(n.deadline,U.today());
      if(d<0) return {c:'gray',t:'已逾期',d};
      if(d<=U.R().nodeRedDays) return {c:'red',t:`剩 ${d} 天`,d};
      if(d<=U.R().nodeYellowDays) return {c:'yellow',t:`剩 ${d} 天`,d};
      return {c:'green',t:`剩 ${d} 天`,d};
    };
    nodes.sort((a,b)=>a.deadline<b.deadline?-1:1);
    root.innerHTML=
      `<div class="card"><h3>旺季节点倒计时</h3>
        <div class="sub">节点库按站点与年份生成，系统只记节点与倒推，提报与备货决策由你判断</div>
        <div class="toolbar">
          <select id="nSite" class="mini">${['ALL','US','EU','JP'].map(s=>`<option value="${s}" ${s===site?'selected':''}>${s==='ALL'?'全部站点':s}</option>`).join('')}</select>
          <select id="nYear" class="mini">${[year-1,year,year+1].map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select>
          <button class="btn-ghost" id="nGen">生成/补齐节点</button>
          <button class="btn-ghost" id="nAdd">新增自定义节点</button>
          <button class="btn-ghost" id="nCsv">导出 CSV</button>
        </div>
        <div class="grid g3">${nodes.map(n=>{
          const s=st(n);
          return `<div class="node ${s.c==='red'?'red':(s.c==='yellow'?'yellow':'')} ${s.t==='已逾期'||s.t==='已完成'?'over':''}">
            <div style="font-size:12px;color:var(--ink2)">${n.site} · ${n.year}</div>
            <div style="font-size:15px;font-weight:600;margin:4px 0">${U.esc(n.eventName)}</div>
            <div class="nd">${n.type}</div>
            <div style="font-size:12px;color:var(--ink2)">截止 ${n.deadline}</div>
            <div style="margin:6px 0">${U.tag(s.t,s.c)}</div>
            <div style="font-size:12px;color:var(--ink2);line-height:1.5">${U.esc(n.actionGuide||'')}</div>
            <div style="margin-top:8px;display:flex;gap:6px">
              <button class="btn-ghost btn-sm" data-done="${n.id}">${n.done?'标未完成':'标记完成'}</button>
              <button class="btn-ghost btn-sm" data-nav="${n.linkedModule||'stores'}">去对应模块</button>
              <button class="btn-ghost btn-sm" data-delnode="${n.id}">删除</button>
            </div>
          </div>`}).join('')||`<div class="empty">该站点/年份暂无节点，点击「生成/补齐节点」</div>`}</div>
      </div>
      <div class="card"><h3>旺季同期对比（销售额 vs 广告花费）</h3>
        <div class="sub">对比当前筛选区间与上一年同区间；历史不足时显示仅本期</div>
        <div id="cPeak" class="chart"></div></div>`;

    root.querySelector('#nSite').onchange=e=>{App.state.peakSite=e.target.value;App.refresh()};
    root.querySelector('#nYear').onchange=e=>{App.state.peakYear=Number(e.target.value);App.refresh()};
    root.querySelector('#nGen').onclick=async()=>{
      const sites=site==='ALL'?['US','EU','JP']:[site];
      let add=0;
      for(const s of sites){
        const have=all.filter(n=>n.site===s&&n.year===year);
        if(have.length) continue;
        await DB.bulk('nodes',window.DBNodes.genNodes(s,year)); add++;
      }
      U.toast(add?`已生成 ${add} 个站点节点`:'该站点本年节点已存在'); App.refresh();
    };
    root.querySelector('#nAdd').onclick=()=>{
      U.modal({title:'新增节点',body:U.formFields([
        {k:'site',t:'站点',type:'select',opts:[{v:'US',t:'US'},{v:'EU',t:'EU'},{v:'JP',t:'JP'}]},
        {k:'eventName',t:'活动名称',ph:'如 Prime Day'},
        {k:'type',t:'节点类型',type:'select',opts:['提报','早鸟','入仓','开卖'].map(v=>({v,t:v}))},
        {k:'deadline',t:'截止日期',type:'date',def:U.today()},
        {k:'year',t:'年份',type:'number',def:year},
        {k:'actionGuide',t:'该做什么',ph:'选填'}
      ]),onOk:async b=>{
        const v=U.formValues(b); v.year=Number(v.year)||year; v.done=false;
        await DB.put('nodes',v); U.toast('已新增');
      },after:()=>App.refresh()});
    };
    root.querySelector('#nCsv').onclick=()=>{
      U.exportCSV(`commander_nodes_${site}_${year}.csv`,
        nodes.map(n=>({站点:n.site,年份:n.year,活动:n.eventName,类型:n.type,截止:n.deadline,
          状态:st(n).t,指引:n.actionGuide||''})),['站点','年份','活动','类型','截止','状态','指引']);
    };
    root.querySelectorAll('[data-done]').forEach(b=>b.onclick=async()=>{
      const n=await DB.get('nodes',Number(b.dataset.done)); n.done=!n.done;
      await DB.put('nodes',n); App.refresh();
    });
    root.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>App.go(b.dataset.nav));
    root.querySelectorAll('[data-delnode]').forEach(b=>b.onclick=()=>{
      U.confirmBox('删除该节点？',async()=>{await DB.del('nodes',Number(b.dataset.delnode));App.refresh()});
    });

    const kpi=await DB.all('kpi_daily');
    const f=App.filters;
    const from=f.from||U.addDays(U.today(),-29),to=f.to||U.today();
    const cur=kpi.filter(r=>r.date>=from&&r.date<=to&&App.inScope(r.storeId));
    const py=year-1;
    const pf=from.replace(String(year),String(py)),pt=to.replace(String(year),String(py));
    const prev=kpi.filter(r=>r.date>=pf&&r.date<=pt&&App.inScope(r.storeId));
    const agg=(arr)=>{const m={};arr.forEach(r=>{m[r.date]=m[r.date]||{s:0,a:0};
      m[r.date].s+=Number(r.sales)||0;m[r.date].a+=Number(r.adSpend)||0});return m};
    const A=agg(cur),B=agg(prev);
    const dates=Object.keys(A).sort();
    U.chart(document.getElementById('cPeak'),{
      tooltip:{trigger:'axis'},legend:{data:['本期销售','本期广告','去年同期销售'],top:0},
      xAxis:{type:'category',data:dates},
      yAxis:{type:'value'},
      series:[
        {name:'本期销售',type:'bar',data:dates.map(d=>+A[d].s.toFixed(2)),itemStyle:{color:'#1E5FA8'}},
        {name:'本期广告',type:'bar',data:dates.map(d=>+A[d].a.toFixed(2)),itemStyle:{color:'#D4A017'}},
        {name:'去年同期销售',type:'line',smooth:true,data:dates.map(d=>{
          const k=d.replace(String(year),String(py));return B[k]?+B[k].s.toFixed(2):null}),itemStyle:{color:'#7E8C99'}}
      ]
    });
  };

  /* ============ 5. 待办事项 ============ */
  P.tasks=async root=>{
    const tasks=await DB.all('tasks');
    const f=App.state.taskFilter||'open';
    const list=tasks.filter(t=>f==='all'?true:(f==='done'?t.done:!t.done));
    const lv={红:'red',黄:'yellow',绿:'green'};
    root.innerHTML=
      `<div class="card"><h3>待办事项</h3>
        <div class="sub">诊断异常、巡检异常、节点提醒都可转为待办事项；完成后回写，形成处置闭环</div>
        <div class="toolbar">
          <select id="tFilter" class="mini">${[['open','未完成'],['done','已完成'],['all','全部']].map(([v,t])=>`<option value="${v}" ${v===f?'selected':''}>${t}</option>`).join('')}</select>
          <button class="btn" id="tAdd">新增待办</button>
        </div>`+
      U.table({cols:[
        {t:'级别',k:'priority',f:r=>U.dot(lv[r.priority]||'gray')+' '+U.esc(r.priority||'')},
        {t:'来源',k:'source'},
        {t:'事项',k:'title'},
        {t:'截止',k:'dueDate',f:r=>{
          const d=U.diffDays(r.dueDate,U.today());
          if(r.done) return U.esc(r.dueDate||'—');
          if(d<0) return U.esc(r.dueDate)+' '+U.tag('逾期','red');
          if(d<=3) return U.esc(r.dueDate)+' '+U.tag(`剩${d}天`,'yellow');
          return U.esc(r.dueDate||'—');
        }},
        {t:'状态',k:'done',f:r=>r.done?U.tag('已完成','green'):U.tag('待处理','gray')}
      ],rows:list,empty:'暂无待办',
      actions:r=>`<button class="btn-ghost btn-sm" data-tg="${r.id}">${r.done?'撤销':'完成'}</button>
        <button class="btn-ghost btn-sm" data-del="${r.id}">删除</button>`})+`</div>`;
    root.querySelector('#tFilter').onchange=e=>{App.state.taskFilter=e.target.value;App.refresh()};
    root.querySelector('#tAdd').onclick=()=>{
      U.modal({title:'新增待办',body:U.formFields([
        {k:'title',t:'事项'},{k:'source',t:'来源',type:'select',opts:['手动','诊断','巡检','节点'].map(v=>({v,t:v}))},
        {k:'priority',t:'优先级',type:'select',opts:['红','黄','绿'].map(v=>({v,t:v}))},
        {k:'dueDate',t:'截止日期',type:'date',def:U.today()}
      ]),onOk:async b=>{const v=U.formValues(b);v.done=false;await DB.put('tasks',v)},after:()=>App.refresh()});
    };
    root.querySelectorAll('[data-tg]').forEach(b=>b.onclick=async()=>{
      const t=await DB.get('tasks',Number(b.dataset.tg)); t.done=!t.done;
      t.doneDate=t.done?U.today():null; await DB.put('tasks',t); App.refresh();
    });
    root.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
      U.confirmBox('删除该待办？',async()=>{await DB.del('tasks',Number(b.dataset.del));App.refresh()});
    });
  };

  window.Pages=Object.assign(window.Pages||{},P);
  window.Anomalies=anomalies;
})();
