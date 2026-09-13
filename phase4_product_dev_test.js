/* Phase 4 自测 —— 选品开发模块（dev-selection / dev-competitor / dev-profit）
 * 环境：Node + 最小 DOM/window stub（无浏览器 / 无 IndexedDB / 无 jsdom）。
 * 加载真实 ui.js + mod-product-dev.js；通过内存注入 window.__exports 暴露模块内部
 * compute* 函数（不修改任何源码文件，仅测试 harness 内字符串变换）以进行真实逻辑调用。
 * 覆盖 6 项清单：注册/导出、利润compute接入、ABA接入、导出结构、异常边界、业务闭环。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = __dirname;
const uiSrc = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
let modSrc = fs.readFileSync(path.join(ROOT, 'js/mod-product-dev.js'), 'utf8');

// ---------- 最小 DOM mock ----------
class El {
  constructor(id){ this.id=id; this._html=''; this.style={}; this.dataset={};
    this.classList={add(){},remove(){},contains(){return false}}; }
  set innerHTML(v){ this._html=v; } get innerHTML(){ return this._html; }
  set onclick(v){} get onclick(){ return null; }
  set onchange(v){}
  querySelectorAll(){ return []; } querySelector(){ return null; }
  appendChild(){} remove(){} focus(){} click(){}
}
const els = {};
const documentMock = {
  getElementById(id){ return els[id] || (els[id]=new El(id)); },
  createElement(){ return new El('created'); },
  querySelector(sel){ return new El(sel); },   // 任何选择器都返回 El（toast 不会因 null 抛错）
  body: new El('body')
};

// mock XLSX（验证多 sheet 导出逻辑，不真实写文件）
const xlsxCalls = { book_new:0, append:0, names:[], writeFile:0 };
const XLSXMock = {
  utils: {
    book_new(){ xlsxCalls.book_new++; return { Sheets:{}, SheetNames:[] }; },
    aoa_to_sheet(aoa){ return { _aoa: aoa }; },
    book_append_sheet(wb, ws, name){ xlsxCalls.append++; xlsxCalls.names.push(name); wb.SheetNames.push(name); }
  },
  writeFile(){ xlsxCalls.writeFile++; }
};

// 稳定 DB 引用（本测试不调用渲染/DB，仅用于加载期 const DB=window.DB 不报错）
const dbMock = { all(){return Promise.resolve([]);}, get(){return Promise.resolve(null);},
  put(){return Promise.resolve();}, del(){return Promise.resolve();}, seed(){return Promise.resolve();} };

const sandbox = {
  window:{}, document: documentMock, console,
  setTimeout:()=>{}, Promise, Date, Math, Object, Array, String, Number, JSON,
  RegExp, isFinite, parseFloat, parseInt,
  Blob: function(){}, URL:{ createObjectURL(){return 'blob:x';}, revokeObjectURL(){} },
  XLSX: XLSXMock   // 浏览器中 SheetJS 以全局 XLSX 暴露；ui.js exportXLSX 用裸 XLSX，故同步为全局
};
sandbox.window = Object.assign(sandbox.window, { document: documentMock, DB: dbMock, XLSX: XLSXMock });
// 先不设 XLSX，验证「无 SheetJS → 降级 CSV + toast」分支；随后在导出用例中再启用 mock
vm.createContext(sandbox);
vm.runInContext(uiSrc, sandbox);                 // 定义 window.UI
sandbox.window.XLSX = XLSXMock;                 // 注入 mock XLSX（多 sheet 路径）
vm.runInContext(modSrc, sandbox);               // 定义 window.Pages（此时 __exports 尚未注入）

// ---------- 内存注入 __exports（不落盘，不改动源码） ----------
const marker = "window.Pages=Object.assign(window.Pages||{},P);";
const idx = modSrc.lastIndexOf(marker);
if (idx < 0) throw new Error('找不到注入锚点');
const injected = modSrc.slice(0, idx)
  + "window.__exports={computeSize,computeFeeCheck,computeProfitCheck,computeProfitMetrics,computeAbaRow,computeScore,computeBadRate,computeCompGross,computeResearchProfit,computeDevUsFba,computeDevGross};\n"
  + modSrc.slice(idx);
// 重新加载注入版（覆盖 window.Pages / window.__exports）
vm.runInContext(injected, sandbox);

const win = sandbox.window;
const U = win.UI;
const P = win.Pages;
const EX = win.__exports;

// ---------- 断言框架 ----------
let pass = 0, fail = 0, skip = 0, details = [];
function ok(name, cond, extra){ if(cond){pass++;details.push('  ✅ '+name);} else {fail++;details.push('  ❌ '+name+(extra?(' → '+extra):''));} }
function note(name, msg){ skip++; details.push('  ⚠️  '+name+' → '+msg); }
function finite(v){ return typeof v==='number' && isFinite(v); }

// ======================================================================
// 清单 1 · 导出与注册
// ======================================================================
console.log('\n【清单1】导出与注册');
ok('window.Pages 含 dev-selection', !!(P && P['dev-selection']));
ok('window.Pages 含 dev-competitor', !!(P && P['dev-competitor']));
ok('window.Pages 含 dev-profit', !!(P && P['dev-profit']));
['exportCSV','exportXLSX','tabs','subTabs','fbaFee','computeAba','RATES','FIRST_LEG_RATES']
  .forEach(k => ok('window.UI 含 '+k, typeof U[k]==='function' || (k==='RATES'||k==='FIRST_LEG_RATES' ? typeof U[k]==='object' : false),
    'typeof='+(typeof U[k])));

// ======================================================================
// 清单 2 · 利润类 compute 接入（真实数据跑真实 compute 函数）
// ======================================================================
console.log('\n【清单2】利润类 compute 接入');
// 2a. computeSize：32×22×12cm / 1.1lb（与主理人已验证的 test_fba 标杆一致）
const sizeRec = { pkgSizeCm:'32x22x12', pkgWeightLb:1.1 };
EX.computeSize(sizeRec);
ok('computeSize·fbaTier=大号标准尺寸', sizeRec.fbaTier==='大号标准尺寸', 'got='+sizeRec.fbaTier);
ok('computeSize·fbaChargeWtLb 有限值', finite(sizeRec.fbaChargeWtLb), 'got='+sizeRec.fbaChargeWtLb);
ok('computeSize·estFee=$7.55(标杆)', sizeRec.estFee===7.55, 'got='+sizeRec.estFee);
ok('computeSize·无 NaN/undefined', finite(sizeRec.fbaChargeWtLb) && finite(sizeRec.estFee) && sizeRec.fbaTier);

// 2b. computeSize 头程抛重 ÷6000 / ÷5000
const sizeRec2 = { pkgSizeCm:'30x20x10' };
EX.computeSize(sizeRec2);
ok('computeSize·volDiv6000=1.000', sizeRec2.volDiv6000===1.000, 'got='+sizeRec2.volDiv6000); // 30*20*10/6000=1
ok('computeSize·volDiv5000=1.200', sizeRec2.volDiv5000===1.200, 'got='+sizeRec2.volDiv5000); // /5000=1.2

// 2c. computeProfitCheck（母口径 B2 profitV2）— 注意：U.profitV2 内部存在回归 bug（见报告），此处捕获并标记
const pc = { purchase$:5, firstLeg$:2, fbaFee$:7.55, commission$:2.9985, refund$:0, ad$:3,
  storageOther$:0.3, promo$:0, price$:29.99, rate:6.71 };
let profitCheckErr = null;
try { EX.computeProfitCheck(pc); }
catch(e){ profitCheckErr = e; console.log('  [BUG] computeProfitCheck 抛出:', e.constructor.name+':', e.message); }
ok('computeProfitCheck·U.profitV2 调用不抛(profitV2 回归)', profitCheckErr===null,
  profitCheckErr ? (profitCheckErr.message + ' → 见 ui.js profitV2 return 引用未声明变量 cost$/profit$') : '');
ok('computeProfitCheck·cost$ 有限值', finite(pc.cost$), 'got='+pc.cost$);
ok('computeProfitCheck·profit$ 有限值', finite(pc.profit$), 'got='+pc.profit$);
ok('computeProfitCheck·netPct 有限值', finite(pc.netPct), 'got='+pc.netPct);
ok('computeProfitCheck·breakEvenAcos 有限值', finite(pc.breakEvenAcos), 'got='+pc.breakEvenAcos);
ok('computeProfitCheck·净利润为正(可正)', pc.profit$>0, 'profit$='+pc.profit$);
ok('computeProfitCheck·净利率在0-100%区间', pc.netPct>0 && pc.netPct<100, 'netPct='+pc.netPct);
ok('computeProfitCheck·profitRmb=profit$×rate', Math.abs(pc.profitRmb - pc.profit$*6.71) < 0.01, 'got='+pc.profitRmb);

// 2d. computeProfitMetrics（选品利润指标 L4，含汇率/头程估算）— 注意：该系列函数原地修改 record 并返回 undefined
const pm = { price:19.99, weightG:500, channel:'专线', costRmb:35, currency:'美元' /* rate 留空→取 USD */ };
EX.computeProfitMetrics(pm);
ok('computeProfitMetrics·rate 自动取 USD=6.71', pm.rate===6.71, 'got='+pm.rate);
ok('computeProfitMetrics·priceRmb=134.13', Math.abs(pm.priceRmb-134.13)<0.01, 'got='+pm.priceRmb);
ok('computeProfitMetrics·firstLegRmb 已估算(>0)', finite(pm.firstLegRmb) && pm.firstLegRmb>0, 'got='+pm.firstLegRmb);
ok('computeProfitMetrics·profitRmb 有限且为正', finite(pm.profitRmb) && pm.profitRmb>0, 'got='+pm.profitRmb);
ok('computeProfitMetrics·profitRatio 在0-100%', finite(pm.profitRatio) && pm.profitRatio>0 && pm.profitRatio<100, 'got='+pm.profitRatio);
ok('computeProfitMetrics·预扣=广告7%+退货5%(16.10)', Math.abs(pm.preDeduct-16.10)<0.01, 'got='+pm.preDeduct);
ok('computeProfitMetrics·汇损=1%(1.34)', Math.abs(pm.fxLoss-1.34)<0.01, 'got='+pm.fxLoss);

// 2e. computeFeeCheck（手填分段+重量 → U.fbaFee）
const fc = { fbaTier:'大号标准尺寸', fbaWeightLb:3.662 };
EX.computeFeeCheck(fc);
ok('computeFeeCheck·estFee=$7.55(大号标准3.662lb)', fc.estFee===7.55, 'got='+fc.estFee);

// 2f. PRODUCTS_CFG 使用的 U.profit（B2 旧视角）直接验证
const prof = U.profit({ price:29.99, cost:{ purchase:5, firstLeg:2, fbaFee:7.55, commission:0.15, storage:0.3, returnLoss:0.05, targetAcos:0.25 } });
ok('U.profit·net 有限值', finite(prof.net), 'got='+prof.net);
ok('U.profit·margin 有限值', finite(prof.margin), 'got='+prof.margin);
ok('U.profit·breakEvenAcos 有限值', finite(prof.breakEvenAcos), 'got='+prof.breakEvenAcos);

// 调用链确认（代码审查 + 静态断言）：compute 函数引用了 U.*
note('computeProfitCheck/computeProfitMetrics/computeSize/computeFeeCheck 调用链',
  '源码静态确认：computeProfitCheck→U.profitV2；computeProfitMetrics→U.volWeight/U.firstLegCost/U.RATES；computeSize→U.fbaEstimate；computeFeeCheck→U.fbaFee（见 mod-product-dev.js 29-156 行）');

// ======================================================================
// 清单 3 · ABA 接入（computeAbaRow 调用 U.computeAba）
// ======================================================================
console.log('\n【清单3】ABA 接入');
const abaNerf = { rankQ1:13, rankQ2:7, rankQ3:3, rankQ4:2 }; EX.computeAbaRow(abaNerf);
ok('ABA·nerf→增量产品', abaNerf.trend==='增量产品', 'got='+abaNerf.trend);
ok('ABA·nerf→容量大', abaNerf.capacity==='容量大', 'got='+abaNerf.capacity);
ok('ABA·nerf→推荐产品', abaNerf.recommend==='推荐产品', 'got='+abaNerf.recommend);

const abaLego = { rankQ1:5, rankQ2:3, rankQ3:1, rankQ4:1 }; EX.computeAbaRow(abaLego);
ok('ABA·lego→增量产品', abaLego.trend==='增量产品', 'got='+abaLego.trend);
ok('ABA·lego→容量大', abaLego.capacity==='容量大', 'got='+abaLego.capacity);
ok('ABA·lego→推荐产品', abaLego.recommend==='推荐产品', 'got='+abaLego.recommend);

const abaPopit = { rankQ1:10000, rankQ2:10000, rankQ3:2291, rankQ4:366 }; EX.computeAbaRow(abaPopit);
ok('ABA·popit→增量产品', abaPopit.trend==='增量产品', 'got='+abaPopit.trend);
ok('ABA·popit→容量大', abaPopit.capacity==='容量大', 'got='+abaPopit.capacity);
ok('ABA·popit→推荐产品', abaPopit.recommend==='推荐产品', 'got='+abaPopit.recommend);
ok('ABA·popit→无参数统计=2', abaPopit.noParamSum===2, 'got='+abaPopit.noParamSum);

// ======================================================================
// 清单 4 · 导出结构一致性
// ======================================================================
console.log('\n【清单4】导出结构一致性');
// 4a. toCSV 字段顺序与结构
const rows = [{ a:1, b:2, c:'x,y' }, { a:3, b:4, c:'z' }];
const headers = ['a','b','c'];
const csv = U.toCSV(rows, headers);
ok('toCSV·首行为表头顺序', csv.split('\n')[0]==='a,b,c', 'got='+csv.split('\n')[0]);
ok('toCSV·含逗号转义', csv.includes('"x,y"'), 'csv='+csv);
// 4b. exportCSV（走 Blob/URL stub，不应抛）
let threw=false; try { U.exportCSV('t.csv', rows, headers); } catch(e){ threw=true; console.log('  exportCSV error:', e.message); }
ok('exportCSV·不抛未捕获异常', !threw);
// 4c. exportXLSX 多 sheet（mock XLSX 验证多 sheet 构建）
xlsxCalls.book_new=0; xlsxCalls.append=0; xlsxCalls.names=[]; xlsxCalls.writeFile=0;
let threwX=false;
try {
  U.exportXLSX('profit.xlsx', [
    { name:'产品利润核对表', rows:[{a:1}], headers:[{key:'a',label:'A'}] },
    { name:'选品利润指标', rows:[{b:2}], headers:[{key:'b',label:'B'}] },
    { name:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789超长名截断', rows:[{c:3}], headers:[{key:'c',label:'C'}] }
  ]);
} catch(e){ threwX=true; console.log('  exportXLSX error:', e.message); }
ok('exportXLSX·不抛未捕获异常', !threwX);
ok('exportXLSX·构建多个 sheet', xlsxCalls.append===3, 'append='+xlsxCalls.append);
ok('exportXLSX·sheet 名截断≤31字符', xlsxCalls.names.every(n=>n.length<=31), JSON.stringify(xlsxCalls.names.map(n=>n.length)));

// 4d. 无 SheetJS → 降级分支（临时撤掉 XLSX，验证 toast 降级且不写文件）
sandbox.window.XLSX = undefined; sandbox.XLSX = undefined;
let degraded=false;
try { U.exportXLSX('fallback.xlsx', [{name:'S',rows:[],headers:[{key:'a',label:'A'}]}]); } catch(e){ degraded=true; console.log('  fallback error:', e.message); }
ok('exportXLSX·无SheetJS时不抛且降级', !degraded);
sandbox.window.XLSX = XLSXMock; sandbox.XLSX = XLSXMock; // 复原

// 4e. 字段顺序代码审查（关键 Tab 与 docs §三 对齐）
note('导出字段顺序与 docs/PHASE1-PRODUCT-DEV.md §三 对齐',
  '代码审查结论见报告正文（选品立项/利润核对表/ABA汇总/选品利润指标 字段顺序与 §三 一致；覆盖率≥80%）');

// ======================================================================
// 清单 5 · 异常 / 边界
// ======================================================================
console.log('\n【清单5】异常 / 边界');
let b1=true; try { EX.computeSize({}); } catch(e){ b1=false; console.log('  computeSize({}) error:', e.message); }
ok('边界·computeSize 空记录不抛', b1);
let b2=true; try { EX.computeProfitCheck({}); } catch(e){ b2=false; console.log('  computeProfitCheck({}) error:', e.message); }
ok('边界·computeProfitCheck 空记录不抛', b2);
let b3=true; try { EX.computeProfitMetrics({}); } catch(e){ b3=false; console.log('  computeProfitMetrics({}) error:', e.message); }
ok('边界·computeProfitMetrics 空记录不抛', b3);
let b4=true; try { EX.computeAbaRow({}); } catch(e){ b4=false; console.log('  computeAbaRow({}) error:', e.message); }
ok('边界·computeAbaRow 空记录不抛', b4);
// 负数 / 0 / 超大数值
let b5=true; try {
  EX.computeSize({ pkgSizeCm:'32x22x12', pkgWeightLb:-1 });
  EX.computeSize({ pkgSizeCm:'32x22x12', pkgWeightLb:0 });
  EX.computeSize({ pkgSizeCm:'32x22x12', pkgWeightLb:1e9 });   // 超大→oversize
  EX.computeProfitCheck({ purchase$:-5, firstLeg$:-2, fbaFee$:-7, commission$:-3, refund$:0, ad$:-1, storageOther$:-1, promo$:0, price$:0, rate:-1 });
  EX.computeProfitMetrics({ price:-19.99, weightG:-500, channel:'专线', costRmb:-35 });
  EX.computeAbaRow({ rankQ1:-100, rankQ2:-100, rankQ3:-100, rankQ4:-100 });
} catch(e){ b5=false; console.log('  boundary extreme error:', e.message); }
ok('边界·负数/0/超大数值不抛', b5);
// 缺必填 + 特殊字符字段
let b6=true; let specialOut = { name:'<script>alert(1)</script>', mktSize:'非数字', compete:'', priceBand:undefined, margin:null, compliance:'x', supply:8 };
try {
  EX.computeScore(specialOut);
} catch(e){ b6=false; console.log('  computeScore special error:', e.message); }
ok('边界·缺失/特殊字符字段不抛', b6);
ok('边界·特殊字符下 _score 为有限值', finite(specialOut._score), 'got='+specialOut._score);
// 公式字段 readOnly（代码审查）
note('公式字段 readOnly',
  '代码审查：mod-product-dev.js L15 R() 助手设 readonly:true；U.formFields 对 f.readonly 渲染 <input readonly class="formula-ro">（ui.js L147-149）。公式字段确认为只读。');

// ======================================================================
// 清单 6 · 业务用例复核（选品立项 → 利润测算 闭环）
// ======================================================================
console.log('\n【清单6】业务用例复核（闭环）');
// 选品立项：六维评分（原地修改 record）
const cand = { mktSize:8, compete:7, priceBand:8, margin:8, compliance:6, supply:8 }; EX.computeScore(cand);
ok('闭环·综合分=75.5(≥75→优先打爆)', cand._score===75.5 && cand._adv==='优先打爆', 'score='+cand._score+' adv='+cand._adv);
// 利润测算（采购价$5、售价$19.99、重量1.1lb、尺寸32×22×12cm、专线头程、USD）
const loopSize = { pkgSizeCm:'32x22x12', pkgWeightLb:1.1 }; EX.computeSize(loopSize);
const loopProfit = {
  purchase$:5, firstLeg$: U.firstLegCost(0.5,'seaExpress'), // 0.5kg 海派 ~6.5 RMB ≈ 不填，这里给$1
  fbaFee$: loopSize.estFee, commission$: +(19.99*0.15).toFixed(4), refund$:0.5,
  ad$:3, storageOther$:0.3, promo$:0, price$:19.99, rate:6.71
};
loopProfit.firstLeg$ = 1; // 头程运费预估$
try { EX.computeProfitCheck(loopProfit); } catch(e){ console.log('  [BUG] 闭环 computeProfitCheck 同样抛出 profitV2:', e.message); }
const loopMetrics = { price:19.99, weightG:500, channel:'专线', costRmb:35, currency:'美元' }; EX.computeProfitMetrics(loopMetrics);
console.log('   选品立项综合分 =', cand._score, '建议 =', cand._adv);
console.log('   尺寸录入 → FBA分段 =', loopSize.fbaTier, '| 计费重 =', loopSize.fbaChargeWtLb+'lb', '| 预估FBA费 = $'+loopSize.estFee);
console.log('   母口径利润 = $'+loopProfit.profit$+' | 净利率 = '+loopProfit.netPct+'% | 保本ACOS = '+loopProfit.breakEvenAcos+'%');
console.log('   选品利润指标 → 汇率 =', loopMetrics.rate, '| 兑换售价RMB =', loopMetrics.priceRmb, '| 利润RMB =', loopMetrics.profitRmb, '| 利润比 =', loopMetrics.profitRatio+'%');
ok('闭环·关键指标均可信(无 NaN/undefined)',
  finite(loopProfit.profit$) && finite(loopProfit.netPct) && finite(loopProfit.breakEvenAcos) &&
  finite(loopMetrics.profitRmb) && finite(loopMetrics.profitRatio));
ok('闭环·流程可跑通(立项→尺寸→利润→指标)',
  cand._adv==='优先打爆' && loopSize.estFee===7.55 && loopProfit.profit$!==undefined && loopMetrics.profitRmb>0);

// ======================================================================
// 汇总
// ======================================================================
console.log('\n================ Phase 4 选品开发 自测结果 ================');
console.log(details.join('\n'));
console.log('----------------------------------------------------------');
console.log(`通过 ${pass} / 失败 ${fail} / 受限(代码审查) ${skip}`);
if (fail === 0) console.log('PHASE4 PRODUCT-DEV OK ✅'); else console.log('PHASE4 PRODUCT-DEV HAS FAILURES ❌');
process.exit(fail === 0 ? 0 : 1);
