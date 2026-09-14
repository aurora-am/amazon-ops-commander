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
    if(!window.XLSX){
      toast('SheetJS 未加载，已自动降级导出 CSV');
      (sheets||[]).forEach(s=> exportCSV((filename||'export')+'-'+(s.name||'sheet')+'.csv', s.rows||[], s.headers||[]));
      return;
    }
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
    return {cost$:cost, profit$:profit, netPct, profitRmb, breakEvenAcos};
  }
  /* =====================================================================
   * B3：FBA 配送费费率表（美国站 2026-01-15 生效，非旺季/非服装/非危险品/$10-50 价格带口径）
   * 来源：Amazon Seller Central 官方帮助页 + 第三方整理（检索日 2026-09-12）。
   * ⚠️ 以下数字为「检索日的快照」，后台最新费率可能变动；所有外部费率必须可编辑 + 标注来源，
   *    切勿当作权威定死值。请在「设置-费率维护」中覆盖维护（此表供前端查表与演示）。
   * ===================================================================== */
  const FBA_RATES = {
    effDate: '2026-01-15',
    source: 'Amazon Seller Central 官方帮助页 + 第三方整理（检索日 2026-09-12）',
    note: '美国站 2026-01-15 生效；非旺季/非服装/非危险品/$10-50(mid) 价格带；后台最新费率为准，可编辑覆盖。',
    // 燃油物流附加费：自 2026-04-17 起对所有 FBA 配送费加收 3.5%
    surchargePct: 0.035,
    surchargeEffDate: '2026-04-17',
    // 旺季费率（2026-10-15~2027-01-14）另有价目表；本批次仅预留接口/注释 TODO，不填入具体旺季数字（避免臆造），默认按非旺季算
    peak: {
      enabled: false,                        // 默认非旺季
      range: ['2026-10-15', '2027-01-14'],
      note: 'TODO: 旺季费率表待用户提供真实价目表后补充（避免臆造）；enabled=false 时一律按非旺季计算'
    },
    tiers: {
      smallStandard: { // 小号标准尺寸
        label: '小号标准尺寸',
        note: '最长边≤15in、次长边≤12in、最短边≤0.75in、重量≤16oz(1lb)；计费重=实重',
        billingWeight: 'actual',             // 小号标准用实重
        byOz: [ // 重量断点(oz)，≤断点取对应费率（不含上限→下限）
          { maxOz: 2,  low: 2.43, mid: 3.32, high: 3.58 },
          { maxOz: 4,  low: 2.49, mid: 3.38, high: 3.64 },
          { maxOz: 6,  low: 2.56, mid: 3.45, high: 3.71 },
          { maxOz: 8,  low: 2.66, mid: 3.55, high: 3.81 },
          { maxOz: 10, low: 2.77, mid: 3.66, high: 3.92 },
          { maxOz: 12, low: 2.82, mid: 3.71, high: 3.97 },
          { maxOz: 14, low: 2.92, mid: 3.81, high: 4.07 },
          { maxOz: 16, low: 2.95, mid: 3.96, high: 4.22 }
        ]
      },
      largeStandard: { // 大号标准尺寸
        label: '大号标准尺寸',
        note: '最长边≤18in、次长边≤14in、最短边≤8in、重量≤20lb（且不满足小号标准）；计费重=实重与体积重(÷139)取大',
        billingWeight: 'max139',             // 大号标准：实重与体积重(÷139 inch)取大
        byOzOrLb: [ // ≤3lb 段，重量断点（lb，含小数；≤断点取对应费率）
          { maxLb: 0.25, low: 2.91, mid: 3.73, high: 3.99 }, // ≤4oz
          { maxLb: 0.5,  low: 3.13, mid: 3.95, high: 4.21 }, // 4-8oz
          { maxLb: 0.75, low: 3.38, mid: 4.20, high: 4.46 }, // 8-12oz
          { maxLb: 1.0,  low: 3.78, mid: 4.60, high: 4.86 }, // 12-16oz
          { maxLb: 1.25, low: 4.22, mid: 5.04, high: 5.30 },
          { maxLb: 1.5,  low: 4.60, mid: 5.42, high: 5.68 },
          { maxLb: 1.75, low: 4.75, mid: 5.57, high: 5.83 },
          { maxLb: 2.0,  low: 5.00, mid: 5.82, high: 6.08 },
          { maxLb: 2.25, low: 5.10, mid: 5.92, high: 6.18 },
          { maxLb: 2.5,  low: 5.28, mid: 6.10, high: 6.36 },
          { maxLb: 2.75, low: 5.44, mid: 6.26, high: 6.52 },
          { maxLb: 3.0,  low: 5.85, mid: 6.67, high: 6.93 }
        ],
        // 3-20lb 段：基础 + 续重
        base: { low: 6.15, mid: 6.97, high: 7.23 }, // mid 基础 6.97
        overBaseLb: 3,        // 超出 3lb 部分
        perHalfLb: 0.16       // $0.16/半磅（不足半磅按半磅）
      },
      smallBulky: { // 小号大件 Small Bulky
        label: '小号大件',
        note: '≤50lb、最长边≤37in、次长边≤28in、最短边≤20in、L+girth≤130in；计费重=实重与体积重(÷139)取大',
        billingWeight: 'max139',
        base: { low: 6.78, mid: 7.55, high: 7.55 },
        firstLb: 1,           // 首磅 1lb
        perLb: 0.38           // $0.38/lb（超出首磅部分，不足1lb按1lb）
      },
      largeBulky: { // 大号大件 Large Bulky
        label: '大号大件',
        note: '≤50lb、最长边≤59in、次长边≤33in、最短边≤33in、L+girth≤130in；计费重=实重与体积重(÷139)取大',
        billingWeight: 'max139',
        base: { low: 8.58, mid: 9.35, high: 9.35 },
        firstLb: 1,
        perLb: 0.38
      },
      oversize: { // 超大件，按重量分 0-50 / 50-70 / 70-150 / 150+
        label: '超大件',
        note: '最长边>59 或 次长边>33 或 最短边>33 或 L+girth>130 或 重量>50lb（任一成立即超大件）；再按重量分四档',
        bands: {
          '0-50':    { label: '超大件 0-50lb',   maxLb: 50,      base: { low: 25.56, mid: 26.33, high: 26.33 }, firstLb: 1,   perLb: 0.38, billingWeight: 'max139' },
          '50-70':   { label: '超大件 50-70lb',  maxLb: 70,      base: { low: 36.55, mid: 37.32, high: 37.32 }, firstLb: 51,  perLb: 0.75, billingWeight: 'max139' },
          '70-150':  { label: '超大件 70-150lb', maxLb: 150,     base: { low: 50.55, mid: 51.32, high: 51.32 }, firstLb: 71,  perLb: 0.75, billingWeight: 'max139' },
          '150plus': { label: '超大件 150lb+',   maxLb: Infinity, base: { low: 194.18, mid: 194.95, high: 194.95 }, firstLb: 151, perLb: 0.19, billingWeight: 'actual' } // 超大件>150lb 用实重
        }
      }
    }
  };

  /* FBA 体积重（lb）：长×宽×高(inch)/139（注意与头程体积重 ÷6000 cm 不同，勿混用） */
  function fbaVolWeightLb(dims){
    const l=Number(dims.l), w=Number(dims.w), h=Number(dims.h);
    const x=(l*w*h)/139;
    return isFinite(x)?x:0;
  }
  /* FBA 尺寸分段判定：dims={l,w,h(inch); weightLb} → 返回 tier key
   * key ∈ smallStandard | largeStandard | smallBulky | largeBulky
   *      | oversize-0-50 | oversize-50-70 | oversize-70-150 | oversize-150plus */
  function fbaTier(dims){
    const l=Number(dims.l), w=Number(dims.w), h=Number(dims.h), weightLb=Number(dims.weightLb);
    const edges=[l,w,h].map(x=>isFinite(x)?x:0).sort((a,b)=>b-a); // 降序：最长/次长/最短
    const longest=edges[0], second=edges[1], shortest=edges[2];
    const girth=2*(second+shortest);          // L+girth 中的 girth
    const lPlusGirth=longest+girth;
    // 小号标准
    if(longest<=15 && second<=12 && shortest<=0.75 && weightLb<=1) return 'smallStandard';
    // 大号标准（不满足小号标准，但满足大号标准）
    if(longest<=18 && second<=14 && shortest<=8 && weightLb<=20) return 'largeStandard';
    // 超大件判定（任一成立即超大件）
    const isOversize = longest>59 || second>33 || shortest>33 || lPlusGirth>130 || weightLb>50;
    if(isOversize){
      if(weightLb>150) return 'oversize-150plus';
      if(weightLb>70)  return 'oversize-70-150';
      if(weightLb>50)  return 'oversize-50-70';
      return 'oversize-0-50';
    }
    // 小号大件（≤50lb，尺寸在范围内，L+girth≤130）
    if(weightLb<=50 && longest<=37 && second<=28 && shortest<=20 && lPlusGirth<=130) return 'smallBulky';
    // 大号大件
    if(weightLb<=50 && longest<=59 && second<=33 && shortest<=33 && lPlusGirth<=130) return 'largeBulky';
    // 兜底（理论上不会到这）：归入大号标准
    return 'largeStandard';
  }
  /* FBA 计费重量（lb）：按分段规则取 实重 或 实重与体积重(÷139)取大 */
  function fbaChargeableWeight(tierKey, dims){
    const actual=Number(dims.weightLb)||0;
    const T=FBA_RATES.tiers;
    let t=T[tierKey];
    if(tierKey && tierKey.indexOf('oversize')===0) t=T.oversize.bands[tierKey.split('-').slice(1).join('-')];
    if(!t) return actual;
    if(t.billingWeight==='actual') return actual;
    return Math.max(actual, fbaVolWeightLb(dims));
  }
  /* FBA 配送费查表：tierKey + 计费重量(lb) → $（基础费 + 续重 + 燃油物流附加费）
   * opts.priceBand      : 'low' | 'mid' | 'high'（默认 'mid'，对应 $10-50 价格带）
   * opts.includeSurcharge: 是否计入 3.5% 燃油物流附加费（默认 true；false 仅基础费+续重） */
  function fbaFee(tierKey, weightLb, opts){
    opts=opts||{};
    const priceBand=opts.priceBand||'mid';
    const includeSurcharge = opts.includeSurcharge!==false; // 默认计入
    const T=FBA_RATES.tiers;
    // 超大件（复合 key：oversize-0-50 / 50-70 / 70-150 / 150plus）优先处理，避免被下方 T[tierKey] 空值守卫误拦截
    if(tierKey && tierKey.indexOf('oversize')===0){
      const bandKey=tierKey.split('-').slice(1).join('-'); // 0-50 / 50-70 / 70-150 / 150plus
      const band=T.oversize.bands[bandKey];
      if(!band) return null;
      const base=band.base[priceBand];
      const over=Number(weightLb)-band.firstLb;
      const extra=Math.max(0,Math.ceil(over))*band.perLb; // 超出首磅部分，不足1lb按1lb
      if(base==null) return null;
      let fee=base+extra;
      if(includeSurcharge) fee=fee*(1+FBA_RATES.surchargePct);
      return +fee.toFixed(2);
    }
    const t=T[tierKey];
    if(!t) return null;
    let base=null, extra=0;
    if(tierKey==='smallStandard'){
      const oz=Number(weightLb)*16;
      const seg=(t.byOz||[]).find(s=>oz<=s.maxOz);
      if(!seg) return null;
      base=seg[priceBand];
    } else if(tierKey==='largeStandard'){
      const lb=Number(weightLb);
      if(lb<=3){
        const seg=(t.byOzOrLb||[]).find(s=>lb<=s.maxLb);
        if(!seg) return null;
        base=seg[priceBand];
      } else {
        base=t.base[priceBand];
        const over=lb-t.overBaseLb;                  // 超出 3lb 部分
        const halfPounds=Math.ceil(over/0.5);         // 不足半磅按半磅
        extra=Math.max(0,halfPounds)*t.perHalfLb;
      }
    } else if(tierKey==='smallBulky'||tierKey==='largeBulky'){
      base=t.base[priceBand];
      const over=Number(weightLb)-t.firstLb;
      const lbs=Math.ceil(over);                       // 不足1lb按1lb
      extra=Math.max(0,lbs)*t.perLb;
    }
    if(base==null) return null;
    let fee=base+extra;
    if(includeSurcharge) fee=fee*(1+FBA_RATES.surchargePct);
    return +fee.toFixed(2);
  }
  /* 便捷：由尺寸直接估算 FBA 配送费（自动判定分段 + 计费重量） */
  function fbaEstimate(dims, opts){
    const tier=fbaTier(dims);
    const wt=fbaChargeableWeight(tier, dims);
    const fee=fbaFee(tier, wt, opts);
    return { tier, chargeableLb:+(+wt).toFixed(3), fee };
  }
  /* FBA 分段中文标签（tierKey → 中文；用于表格/表单展示） */
  function fbaTierLabel(key){
    if(key && key.indexOf('oversize')===0){
      const b=FBA_RATES.tiers.oversize.bands[key.split('-').slice(1).join('-')];
      return b?b.label:key;
    }
    const t=FBA_RATES.tiers[key];
    return t?t.label:key;
  }

  /* B5：汇率（CNY per 1 外币），2026-09-12 多家银行中间价（来源：主理人检索）
   * ⚠️ 参考值，实际以后台/银行实时为准；记录级可编辑，请勿当作权威定死值。
   * JPY 用 per 1 日元 = 0.0437（即 100 日元 = 4.3665）。其余站点币种留空待维护。 */
  const RATES = {
    USD: 6.71, EUR: 7.78, GBP: 9.07, JPY: 0.0437,
    CAD: null, AUD: null, SGD: null, CHF: null, MXN: null // 可按同来源补充或留空待维护
  };
  const DEFAULT_RATE = RATES.USD; // USD 默认别名（记录级 rate 字段初始值，不全局硬编码）

  /* C：头程费率（2026 行业参考，深圳起运，人民币/kg）
   * 实重与体积重取大；体积重=长×宽×高(cm)/6000；海运另 1CBM=167kg。
   * ⚠️ 参考值，需按货代实时报价维护（标注"参考值"），记录级可编辑。 */
  const FIRST_LEG_RATES = {
    express:    { rate: 70, range: [60, 90],  note: '快递直发(DHL/UPS/FedEx)，参考值' },
    air:        { rate: 45, range: [42, 50],  note: '空派，参考值' },
    seaExpress: { rate: 13, range: [11, 15],  note: '海派快船(美森/以星)，参考值' },
    seaTruck:   { rate: 8,  range: [6, 9],    note: '海卡普船，参考值' }
  };
  /* 头程成本：weightKg（计费重量 kg，实重与体积重取大由调用方算好）+ channel（express/air/seaExpress/seaTruck）→ 人民币 */
  function firstLegCost(weightKg, channel){
    const c=(channel && FIRST_LEG_RATES[channel]) || FIRST_LEG_RATES.seaExpress;
    const w=Number(weightKg)||0;
    return +(w*c.rate).toFixed(2);
  }

  /* B6：头程抛重（÷div 取大，默认 ÷6000 cm） */
  function volWeight(l,w,h,div){ div=div||6000; const x=Number(l)*Number(w)*Number(h)/Number(div); return isFinite(x)?x:0; }
  function chargeableWeight(real, vol){ return Math.max(Number(real)||0, Number(vol)||0); }

  /* D：ABA 推荐/趋势判定（B7，来源：模板「使用说明」sheet）
   * 输入 rec: {rankQ1,rankQ2,rankQ3,rankQ4}（季度搜索词排名；rank=10000 代表"无参数/无排名"）
   * 返回 {trend, capacity, recommend}：命中填 '增量产品'/'容量大'/'推荐产品'，否则空串。
   * opts.capacityThreshold 默认 3000（可配置，见 ABA_CAPACITY_THRESHOLD）。 */
  const ABA_CAPACITY_THRESHOLD = 3000;
  function computeAba(rec, opts){
    opts=opts||{};
    const threshold = (opts.capacityThreshold!=null) ? opts.capacityThreshold : ABA_CAPACITY_THRESHOLD;
    const ranks=[rec.rankQ1, rec.rankQ2, rec.rankQ3, rec.rankQ4].map(x=>{
      const n=Number(x); return isFinite(n)?n:null;
    });
    const valid=ranks.filter(r=>r!=null && r!==10000); // 排除无参数(=10000)
    // 增量产品：排除无参数后，剩余有效季度排名严格单调递减（q1>q2>q3>q4，数值下降=热度上升）
    let trend='';
    if(valid.length>=2){
      let mono=true;
      for(let i=1;i<valid.length;i++){ if(valid[i]>valid[i-1]){ mono=false; break; } }
      if(mono) trend='增量产品';
    }
    // 容量大：存在有效季度排名 ≤ 阈值
    let capacity='';
    if(valid.some(r=>r<=threshold)) capacity='容量大';
    // 推荐产品：增量产品 && 容量大
    const recommend = (trend && capacity) ? '推荐产品' : '';
    return { trend, capacity, recommend };
  }

  /* 近 30 天日均销量（代理口径：kpi_daily 日均订单数），用于库存可售天数动态计算。
   * kpi_daily 无独立「销量件数」字段，以每日 orders 作销量代理；近 30 天(含今天)按 productId 求均值。
   * 返回 {productId: 日均}，无销售数据的品不出现在 map 中（调用方回退到录入兜底值）。 */
  async function dailyAvgMap(){
    const DBg=window.DB; // db.js 的 DB 仅挂到 window.DB，跨 IIFE 须显式取
    if(!DBg||!DBg.all) return {};
    let kpi=[];
    try{ kpi=await DBg.all('kpi_daily'); }catch(e){ kpi=[]; }
    const from=addDays(today(),-29);
    const to=today();
    const sum={},cnt={};
    kpi.forEach(k=>{ if(k.date>=from&&k.date<=to){
      const p=k.productId; sum[p]=(sum[p]||0)+(Number(k.orders)||0); cnt[p]=(cnt[p]||0)+1; } });
    const m={}; Object.keys(sum).forEach(p=>{ if(cnt[p]) m[p]=+(sum[p]/cnt[p]).toFixed(1); });
    return m;
  }

  window.UI={$,esc,num,f0,f2,money,pct,today,dstr,addDays,diffDays,R,setRules,profit,marginColor,tag,dot,
    sevTag,severityOf,card,kpi,table,empty,statBar,alertItem,toast,modal,confirmBox,formFields,formValues,chart,clearCharts,
    toCSV,download,exportCSV,parseCSV,
    tabs,bindTabs,subTabs,bindSubTabs,sectionCard,imgField,exportXLSX,profitV2,
    FBA_RATES,fbaTier,fbaVolWeightLb,fbaChargeableWeight,fbaEstimate,fbaTierLabel,fbaFee,
    RATES,DEFAULT_RATE,FIRST_LEG_RATES,firstLegCost,
    volWeight,chargeableWeight,computeAba,ABA_CAPACITY_THRESHOLD,dailyAvgMap};
})();
