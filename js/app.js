(function(){
  const U=window.UI, DB=window.DB;

  const MENU=[
    {g:'总览工具',items:[
      {k:'dashboard',t:'店铺总览'},
      {k:'risk',t:'风险清单'},
      {k:'diagnosis',t:'诊断中心'},
      {k:'tasks',t:'待办事项'},
      {k:'patrol',t:'每日巡店'},
      {k:'stores',t:'店铺与站点'},
      {k:'toolbox',t:'工具箱',star:1},
      {k:'data',t:'数据与备份'},
      {k:'settings',t:'设置与阈值'}
    ]},
    {g:'选品开发',items:[
      {k:'dev-selection',t:'选品立项&市场调研'},
      {k:'dev-competitor',t:'竞品深度分析'},
      {k:'dev-profit',t:'利润测算&产品开发',star:1}
    ]},
    {g:'推广运营',items:[
      {k:'keywords',t:'关键词词库'},
      {k:'listing',t:'Listing 优化'},
      {k:'ads',t:'广告管理'},
      {k:'newlaunch',t:'新品推广节奏',star:1},
      {k:'peak',t:'大促时间表'}
    ]},
    {g:'库存管理',items:[
      {k:'inventory',t:'库存补货'},
      {k:'purchase',t:'采购记录',star:1},
      {k:'logistics',t:'物流比价',star:1},
      {k:'qc',t:'质检',star:1}
    ]},
    {g:'售后合规',items:[
      {k:'returns',t:'退货与索赔'},
      {k:'appeal',t:'申诉模板',star:1},
      {k:'reply',t:'回复模板',star:1},
      {k:'compliance',t:'合规中心'}
    ]},
    {g:'财务绩效',items:[
      {k:'finance',t:'财务核算',star:1},
      {k:'kpi',t:'每日数据'},
      {k:'kpiscore',t:'KPI 绩效',star:1},
      {k:'team',t:'团队管理',star:1}
    ]}
  ];
  const TITLES={}; MENU.forEach(g=>g.items.forEach(i=>TITLES[i.k]=i.t));

  const App={
    state:{},
    filters:(()=>{const t=U.today(); return {from:U.addDays(t,-364),to:t,site:'ALL',storeIds:[]}})(),
    inScope(storeId){
      const f=App.filters;
      if(f.storeIds&&f.storeIds.length) return f.storeIds.indexOf(storeId)>=0;
      if(f.site&&f.site!=='ALL'){
        const s=App._stores&&App._stores[storeId];
        return !!s&&s.site===f.site;
      }
      return true;
    },
    go(k){ location.hash='#/'+k },
    async refresh(){ await App.render(location.hash.replace('#/','')||'dashboard') }
  };

  const navOpen=new Set();
  function renderNav(active){
    const nav=document.querySelector('#nav');
    const activeG=MENU.find(g=>g.items.some(i=>i.k===active));
    if(activeG) navOpen.add(activeG.g);
    nav.innerHTML=MENU.map(g=>{
      const open=navOpen.has(g.g)?'open':'';
      return `<div class="nav-sec ${open}" data-g="${g.g}">
        <div class="nav-group"><span class="ng-label">${g.g}</span><span class="caret">▸</span></div>
        <div class="nav-sub">`+
        g.items.map(i=>`<div class="nav-item ${i.k===active?'active':''}" data-k="${i.k}">
          <span>${i.t}</span>${i.star?'<span class="dot d-yellow" title="差异化模块"></span>':''}</div>`).join('')+
        `</div></div>`;
    }).join('');
    nav.querySelectorAll('.nav-group').forEach(el=>{
      el.onclick=()=>{
        const sec=el.closest('.nav-sec'); const key=sec.dataset.g;
        if(navOpen.has(key)) navOpen.delete(key); else navOpen.add(key);
        sec.classList.toggle('open');
      };
    });
    nav.querySelectorAll('[data-k]').forEach(el=>el.onclick=()=>{
      App.go(el.dataset.k);
      document.querySelector('#sidebar').classList.remove('open');
      document.querySelector('#sideOverlay').classList.remove('show');
    });
  }

  async function renderStorePicker(){
    const stores=await DB.all('stores');
    App._stores={}; stores.forEach(s=>App._stores[s.id]=s);
    const box=document.querySelector('#fStore');
    const sel=App.filters.storeIds;
    const label=sel.length?`已选 ${sel.length} 家`:'全部店铺';
    box.textContent=label;
    box.onclick=()=>{
      U.modal({title:'选择店铺（可多选）',
        body:`<div class="store-picker">`+stores.map(s=>
          `<label class="store-picker-item"><input type="checkbox" value="${s.id}" ${sel.indexOf(s.id)>=0?'checked':''}><span>${U.esc(s.name)}</span></label>`).join('')+
          `</div><div style="margin-top:10px;text-align:right"><button class="btn-ghost" id="selAll">全选/清空</button></div>`,
        okText:'应用',
        onOk:b=>{
          const ids=[]; b.querySelectorAll('input[type=checkbox]').forEach(c=>{if(c.checked)ids.push(Number(c.value))});
          App.filters.storeIds=ids; localStorage.setItem('cmdr_stores',JSON.stringify(ids));
          renderStorePicker(); App.refresh(); return true;
        }});
      const m=document.querySelector('#modalRoot');
      const all=m.querySelector('#selAll');
      if(all) all.onclick=()=>{m.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=!c.checked)};
    };
    document.querySelector('#storeStat').innerHTML=
      `共 ${stores.length} 家店铺<br>数据存于本机 IndexedDB`;
  }

  App.render=async function(key){
    if(!TITLES[key]) key='dashboard';
    U.clearCharts();
    renderNav(key);
    document.querySelector('#pageTitle').textContent=TITLES[key]||'';
    const root=document.querySelector('#content');
    root.innerHTML=`<div class="empty">加载中…</div>`;
    try{
      await window.Pages[key](root);
    }catch(e){
      root.innerHTML=`<div class="card"><h3>页面出错了</h3>
        <div style="font-size:13px;color:var(--red);line-height:1.8">${U.esc(e.message)}</div>
        <div style="font-size:12px;color:var(--ink2);margin-top:8px">${U.esc(String(e.stack||'').split('\n')[1]||'')}</div></div>`;
      console.error(e);
    }
    const f=App.filters;
    document.querySelector('#fFrom').value=f.from||'';
    document.querySelector('#fTo').value=f.to||'';
    document.querySelector('#fSite').value=f.site||'ALL';
  };

  async function init(){
    const saved=JSON.parse(localStorage.getItem('cmdr_stores')||'[]');
    App.filters.storeIds=saved;
    const rules=await DB.getSetting('rules',null);
    if(rules) U.setRules(rules);
    await renderStorePicker();
    document.querySelector('#content').innerHTML='<div class="empty">正在初始化演示数据，请稍候…</div>';
    const seeded=await window.DBSeed();
    if(seeded){
      const stores=await DB.all('stores');
      App._stores={}; stores.forEach(s=>App._stores[s.id]=s);
      U.toast('已写入演示数据，可在「数据与备份」一键清除');
    }
    document.querySelector('#fFrom').onchange=e=>{App.filters.from=e.target.value;App.refresh()};
    document.querySelector('#fTo').onchange=e=>{App.filters.to=e.target.value;App.refresh()};
    document.querySelector('#fSite').onchange=e=>{App.filters.site=e.target.value;App.refresh()};
    document.querySelector('#btnResetFilter').onclick=()=>{
      const t=U.today();
      App.filters={from:U.addDays(t,-364),to:t,site:'ALL',storeIds:[]};
      localStorage.setItem('cmdr_stores','[]');
      renderStorePicker(); App.refresh();
    };
    const sbEl=document.querySelector('#sidebar');
    const ovEl=document.querySelector('#sideOverlay');
    const openDrawer=()=>{sbEl.classList.add('open');ovEl.classList.add('show')};
    const closeDrawer=()=>{sbEl.classList.remove('open');ovEl.classList.remove('show')};
    document.querySelector('#btnToggle').onclick=()=>sbEl.classList.toggle('collapsed');
    document.querySelector('#btnMenu').onclick=openDrawer;
    ovEl.onclick=closeDrawer;
    window.addEventListener('hashchange',()=>App.refresh());
    await App.render(location.hash.replace('#/','')||'dashboard');
    window.addEventListener('resize',()=>{
      if(window.echarts) document.querySelectorAll('.chart').forEach(el=>{
        const c=echarts.getInstanceByDom(el); if(c) c.resize();
      });
    });
  }

  window.App=App;
  document.addEventListener('DOMContentLoaded',()=>{
    init().catch(e=>{
      document.querySelector('#content').innerHTML=
        `<div class="card"><h3>无法启动</h3>
        <div style="font-size:13px;line-height:1.9;color:var(--red)">${String(e&&e.message||e)}</div>
        <div style="font-size:12px;color:var(--ink2);margin-top:8px;line-height:1.8">
          常见原因：以 file:// 方式直接打开，浏览器禁用了 IndexedDB。<br>
          请用本地服务方式访问，例如在目录下执行：<br>
          <code>python -m http.server 8123</code> 然后打开 http://localhost:8123
        </div></div>`;
      console.error(e);
    });
  });
})();
