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

  /* ---------- 组件 ---------- */
  function card(title,body,sub){return `<div class="card"><h3>${esc(title)}</h3>${sub?`<div class="sub">${esc(sub)}</div>`:''}${body}</div>`}
  function kpi(list){
    return `<div class="grid g${list.length>4?4:list.length}" style="margin-bottom:14px">`+
      list.map(k=>`<div class="kpi ${k.level||''}"><div class="k-lab">${esc(k.label)}</div>
        <div class="k-val">${k.value}</div><div class="k-sub">${k.sub||''}</div></div>`).join('')+`</div>`;
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

  window.UI={$,esc,num,f0,f2,money,pct,today,dstr,addDays,diffDays,R,setRules,profit,marginColor,tag,dot,
    card,kpi,table,toast,modal,confirmBox,formFields,formValues,chart,clearCharts,
    toCSV,download,exportCSV,parseCSV};
})();
