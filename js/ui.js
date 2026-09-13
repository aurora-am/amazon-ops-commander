(function(){
  const $=(s,r)=>(r||document).querySelector(s);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const num=(v,d)=>{const n=Number(v);return isFinite(n)?n:(d===undefined?null:d)};
  const dash=v=>{const n=Number(v);return isFinite(n)?null:null};
  function f2(v){const n=Number(v);return isFinite(n)?n.toFixed(2):'—'}
  function f0(v){const n=Number(v);return isFinite(n)?Math.round(n).toLocaleString('en-US'):'—'}
  function money(v,c){const n=Number(v);return isFinite(n)?(c||'$')+n.toFixed(2):'—'}
  function pct(v){const n=Number(v);return isFinite(n)?n.toFixed(1)+'%':'—'}
  function today(){return new Date().toISOString().slice(0,10)}
  function dstr(d){return d instanceof Date?d.toISOString().slice(0,10):String(d||'')}
  function addDays(dateStr,n){const d=new Date(dateStr);d.setDate(d.getDate()+n);return dstr(d)}
  function diffDays(a,b){const x=new Date(a),y=new Date(b);return Math.round((x-y)/86400000)}

  /* ---------- 阈值（可由设置页覆盖） ---------- */
  const DEFAULT_RULES={
    stockRed:14, stockYellow:30,
    marginRed:5, marginYellow:15,
    adShareYellow:30, adShareRed:40,
    returnRateYellow:5, returnRateRed:10,
    agingRed:180, agingYellow:90,
    nodeRedDays:7, nodeYellowDays:30
  };
  let _rules=Object.assign({},DEFAULT_RULES);
  function setRules(r){_rules=Object.assign({},DEFAULT_RULES,r||{})}
  const R=()=>_rules;

  /* ---------- 利润口径（全站唯一） ---------- */
  function profit(p){
    const c=p&&p.cost||{};
    const price=num(p.price,0), purchase=num(c.purchase,0), firstLeg=num(c.firstLeg,0),
      fba=num(c.fbaFee,0), comm=num(c.commission,.15), storage=num(c.storage,0),
      ret=num(c.returnLoss,.05), tAcos=num(c.targetAcos,.25);
    const commFee=price*comm;
    const adCost=price*tAcos;
    const retCost=(price+firstLeg+fba)*ret;
    const total=purchase+firstLeg+fba+commFee+storage+retCost+adCost;
    const net=price-total;
    const grossBeforeAd=price-(purchase+firstLeg+fba+commFee+storage+retCost);
    return {
      price,purchase,firstLeg,fba,commFee,storage,retCost,adCost,total,net,
      margin:price?net/price*100:null,
      grossMargin:price?grossBeforeAd/price*100:null,
      breakEvenAcos:price?grossBeforeAd/price*100:null,
      breakEvenRoi:grossBeforeAd?price/grossBeforeAd:null
    };
  }
  function marginColor(m){const r=R();if(m==null||!isFinite(m))return 'gray';
    if(m<r.marginRed)return 'red'; if(m<r.marginYellow)return 'yellow'; return 'green'}
  const colorTag={red:'t-red',yellow:'t-yellow',green:'t-green',gray:'t-gray'};
  const colorDot={red:'d-red',yellow:'d-yellow',green:'d-green',gray:'d-gray'};
  function tag(text,c){return `<span class="tag ${colorTag[c]||'t-gray'}">${esc(text)}</span>`}
  function dot(c){return `<span class="dot ${colorDot[c]||'d-gray'}"></span>`}

  /* ---------- 风险等级（紧急/高/中） ---------- */
  const SEV_CLASS={'紧急':'t-urgent','高':'t-high','中':'t-mid'};
  function sevTag(sev){return `<span class="tag ${SEV_CLASS[sev]||'t-mid'}">${esc(sev)}</span>`}
  function severityOf(a){
    if(a.level==='red') return ['合规','账户','库存'].includes(a.type)?'紧急':'高';
    return '中';
  }

  /* ---------- 组件 ---------- */
  function card(title,body,sub){return `<div class="card"><h3>${esc(title)}</h3>${sub?`<div class="sub">${esc(sub)}</div>`:''}${body}</div>`}
  function kpi(list){
    return `<div class="grid g${list.length>4?4:list.length}" style="margin-bottom:14px">`+
      list.map(k=>{const ek=(k.value==='—'||k.value==null)?' k-empty':'';
        return `<div class="kpi ${k.level||''}${ek}"><div class="k-lab">${esc(k.label)}</div>
        <div class="k-val">${k.value}</div><div class="k-sub">${k.sub||''}</div></div>`}).join('')+`</div>`;
  }
  function empty(text,sub){return `<div class="empty">${esc(text||'暂无数据')}${sub?`<div style="font-size:12px;margin-top:6px;color:var(--ink2)">${esc(sub)}</div>`:''}</div>`}
  function statBar(cnt,n){
    return `<div class="stat-bar">
      <span class="sb-item sb-urgent">紧急 ${cnt['紧急']||0}</span>
      <span class="sb-item sb-high">高 ${cnt['高']||0}</span>
      <span class="sb-item sb-mid">中 ${cnt['中']||0}</span>
      <span class="sb-item sb-total">合计 ${n}</span>
    </div>`;
  }
  function alertItem(a,doneKeys){
    const sev=severityOf(a); const lvl=a.level==='gray'?'gray':a.level;
    const isDone=doneKeys&&doneKeys.has&&doneKeys.has(a.key);
    const cls=['alert-item',a.expired?'expired':'',lvl==='red'?'lv-red':lvl==='yellow'?'lv-yellow':lvl==='gray'?'lv-gray':''].join(' ');
    return `<div class="${cls}">
      <div class="ai-main">${dot(lvl)}${sevTag(sev)}${tag(a.type,lvl)}
        <span class="ai-text">${esc(a.text)}</span></div>
      <div class="ai-foot">
        ${a.countdown!=null?`<span class="ai-count ${a.expired?'expired':(a.countdown<=R().nodeRedDays?'red':'gray')}">${a.expired?'⏱ 已过期 '+(-a.countdown)+' 天':'⏱ 剩 '+a.countdown+' 天'}</span>`:''}
        <span class="ai-actions">
          ${a.link?`<button class="btn-ghost btn-sm" data-nav="${a.link}">去处理</button>`:''}
          <button class="btn-ghost btn-sm" data-task="${esc(a.key||a.text)}" data-lv="${a.level}" ${isDone?'disabled':''}>${isDone?'已转待办':'转待办'}</button>
        </span>
      </div>
    </div>`;
  }
  function table(opts){
    const cols=opts.cols, rows=opts.rows||[];
    if(!rows.length) return `<div class="empty">${esc(opts.empty||'暂无数据')}</div>`;
    return `<div style="overflow:auto"><table><thead><tr>`+
      cols.map(c=>`<th class="${c.num?'num':''}">${esc(c.t)}</th>`).join('')+
      (opts.actions?`<th style="width:120px">操作</th>`:'')+`</tr></thead><tbody>`+
      rows.map(r=>`<tr>`+cols.map(c=>{
        const v=(c.f?c.f(r):r[c.k]);
        return `<td class="${c.num?'num':''}">${c.raw?String(v==null?'':v):esc(v==null?'—':v)}</td>`;
      }).join('')+(opts.actions?`<td>${opts.actions(r)}</td>`:'')+`</tr>`).join('')+
      `</tbody></table></div>`;
  }
  function toast(msg){
    const root=$('#toastRoot'); const el=document.createElement('div');
    el.className='toast'; el.textContent=msg; root.appendChild(el);
    setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300)},2200);
  }
  function modal(opts){
    const root=$('#modalRoot'); root.innerHTML='';
    const wrap=document.createElement('div'); wrap.className='mask';
    wrap.innerHTML=`<div class="modal"><h3>${esc(opts.title)}</h3><div class="m-body"></div>
      <div class="modal-foot">
        <button class="btn-ghost m-cancel">取消</button>
        <button class="btn m-ok">${esc(opts.okText||'保存')}</button>
      </div></div>`;
    const body=$('.m-body',wrap);
    if(typeof opts.body==='string') body.innerHTML=opts.body;
    else if(opts.body) body.appendChild(opts.body);
    const close=()=>{root.innerHTML=''};
    $('.m-cancel',wrap).onclick=close;
    wrap.onclick=e=>{if(e.target===wrap)close()};
    $('.m-ok',wrap).onclick=async()=>{
      if(opts.onOk){ const r=await opts.onOk(body); if(r===false) return; }
      close(); if(opts.after) opts.after();
    };
    root.appendChild(wrap);
    const first=body.querySelector('input,select,textarea'); if(first) first.focus();
    return body;
  }
  function confirmBox(msg,onYes){
    modal({title:'确认',body:`<div style="font-size:13px;line-height:1.7">${esc(msg)}</div>`,
      okText:'确定',onOk:async()=>{await onYes()}});
  }
  function formFields(fields,values){
    return `<div class="grid g2">`+fields.map(f=>{
      const v=(values&&values[f.k]!==undefined)?values[f.k]:(f.def!==undefined?f.def:'');
      const inp=f.type==='textarea'
        ? `<textarea name="${f.k}" placeholder="${esc(f.ph||'')}">${esc(v)}</textarea>`
        : f.type==='select'
        ? `<select name="${f.k}">${f.opts.map(o=>`<option value="${esc(o.v)}" ${String(o.v)===String(v)?'selected':''}>${esc(o.t)}</option>`).join('')}</select>`
        : f.readonly
        ? `<input readonly class="formula-ro" name="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph||'自动计算')}">`
        : `<input name="${f.k}" type="${f.type||'text'}" value="${esc(v)}" placeholder="${esc(f.ph||'')}" ${f.step?'step="'+f.step+'"':''}>`;
      return `<label class="f">${esc(f.t)}<div style="margin-top:4px">${inp}</div></label>`;
    }).join('')+`</div>`;
  }
  function formValues(body){
    const o={};
    body.querySelectorAll('[name]').forEach(el=>{
      const n=el.name;
      if(el.tagName==='SELECT'&&el.multiple){
        o[n]=Array.from(el.selectedOptions).map(x=>x.value);
      }else{
        let v=el.value;
        if(el.dataset.num==='1'||el.type==='number') v=(v===''?null:Number(v));
        o[n]=v;
      }
    });
    return o;
  }

  /* ---------- 图表 ---------- */
  const charts=[];
  function chart(el,option){
    if(!window.echarts) return;
    const c=echarts.init(el);
    c.setOption(Object.assign({
      grid:{left:40,right:20,top:30,bottom:30},
      textStyle:{fontFamily:'inherit'},
      tooltip:{trigger:'axis'}
    },option));
    charts.push(c);
    return c;
  }
  function clearCharts(){charts.forEach(c=>{try{c.dispose()}catch(e){}});charts.length=0}

  /* ---------- CSV ---------- */
  function toCSV(rows,headers){
    const esc=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
    return [headers.join(',')].concat(rows.map(r=>headers.map(h=>esc(r[h])).join(','))).join('\n');
  }
  function download(name,text,mime){
    const blob=new Blob(['\ufeff'+text],{type:mime||'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
  }
  function exportCSV(name,rows,headers){ download(name,toCSV(rows,headers)) }
  function parseCSV(text){
    const lines=text.replace(/^\ufeff/,'').split(/\r?\n/).filter(l=>l.trim());
    if(!lines.length) return [];
    const split=l=>{const out=[];let cur='',q=false;
      for(let i=0;i<l.length;i++){const ch=l[i];
        if(ch==='"'){ if(q&&l[i+1]==='"'){cur+='"';i++} else q=!q; }
        else if(ch===','&&!q){out.push(cur);cur=''} else cur+=ch;
      } out.push(cur); return out.map(s=>s.trim())};
    const head=split(lines[0]);
    return lines.slice(1).map(l=>{const v=split(l);const o={};head.forEach((h,i)=>o[h]=v[i]);return o});
  }

  /* ---------- 选品开发模块：Tab / 子标签 / 分区卡 / 图片 / 导出 / 公式（Phase 3） ---------- */
  function tabs(tabs){
    return `<div class="tabs">`+tabs.map((t,i)=>
      `<div class="tab ${i===0?'active':''}" data-k="${esc(t.key)}">${esc(t.label)}</div>`
    ).join('')+`</div>`;
  }
  function bindTabs(root,tabs,bodyEl,onSwitch){
    root.querySelectorAll('.tab').forEach(el=>{
      el.onclick=()=>{
        root.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        onSwitch(tabs, el.dataset.k, bodyEl);
      };
    });
  }
  function subTabs(sheets){
    return `<div class="sub-tabs">`+sheets.map((s,i)=>
      `<div class="sub-tab ${i===0?'active':''}" data-k="${esc(s.key)}">${esc(s.label)}</div>`
    ).join('')+`</div><div class="sub-body"></div>`;
  }
  function bindSubTabs(root,sheets,bodyEl,onSwitch){
    root.querySelectorAll('.sub-tab').forEach(el=>{
      el.onclick=()=>{
        root.querySelectorAll('.sub-tab').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        onSwitch(sheets, el.dataset.k, bodyEl);
      };
    });
  }
  function sectionCard(title,body){
    return `<div class="section-card"><h4>${esc(title)}</h4>${body}</div>`;
  }
  function imgField(url){
    const has=!!(url&&String(url).trim());
    return `<div class="img-field">`+
      `<img src="${has?esc(url):''}" alt="" ${has?'':'style="visibility:hidden"'}`+
      ` onerror="this.style.visibility='hidden'">`+
      `<span class="muted">${has?esc(url):'（无图，录入图片 URL）'}</span></div>`;
  }
  function exportXLSX(filename, sheets){
    if(!window.XLSX){ toast('SheetJS 未加载，仅可导出 CSV'); return; }
    const wb=XLSX.utils.book_new();
    (sheets||[]).forEach(s=>{
      const aoa=[s.headers.map(h=>h.label)];
      (s.rows||[]).forEach(r=>aoa.push(s.headers.map(h=>r[h.key])));
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, String(s.name||'Sheet').slice(0,31));
    });
    XLSX.writeFile(wb, filename.endsWith('.xlsx')?filename:(filename+'.xlsx'));
  }
  /* 母口径利润公式 2.0（B2）：显式金额字段 + 记录级汇率，与 U.profit 并存 */
  function profitV2(rec){
    const n=(v,d)=>{const x=Number(v);return isFinite(x)?x:(d===undefined?0:d);};
    const price=n(rec.price), purchase=n(rec.purchase), firstLeg=n(rec.firstLeg),
      fbaFee=n(rec.fbaFee), commission=n(rec.commission), refund=n(rec.refund),
      ad=n(rec.ad), storageOther=n(rec.storageOther), promo=n(rec.promo);
    const cost=purchase+firstLeg+fbaFee+commission+refund+ad+storageOther+promo;
    const profit=price-cost;
    const rate=n(rec.rate, 6.8);
    const netPct=price?profit/price*100:null;
    const profitRmb=profit*rate;
    const breakEvenAcos=price?
      (price-(purchase+firstLeg+fbaFee+commission+refund+storageOther+promo))/price*100:null;
    return {cost$,cost,profit$,profit,netPct,profitRmb,breakEvenAcos};
  }
  /* B3：用户可维护 FBA 费率表 —— 仅示例行，真实 202509 费率待用户替换 */
  const FBA_RATES = {
    // TODO: 待用户提供 202509 版 FBA 费率表后替换/补充（标准/大件/超大件 × 尺寸分段 × 配送费）。
    // 以下 example 行为占位，非真实费率，禁止当作默认值使用。
    '标准': { note:'示例，待替换', example_fee: null /* TODO: byWeight:[{maxLb,fee}] */ },
    '大件': { note:'示例，待替换', example_fee: null },
    '超大件': { note:'示例，待替换', example_fee: null }
  };
  function fbaFee(tier, weight){
    const t=FBA_RATES[tier];
    if(!t) return null;
    // TODO: 按真实 202509 费率分段查表；当前返回示例占位
    if(Array.isArray(t.byWeight)){
      for(const seg of t.byWeight){ if(Number(weight)<=seg.maxLb) return seg.fee; }
    }
    return (t.example_fee!=null)?t.example_fee:null;
  }
  /* B6：头程抛重（÷div 取大） */
  function volWeight(l,w,h,div){ div=div||6000; const x=Number(l)*Number(w)*Number(h)/Number(div); return isFinite(x)?x:0; }
  function chargeableWeight(real, vol){ return Math.max(Number(real)||0, Number(vol)||0); }

  window.UI={$,esc,num,f0,f2,money,pct,today,dstr,addDays,diffDays,R,setRules,profit,marginColor,tag,dot,
    sevTag,severityOf,card,kpi,table,empty,statBar,alertItem,toast,modal,confirmBox,formFields,formValues,chart,clearCharts,
    toCSV,download,exportCSV,parseCSV,
    tabs,bindTabs,subTabs,bindSubTabs,sectionCard,imgField,exportXLSX,profitV2,fbaFee,volWeight,chargeableWeight};
})();
