# Phase 2 · 选品开发模块重构 — 改造方案设计（架构 / 设计规划，不实现）

> **模块**：亚马逊跨境卖家工作台 Commander · 选品开发
> **阶段**：Phase 2（输出改造方案文档，不做代码、不写实现）
> **输入**：`docs/PHASE1-PRODUCT-DEV.md`（3 路由页 / 11 Tab / 字段清单 / L1-L14 / §七 已确认 B1-B11）
> **参考源码**：`js/app.js`、`js/mod-assets.js`、`js/db.js`、`js/ui.js`、`css/style.css`、`index.html`
> **约束**：纯前端 SPA（HTML+CSS+原生 JS+IndexedDB，不上云、无后端、不调 API）；离线优先（含 `vendor/echarts.min.js` 离线可用）；本方案**仅描述架构与设计，不改动任何源码**。
> **UI 风格**：沿用 Commander 科技蓝 `#1E5FA8`（见 `css/style.css:2`），复用 `.card / .toolbar / .nav-*` 与现有 `U.*` 组件。

---

## 〇、改造范围与总体思路

把现有「选品开发」分组下 3 个扁平路由页 `selection / competitors / profit`（`js/app.js:16-20`）重构为 3 个**独立路由 + 内部 Tab 容器**页 `dev-selection / dev-competitor / dev-profit`，合并为 11 个 Tab（4+3+4）。核心改造点：

1. **导航**：仅改 `MENU` 的 3 个 `k/t`，路由机制完全复用 `App.render` + `window.Pages`（参见 §一）。
2. **页面容器**：每个路由函数是一个「Tab 条 + 内容区」骨架，新增 `U.tabs()` 与子表切换 `U.subTabs()`（B9，参见 §二）。
3. **数据层**：新增 11 张 IndexedDB 表（`db.js` 的 `TABLES` 追加），旧表 `candidates/competitors/products` **并行保留不迁移**（B10，参见 §六）。
4. **利润口径**：统一以 **L3 利润预估表2.0 为母口径（B2）**，现有 `U.profit`（ui.js:30-48）降级为「快速估算视角」，新母口径 `U.profitV2()` 用显式金额字段 + 记录级汇率（B5）。
5. **导出**：在 `U.exportCSV` 基础上引入 SheetJS 实现 `.xlsx` 多 sheet 导出（B11），CSV 保留（B11 双格式）。
6. **合规**：`competitor_plan` 等表**不含任何刷单字段**（B4）。

> 下文中「PHASE1 §X」指 `docs/PHASE1-PRODUCT-DEV.md` 对应章节；行号指源码实际位置。

---

## 一、导航改造方案

### 1.1 改造后的 `MENU` 片段（`js/app.js:16-20`）

仅替换「选品开发」分组的三项 `k/t`，分组结构、手风琴、其余菜单项不变：

```js
{g:'选品开发',items:[
  {k:'dev-selection',t:'选品立项&市场调研'},
  {k:'dev-competitor',t:'竞品深度分析'},
  {k:'dev-profit',t:'利润测算&产品开发',star:1}
]},
```

变更点：
- `selection` → `dev-selection`，标题 `选品立项` → `选品立项&市场调研`（对应 PHASE1 §一 路由表）。
- `competitors` → `dev-competitor`，标题 `竞品调研` → `竞品深度分析`。
- `profit` → `dev-profit`，**保留 `star:1`**（PHASE1 §五「`profit` 保留 `star:1`」），标题 `利润测算` → `利润测算&产品开发`。
- `TITLES`（`js/app.js:47`）由 `MENU` 自动生成，无需额外改动；`#pageTitle` 显示值随之更新。

### 1.2 `renderNav` 是否需要适配

**无需适配。** 现有 `renderNav(active)`（`js/app.js:66-91`）逻辑为：遍历 `MENU` 渲染手风琴分组（`nav-group` + 折叠 `nav-sub`），并把当前 `active` 项所在分组自动展开（`js/app.js:68-69` 的 `navOpen.add`）。3 个新 key 仍挂在「选品开发」分组下，只是该分组下多了/改名了 3 个 `nav-item`，渲染逻辑完全兼容。点击 `nav-item`（`js/app.js:86-90`）通过 `App.go(k)` → `location.hash` → `hashchange` → `App.render` 触发，机制不变。

唯一可选项（非必须）：若希望默认进入某页时该分组高亮，现有逻辑已满足（active 自动展开）。**结论：renderNav 0 改动。**

### 1.3 路由复用

`App.render(key)`（`js/app.js:119-138`）流程：
1. `TITLES[key]` 校验（未知 key 回退 `dashboard`，`js/app.js:120`）——新 key 已在 `MENU` 注册，OK。
2. `U.clearCharts()` 清图表（兼容 echarts 复用）。
3. `renderNav(key)` + 设置 `#pageTitle`。
4. `#content` 置「加载中」后调用 `await window.Pages[key](root)`（`js/app.js:127`）。

因此 3 个新页面只需在 `js/mod-assets.js`（或新文件 `js/mod-product-dev.js`）中新增 `P['dev-selection'] / P['dev-competitor'] / P['dev-profit']`，并在文件末尾 `window.Pages=Object.assign(window.Pages||{},P)`（`js/mod-assets.js:477`）注册即可。**建议**：Phase 3 将选品开发相关 3 个函数与母口径计算抽到独立文件 `js/mod-product-dev.js`，并在 `index.html:71` 前（app.js 之前）引入，避免 `mod-assets.js` 过度膨胀；本方案不强制文件拆分，仅明确注册方式不变。

---

## 二、页面与 Tab 容器架构

### 2.1 三个路由渲染函数骨架（伪代码）

以 `dev-selection` 为例，其余两个同构（仅 tabs 配置不同）：

```js
// js/mod-product-dev.js（建议新增文件；或并入 mod-assets.js）
const P = {};
const U = window.UI, DB = window.DB;

P['dev-selection'] = async (root) => {
  U.clearCharts();
  const TABS = [
    { key:'tab1', label:'选品立项',         render: renderSelProject },   // §2.3 工具栏
    { key:'tab2', label:'多维度市场分析',   render: renderMarket },
    { key:'tab3', label:'ABA 关键词调研',   render: renderAba },
    { key:'tab4', label:'选品调研表',       render: renderResearch },
  ];
  root.innerHTML = `
    <div class="card"><h3>选品立项 & 市场调研</h3>
      <div class="sub">六维评分 + 市场/关键词/调研一体化工作台（纯本地录入，不抓取）</div>
      ${U.tabs(TABS)}               <!-- 顶部 Tab 条 -->
      <div id="tabBody"></div>      <!-- 内容区 -->
    </div>`;
  // 默认渲染第一个 Tab，后续点击切换
  await switchTab(TABS, 'tab1', root.querySelector('#tabBody'));
};

async function switchTab(tabs, key, bodyEl){
  bodyEl.innerHTML = `<div class="empty">加载中…</div>`;
  const t = tabs.find(x=>x.key===key);
  await t.render(bodyEl);          // 每个 render 自行构建 toolbar+table+事件
}
```

`dev-competitor` / `dev-profit` 同理，tabs 分别为 PHASE1 §二 的 3 个 / 4 个 Tab。

### 2.2 新增 `U.tabs()` 的 API 设计（`js/ui.js` 当前无该组件，见 `js/ui.js` 全文）

**设计原则**：沿用现有 `U.*` 返回 HTML 字符串 + 手动事件绑定的风格（参考 `U.table` / `U.formFields`），不引入框架。Active 态用科技蓝下划线，复用 `.nav-*` 视觉变量（`--blue:#1E5FA8`，`css/style.css:2`）。

```js
// 入参：tabs = [{key, label}]  ；返回 Tab 条 HTML 字符串
// 调用方负责在点击时调用 switch 逻辑（见 §2.1 switchTab）
U.tabs = function(tabs){
  return `<div class="tabs">` + tabs.map((t,i)=>
    `<div class="tab ${i===0?'active':''}" data-k="${t.key}">${U.esc(t.label)}</div>`
  ).join('') + `</div>`;
};

// 事件绑定辅助（在页面 render 后调用一次）
U.bindTabs = function(root, tabs, bodyEl, onSwitch){
  root.querySelectorAll('.tab').forEach(el=>{
    el.onclick = () => {
      root.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      el.classList.add('active');
      onSwitch(tabs, el.dataset.k, bodyEl);
    };
  });
};
```

**DOM 结构衔接**：
- Tab 条渲染在 `#content` 内的 `.card` 中（或 `#content` 直接子级），内容区为 `#tabBody`。
- `#pageTitle` 已由 `App.render` 设为页面级标题（如「选品立项&市场调研」），Tab 条作为页面内二级导航，二者不冲突。
- 与 `#nav` 的 `.nav-item.active`（蓝底白字，`css/style.css:34`）区分：Tab 条用 **下划线 Active**（`css/style.css` 新增 `.tab.active{border-bottom:2px solid var(--blue);color:var(--blue)}`），保持视觉层级。

### 2.3 二级「子表切换标签」组件设计（B9 决策）

PHASE1 §七 **B9 已拍板：子表切换标签**（每个 sheet 一个二级子标签切换，导出保持多 sheet）。当一个 Tab 对应多 sheet 时（如市场分析 12 个 sheet、ABA 4 个季度等），在 Tab 内容区内再嵌一层子标签。

```js
// sheets = [{key, label, render:(bodyEl)=>...}]
U.subTabs = function(sheets){
  return `<div class="sub-tabs">` + sheets.map((s,i)=>
    `<div class="sub-tab ${i===0?'active':''}" data-k="${s.key}">${U.esc(s.label)}</div>`
  ).join('') + `</div><div class="sub-body"></div>`;
};
// 绑定同 bindTabs，只是作用域在 Tab 内部
```

**B9 关键约束**：
- 切换子标签 = 切换展示的数据区，**不丢失**其他子标签已录入数据（数据存 IndexedDB，按 sheet 区分或单表多列，见 §三/§六）。
- 导出时把每个子标签对应记录输出为 Workbook 的 **多个 sheet**（B9 + B11），顺序与子标签一致。
- 子标签样式 `css/style.css` 新增：`.sub-tabs`（较 Tab 条小一号、浅蓝底）、`.sub-tab.active`（蓝色文字 + 底部细线），与 `.tabs/.tab` 形成两级层级。

### 2.4 每个 Tab 的「新增/编辑/删除/导出」工具栏布局

统一在 Tab 内容顶部放一个 `.toolbar`（`css/style.css:105` 已有），布局约定：

```
[+ 新增]   [导出 Excel]   [导出 CSV]   [导入 CSV]                （右侧可按需放筛选/搜索框）
```

- **新增**：`#add` → `U.modal({title, body:U.formFields(fields)})`，`onOk` 里 `DB.put(store, U.formValues(b))` 后重渲染当前 Tab（参照 `mod-assets.js:95` 的 `after:()=>App.refresh()` 或局部重绘）。
- **编辑**：列表行内 `data-e` 按钮 → 取记录 → `U.modal` 回填 `U.formFields(fields, rec)`（参照 `mod-assets.js:97-100`）。
- **删除**：行内 `data-d` → `U.confirmBox('删除该记录？', ()=>DB.del(store,id).then(redraw))`（参照 `mod-assets.js:101-102`）。
- **导出 Excel / CSV**：`#expXlsx` / `#expCsv` → 调 `U.exportXLSX` / `U.exportCSV`（见 §五）。
- **公式字段只读**：表单中 `formula:true` 的字段渲染为 `<input readonly class="formula-ro">`，值由 `computeX()` 实时计算填入（见 §三/§四）。

> 多 sheet Tab（B9）：「新增/编辑」针对**当前子标签**对应的 sheet 数据；导出一次导出全部 sheet。

---

## 三、字段对齐映射（PHASE1 §三 → IndexedDB 表）

> 类型：T=文本 / N=数字 / D=日期 / S=选择 / U=URL / L=长文本。必填：✔。公式：标 `F`（前端计算、readOnly）。
> 旧表（B10 并行保留）：`candidates`（六维评分）、`competitors`（快照）、`products`（含 `cost`，利润区块A复用）。
> 新表 11 张：`project_progress / market_analysis / aba_keywords / research / competitor_basic / competitor_multi / competitor_plan / profit_check / profit_metrics / product_analysis / dev_plan`。

### 3.1 页面1 `dev-selection`

**Tab1 选品立项**（区块A 复用 `candidates`；区块B 新表 `project_progress`）

| PHASE1 §三字段 | store | 字段 | 类型 | 必填 | 公式 |
|---|---|---|---|---|---|
| 候选品名称 | candidates | name | T | ✔ | |
| 站点 | candidates | site | S(US/EU/JP) | ✔ | |
| 类目 | candidates | category | T | | |
| 市场规模 | candidates | mktSize | N(1-10) | ✔ | |
| 竞争度 | candidates | compete | N(1-10) | ✔ | |
| 价格带 | candidates | priceBand | N(1-10) | ✔ | |
| 毛利空间 | candidates | margin | N(1-10) | ✔ | |
| 合规风险 | candidates | compliance | N(1-10) | ✔ | |
| 供应链 | candidates | supply | N(1-10) | ✔ | |
| 备注 | candidates | note | L | | |
| 综合分 _score | candidates(计算) | _score | N | | **F**(L1) |
| 建议 _adv | candidates(计算) | _adv | S | | **F**(L2) |
| 选品项目进展 | project_progress | progress | T | ✔ | |
| 开始时间 | project_progress | startDate | D | | |
| 完成时间 | project_progress | doneDate | D | | |
| 完成情况说明 | project_progress | note | L | | |
| 关联候选品 | project_progress | candidateId | N(id) | | 关联 candidates.id |

> 综合分公式（L1，沿用 `mod-assets.js:66-70` DIMS 权重）：`_score = Σ(dim×w)×10`，w: 市场.2/竞争.15/价格带.15/毛利.2/合规.15/供应链.15。
> 建议（L2）：`_score≥75 → 优先打爆`；`≥55 → 可上架`；其余 `观望`（B1 已确认沿用）。

**Tab2 多维度市场分析** → 新表 `market_analysis`（B9 多 sheet，下表为各 sheet 主字段映射，store 统一 `market_analysis` + `sheet` 区分列）

| sheet | 主字段（store: market_analysis） | 类型 | 必填 | 公式 |
|---|---|---|---|---|
| 大类目筛选 | catName(T) / ratio(N) / china(N) / us(N) | T/N | catName | |
| 常见问题筛选 | qType(T) / summary(L) / note(L) | T/L | | |
| 趋势图 | googleTrend(U) / aliIndex(U) | U | | |
| 关键词1—数据源 | asin(T)/brand(T)/country(T)/monthSales(N)/monthAmt(N)/bsr(N)/price(N)/marginPct(N)/fbaFee(N)/rating(N)/reviews(N)/rev30(N)/onDays(N)/bb(T)/monopolyPct(N)/cap(N) | T/N | asin,price | marginPct **F** |
| TOP100—数据源 | pName(T)/brand(T)/cat(T)/bsr(N)/price(N)/rating(N)/reviews(N)/dSales(N)/mSales(N)/mAmt(N)/margin(N)/fbaFee(N)/rev30(N)/onDays(N)/bb(T)/asin(T)/link(U) | T/N/U | asin,price | margin **F** |
| 关键词1—维度分析 | cap(N)/top10Mono(N)/priceRange(T)/reviewDist(T)/onDist(T)/ratingDist(T)/feeDist(T)/revRateDist(T) | T/N | | |
| top日单量分析 | rank(N)/dSales(N)/brand(T)/asin(T)/onDays(N)/price(N)/fee(N)/revRate(N)/sharePct(N) | T/N | | sharePct **F** |
| 利润表 | dSales(N)/price(N)/rate(N)/cost(N)/weightKg(N)/fba(N)/commission(N)/loss(N)/airFee(N)/seaFee(N)/totalCost(N)/profit(N)/profitPct(N)/airRoi(N)/seaRoi(N) | N | | profitPct/airRoi/seaRoi **F**(L3 复用) |
| TOP100—竞品及店铺分析 | country(T)/img(U)/pName(T)/kw(T)/kwRank(N)/cpCount(N)/saleLink(U)/seller(T)/onDays(N)/reviews(N)/price(N)/buyLink(U)/buyPrice(N)/shipFee(N)/weightKg(N)/gross(N)/grossPct(N)/rev30Total(N)… | T/N/U/L | | grossPct **F** |
| 供应商采购信息 | seq(N)/img1(U)/img2(U)/company(T)/contact(T)/tel(T)/addr(T)/web(U)/buyPrice(N)/targetPrice(N)/param1(T)/param2(T) | T/N/U | | |
| 可行性及竞争度 | salesRatio(N)/maySales(N)/forecast(N)/ratioAna(N) | N | | |
| 其他平台类目分析 | web(U)/kw(T)/note(T)/kwSearch(T) | T/U | | |

> 同一 store `market_analysis` 加列 `sheet`（字符串标记所属 sheet）+ `seq`（组内顺序）。公式项（毛利率/ROI/占比/垄断率）全部标记 `F`，在 `render` 时由 `computeMarket(row)` 计算后 `readOnly` 展示。必填主键：类目名 / 关键词 / ASIN / 价格（PHASE1 §三 标注）。

**Tab3 ABA 关键词调研** → 新表 `aba_keywords`（B9 多 sheet：汇总 / 1-3月 / 4-6月 / 7-9月 / 10-12月 / 2020年 / Sheet2去重词库）

| PHASE1 §三字段 | store: aba_keywords | 字段 | 类型 | 必填 | 公式 |
|---|---|---|---|---|---|
| 搜索词 | term | T | ✔(主键) | |
| 排名（1-3月） | rankQ1 | N | | |
| 排名（4-6月） | rankQ2 | N | | |
| 排名（7-9月） | rankQ3 | N | | |
| 排名（10-12月） | rankQ4 | N | | |
| 挑出排名10000（无参数） | rank10000 | N | | |
| 无参数统计/总和 | noParamSum | N | | **F**(聚合) |
| 趋势 | trend | S(增量产品/容量大/推荐产品) | | **F**(L10 待固化) |
| 容量 | capacity | S(大/小) | | |
| 推荐 | recommend | S | | **F**(L10，B7 后续固化) |
| 数据源(分季度) | sheet/seq/term/rank | T/N | | |
| 去重词库(Sheet2) | sheet='dedup'/seq/term/dedup(T) | T | | |

> `aba_keywords` 加 `sheet` 列区分各季度 sheet 与去重词库；`recommend`/`trend` 为公式判定（B7 待固化，Phase 3 先按模板规则占位，不写死）。

**Tab4 选品调研表** → 新表 `research`（B9 多 sheet：市场分析/竞品分析/竞品品牌分析/用户场景分析/用户需求分析/产品测试报告/利润分析/投入产出表/数据源）

| sheet | 主字段（store: research + sheet 列） | 类型 | 必填 | 公式 |
|---|---|---|---|---|
| 市场分析 | brand(T)/dSales(N)/mSales(N)/mSalesAmt(N)/asinCount(N)/sharePct(N) | T/N | | sharePct **F** |
| 竞品分析 | brand(T)/asin(T)/sharePct(N)/link(U)/mainImg(U)/subRank(T)/mainRank(T)/reviews(N)/rating(N)/price(N)/onDays(N)/dSales(N)/mSales(N)/mAmt(N)/tech(T)…/sellingPoint(L)/complaint(L)/note(L) | T/N/U/L | asin | sharePct **F** |
| 竞品品牌分析 | brand(T)/segment(T)/sharePct(N)/metric(T)/status(T) | T/N | | |
| 用户场景分析 | kw/num/ratio · group/num/ratio · scene/num/ratio · feature/num/ratio | T/N | | ratio **F** |
| 用户需求分析 | brand(T)/asin(T)/badType(T)/ratio(N)/total(N) | T/N | | ratio **F** |
| 产品测试报告 | img(U)/summary(L)/note(L)/testItems(L) | U/L | | |
| 利润分析 | shipMode(T)/country(T)/size(T)/priceLocal(N)/rate(N)/priceUsd(N)/costUsd(N)/firstLeg(N)/fba(N)/tariffUs(N)/commPct(N)/feeUsd(N)/totalCost(N)/grossUsd(N)/grossPct(N)/promoYear(N)/refundPct(N)/netPct(N)/note(L) | T/N/L | priceLocal | grossPct **F**(L5)、netPct **F**(L5 扣除12%佣金) |
| 投入产出表 | product(T)/stage(T)/goal(T)/eta(N)/mktIn(N)/mktOut(N)/total(N)/action(L)/saleEstD(N)/saleEstM(N) | T/N/L | | |
| 数据源 | rank(N)/mainRank(T)/asin(T)/product(T)/brand(T)/cat(T)/mSales(N)/dSales(N)/price(N)/mAmt(N)/reviews(N)/rating(N)/onDays(N)/shipMode(T) | T/N | | |

### 3.2 页面2 `dev-competitor`

**Tab1 基础竞品分析表** → 新表 `competitor_basic`（PHASE1 §三 页面2 Tab1；参考模板字段并入「多竞品对比」子视图，B9 可选子标签：基础信息/多竞品对比）

| PHASE1 §三字段 | store: competitor_basic | 字段 | 类型 | 必填 | 公式 |
|---|---|---|---|---|---|
| 品名 | name | T | ✔ | |
| 类目 | category | T | | |
| 记录时间 | recDate | D | | |
| 排名 | rank | N | | |
| 主图 | img | U | | =DISPIMG→URL（见 §八） |
| ASIN | asin | T | ✔(主键) | |
| 近30天销量 | sales30 | N | ✔ | |
| 类目排名 | catRank | T(含#) | | |
| 标题 | title | L | | |
| 五点描述 | bullets | L | | |
| 关键词 | keywords | L | | |
| 售价 | price | N | ✔ | |
| FBA配送费 | fbaFee | N | | |
| 历史价格趋势 | priceTrend | U/L | | |
| 历史最低/最高价$ | priceMin/priceMax | N | | |
| 上架时间 | onDate | D | | |
| 变体 | variant | T | | |
| 评价数 | reviews | N | | |
| 评分 | rating | N | | |
| 差评数 | badReviews | N | | |
| 差评率 | badRate | N | | **F**(L12 = badReviews/reviews) |
| 包装尺寸/重量 | pkgSize/pkgWeight | T | | |
| 好评/差评主要内容 | goodContent/badContent | L | | |
| 评价总结 | reviewSummary | L | | |
| 新品可优化项目 | optimize | L | | |

> 差评率 `badRate` 标记 `F`，`render` 时 `badReviews/reviews`（L12 确认公式）。

**Tab2 竞品多维度分析** → 新表 `competitor_multi`（B9 多 sheet：总结/价格测算/站内竞争分析/同类性能对比/产品基础信息/床单差评分析/价格维度/尺寸-销量斜率/品牌分析/流量端口/总表）

| sheet | 主字段（store: competitor_multi + sheet 列） | 类型 | 公式 |
|---|---|---|---|
| 总结 | lifeCycle(L)/intraComp(L)/kwTop100(L)/quality(L)/pNameCn(T)/purchase(N)/overseaShip(T)/headCost(N)/shipCost(N)/commission(N)/gross(N)/afterSale(N)/price(N)/grossPct(N) | T/N/L | grossPct **F**(L6) |
| 价格测算 | pNameCn(T)/L/N/Hinch(N)/gWeight(N)/nWeight(N)/purchase(N)/inShipMode(T)/inShipCost(N)/outShipMode(T)/outHeadCost(N)/shipCost(N)/commission(N)/commPct(N)/gross(N)/afterSale(N)/price(N)/grossPct(N) | T/N | grossPct **F**(L6) |
| 站内竞争分析 | c1/c2/c3/c4(T) | T | |
| 同类性能对比 | product(T)/price(N)/desc(L)/priceRange(T)/specs(T)/report(L) | T/N/L | |
| 产品基础信息 | sku(T)/pNameCn(T)/L/N/Hinch(N)/gWeight(N)/nWeight(N)/accessory(T)/moq(N)/purchaseNoTax(N)/purchaseTax(N)/supply(T)/orderDate(D)/leadTime(N) | T/N/D | |
| 床单差评分析 | problem(L)/analysis(L)/qty(N)/note(L)/ratio(N) | L/N | ratio **F** |
| 价格维度 | priceRange(N)/asinCount(N)/estSales(N) | N | |
| 尺寸-销量斜率 | rowLabel(T)/sumPrice(N)/sumEstSales(N) | T/N | |
| 品牌分析 | rowLabel(T)/minP/maxP/avgP(N)/sumEstSales(N)/sumRating(N)/sumReviews(N) | N | |
| 流量端口 | rowLabel(T)/asinCount(N)/sumEstSales(N)/minP/maxP/avgP(N)/avgRating(N)/sumReviews(N) | N | |
| 总表 | port(T)/page(T)/hash(N)/pName(T)/brand(T)/price(N)/price30(N)/minPrice(N)/net(N)/fba(N)/netPct(N)/lqs(N)/cat(T)/seller(T)/rank(N)/bsr30(N)/stock(N)/estSales(N)/estRev(N)/reviews(N)/rpr(N)/effDate1/2(D)/rating(N)/bestsellerUrl(U) | T/N/D/U | netPct **F** |

**Tab3 竞品调研&推广计划表** → 新表 `competitor_plan`（B9 多 sheet：产品调研/产品成本推算/推广计划）

| sheet | 主字段（store: competitor_plan + sheet 列） | 类型 | 必填 | 公式 | 合规(B4) |
|---|---|---|---|---|---|
| 产品调研 | recDate(D)/no(T)/kwSite(T)/brand(T)/img(U)/note(L)/rating(N)/reviews(N)/localPrice(N)/rank(N)/pubDate(D)/months(N)/estMonthSales(N) | T/N/D/U | | | |
| 产品成本推算 | product(T)/asin(T)/year(N)/month(N)/profit(N)/breakEvenPrice(N)/breakEvenPct(N)/rmbCost(N)/costRatio(N)/realCostRatio(N)/price(N)/fbaSingle(N)/firstLeg(N)/productCost(N)/estSales(N) | T/N | | 盈利价/盈亏率 **F** | ⚠️ **剔除** 预计月刷单量/刷单中介费/刷单亚马逊佣金/刷单FBA费用/预计月刷单成本/预计月刷单详细计划 |
| 推广计划 | product(T)/asin(T)/rivalAsin(T)/rivalReview(N)/rivalPrice(N)/rankNote(L)/pushDate(D)/priceUsd(N)/rivalStock(N)/product(T)/costRmb(N)/estSales(N)/estMonthShipCostRmb(N)/amzCommRmb(N)/fbaRmb(N)/totalHeadRmb(N)/estMonthAdRmb(N)/estRevRmb(N)/totalProdCostRmb(N)/lossRmb(N)/otherCostRmb(N) | T/N/D/L | | 各项 RMB **F**(汇率×) | ⚠️ **剔除** 预计月刷单量/刷单产品成本RMB/刷单佣金RMB/刷单FBA费用RMB/刷单中介费 |

> **B4 落地硬约束**：`competitor_plan` 的 schema 中**绝对不定义**任何含「刷单/shua/测评中介」语义的字段。Phase 3 实现时以本表字段清单为白名单，禁止扩展（见 §八 风险）。

### 3.3 页面3 `dev-profit`

**Tab1 利润测算 / 产品利润核对表**
- 区块A 利润测算 → **复用 `products` + `cost`**（B10 保留，PHASE1 §三 页面3 Tab1 区块A；字段见 `mod-assets.js:337-347`：`name/sku/price/purchase/firstLeg/fbaFee/commission/storage/returnLoss/targetAcos`）。
- 区块B 产品利润核对表 → 新表 `profit_check`（B9 多 sheet：1-产品尺寸录入表/2-配送费预估核对/3-利润预估表2.0/FBA配送费计算逻辑（参照表））

| sheet | 主字段（store: profit_check + sheet 列） | 类型 | 公式 |
|---|---|---|---|
| 1-产品尺寸录入表 | onDate(D)/pName(T)/img(U)/asin(T)/sku(T)/fnsku(T)/sizeCm(N)/weightKg(N)/pkgSizeCm(N)/pkgWeightKg(N)/lxwxhCm(N)/lxwxhInch(N)/pkgLxWxHcm(N)/pkgLxWxHinch(N)/pkgWeightLb(N)/volDiv6000(N)/volDiv5000(N) | T/N/D/U | volDiv6000/5000 **F**(L8) |
| 2-配送费预估核对 | asin(T)/sku(T)/fbaWeightLb(N)/fbaTier(T)/estFee(N)/fbaRealWeight(N)/fbaRealFee(N)/update(D) | T/N/D | |
| 3-利润预估表2.0（**母口径 B2**） | sku(T)/purchase$(N)/firstLeg$(N)/fbaFee$(N)/commission$(N)/refund$(N)/ad$(N)/storageOther$(N)/promo$(N)/price$(N)/cost$(N)/profit$(N)/profitRmb(N)/shipMode(S)/version(S:预估/核对)/rate(N)/volDiv5000(N)/volDiv6000(N) | T/N/S | cost$/profit$/profitRmb **F**(母口径，见 §四) |
| FBA配送费计算逻辑 | 尺寸换算/尺寸分段(标准/大件/超大件)/费率(202509版) | 参照表 | 存 `fba_rate` 或由 B3 费率表读取 |

> **B3 落实**：FBA 费率存用户可维护表（建议新增 `fba_rate` 或并入 settings），内置 202509 版默认值；`2-配送费预估核对` 的 `fbaTier/estFee` 由该表查得。

**Tab2 选品利润指标** → 新表 `profit_metrics`（PHASE1 §三 页面3 Tab2；`选品利润指标.xlsx` Sheet1）

| PHASE1 §三字段 | store: profit_metrics | 字段 | 类型 | 必填 | 公式 |
|---|---|---|---|---|---|
| 渠道 | channel | S(空运/专线/…) | ✔ | |
| 货币 | currency | S(美元/英镑/欧元/加元/墨西哥/日元) | ✔ | |
| 商品售价 | price | N | ✔ | |
| 单个重量/g | weightG | N | | |
| 货代/1g | freightPerG | N | | |
| 头程FBA运费/RMB | firstLegRmb | N | | |
| 商品成本/RMB | costRmb | N | ✔ | |
| 利润/RMB | profitRmb | N | | **F**(L4) |
| 利润比 | profitRatio | N | | **F**(L4) |
| 汇率 | rate | N | | **B5 记录可编辑**（默认6.8，非硬编码） |
| 兑换后售价/RMB | priceRmb | N | | **F**(L4) |
| 税/RMB | taxRmb | N | | **F** |
| 抽点/RMB | commissionRmb | N | | **F** |
| 预扣（广告7%+退货5%） | preDeduct | N | | **F**(L4) |
| AMZ后台到账 | netReceive | N | | **F** |
| 亚马逊配送费/RMB | amzShipRmb | N | | **F** |
| 汇损 | fxLoss | N | | **F** |
| 产品体积 | volL/volW/volH/volWeightKg/qty/unitWeight | N | | 辅助 |

**Tab3 通用产品分析表** → 新表 `product_analysis`（B9 多 sheet：产品需求定型/季节性和趋势分析数据/市场调研数据-US/UK/JP备用）

| sheet | 主字段（store: product_analysis + sheet 列） | 类型 |
|---|---|---|
| 产品需求定型 | cnName(T)/enName(T)/img(U)/func(L)/scene(L)/marketAna(L) | T/U/L |
| 季节性和趋势分析 | googleTrend(U)/trendImg(U)/asinRankTrend(T) | U/T |
| 市场调研数据-US/UK/JP备用 | img(U)/brand(T)/link(U)/asin(T)/onDate(D)/rating(N)/reviewsTotal(N)/price(N)/mainRank(N)/estDSales(N)/segment(T)/segmentDetail(L) | T/N/D/U/L |

**Tab4 产品开发表** → 新表 `dev_plan`（B9 多 sheet：1.前台看/2.后台看/3.旁边看/4.产品定位/5.产品需求分析/供应商产品筛选/项目检视表/US-FBA成本分析表/开发流程图）

| sheet | 主字段（store: dev_plan + sheet 列） | 类型 | 公式 |
|---|---|---|---|
| 1.前台看 | site(S)/img(U)/pName(T)/kw(T)/cpCount(N)/mainSeller(T)/saleLink(U)/reviews(N)/feedback(N)/rating(N)/badPoint(L)/sellingPoint(L)/price(N)/buyLink(U)/buyPrice(N)/weightG(N)/gross(N)/lifeCycle(T)/grossPct(N) | T/N/U/L | gross/grossPct **F** |
| 2.后台看 | img(U)/pName(T)/buyLink(U)/buyPrice(N)/rivalLink(U)/rivalPrice(N)/gross(N)/sales(N)/lifeCycle(T)/cpCount(N)/grossPct(N) | T/N/U | gross/grossPct **F** |
| 3.旁边看 | bigRetailer(T)/bigBrandSite(U)/mainStyle(T)/newStyle(T)/priceRange(T)/sellingPoint(T)/weakness(T)/position(T)/onPlatform(T) | T/U | |
| 4.产品定位 | segment(T)/targetMarket(L) | T/L | |
| 5.产品需求分析 | top100(T)/style(T)/capacity(T)/color(T)/cupStyle(T) | T | |
| 供应商产品筛选 | supplier(T)/styleFeature(T)/priceRange(T)/conclusion(T) | T | |
| 项目检视表 | progress(T)/startDate(D)/doneDate(D)/note(L) | T/D/L | （同 project_progress 结构，本 Tab 内独立复用） |
| US-FBA成本分析表 | cm(T)/country(T)/account(T)/brand(T)/sku(T)/cnName(T)/asin(T)/price$(N)/grossRmb(N)/grossPct(N)/purchaseRmb(N)/weightG(N)/firstLegRmb(N)/tariff(N)/fbaHandling$(N)/fbaPick$(N)/fbaWeight$(N)/commPct(N)/referralFee$(N)/rate(N)/firstLegRate(N) | T/N | gross/grossPct **F**(母口径复用) |
| 开发流程图 | steps(L) | L | 非表格，富文本/步骤列表 |

### 3.4 公式项 readOnly 处理统一约定

所有标记 `F` 的字段：
- 在 `U.formFields` 的字段定义里加 `readonly:true`，渲染为 `<input readonly class="formula-ro">`（新类见 §七）。
- 值由对应 `computeX(row)` 函数计算后注入（如 `computeScore`、`computeBadRate`、`computeProfitV2`、`computeMarketMargin` 等）。
- **校验**：`U.formValues`（`js/ui.js:151-164`）已对 `number`/`data-num` 做类型转换；公式字段不应出现在可手填集合，render 时直接覆盖其值，避免用户篡改（PHASE1 §五 校验要求「公式字段禁止手填」）。

---

## 四、业务逻辑落地口径（PHASE1 §四 L1-L14 + §七 确认结论）

### 4.1 母口径成本与净利率公式（B2 核心，统一 L3 利润预估表2.0）

**新增 `U.profitV2(rec)`（建议放 `js/ui.js`，与现有 `U.profit` 并存）**，输入 `rec` 含母口径显式金额字段（对应 `profit_check` sheet3 / `products.cost` 升级）：

```
母口径字段（每记录，金额单位统一为 $）：
  price       售价$
  purchase    采购价$
  firstLeg    头程运费预估$
  fbaFee      FBA配送费$
  commission  平台佣金$        （= price × commPct，commPct 可存比率或金额；本口径以 $ 为准）
  refund      退款预估$
  ad          总体广告预估$
  storageOther 仓储其他$
  promo       其他促销$
  rate        汇率（记录级，B5 可编辑，默认 6.8/7 仅初始值，不全局硬编码）
  shipMode    发货方式（快递/空运/海运，关联 B6/B8 费率）

成本$：
  cost$ = purchase + firstLeg + fbaFee + commission + refund + ad + storageOther + promo
利润$：
  profit$ = price − cost$
净利率%：
  netPct = price ? profit$ / price × 100 : null
利润￥：
  profitRmb = profit$ × rate          （B5 记录级汇率）
保本ACOS%（广告可承受上限）：
  breakEvenAcos = price ? (price − (purchase+firstLeg+fbaFee+commission+refund+storageOther+promo)) / price × 100 : null
                = price ? (grossBeforeAd / price) × 100 : null
```

**其余利润视角如何复用母口径**（B2 要求「其余作为不同视角，不再各写一套」）：

| 视角 | 复用方式 | 差异点（仅输入不同） |
|---|---|---|
| 现有 `U.profit`（products.cost，L14） | 视为「快速估算视角」：用比率代理金额（`commission=price×.15`、`refund=(price+firstLeg+fba)×.05`、`ad=price×targetAcos`），代入公式得到同形 `cost$/profit$/netPct`。**Phase 3 让 `U.profit` 内部调用 `U.profitV2` 并自动把比率转金额**，避免两套公式漂移。 | 佣金/退款/广告用比率而非显式$，且不含 promo |
| 选品利润指标（profit_metrics，L4） | 复用 `profit$` 思路，但头程按「重量×货代费率/1g」算（`firstLegRmb=weightG×freightPerG`），再经 `rate` 折 $；`profitRmb = priceRmb − costRmb − 头程 − 配送费 − 税 − 抽点 − 预扣 − 汇损`（L4）。 | 输入维度不同（渠道/货币/重量），净逻辑同母口径 |
| 选品调研表利润分析（research 利润分析 sheet，L5） | 复用母口径，但「佣金」固定 12% + 退款/推广为独立字段：`netPct【扣除12%佣金】= (gross − 全年推广费 − 退款)/售价`（L5）。 | 佣金率固定 12%，退款/推广独立 |
| 竞品多维度价格测算（competitor_multi 价格测算/总结，L6） | 复用：`gross = price − purchase − 头程 − 配送 − 佣金 − 售后`；`grossPct = gross/price`。 | 字段命名差异，公式同形 |

> **关键**：所有利润计算最终收敛到 `U.profitV2` 单一实现；各 Tab 的 `computeX` 仅负责「把本表字段翻译为母口径入参」。实现层一处改、处处改。

### 4.2 B4 全部剔除刷单字段

- 仅在 `competitor_plan` 表定义中排除（见 §三 3.2 Tab3 合规列）。
- 任何「推广计划/成本推算」sheet 仅保留合规推广费用（广告费 `ad`、头程 `firstLeg`、佣金、FBA、`otherCostRmb` 等）。
- 白名单校验：Phase 3 在 `DB.put('competitor_plan', obj)` 前，若 `obj` 含 `shua/刷单/测评中介` 等键名则拒绝（防御式，见 §八）。

### 4.3 B3 用户可维护 FBA 费率表

- 新增可维护结构（建议 `settings` 里 `fbaRate` 键，或独立 `fba_rate` store）：内置 202509 版默认值（标准/大件/超大件 × 各尺寸分段 × 配送费）。
- 在「设置与阈值」页（`mod-assets.js:300-325`）或 `dev-profit` 内提供「FBA 费率维护」入口，存 `DB.setSetting('fbaRate', obj)`。
- `profit_check` sheet2 的 `fbaTier/estFee` 由 `U.fbaFee(tier, weight)` 查表得到（L7）。

### 4.4 B5 汇率按记录可编辑

- 所有涉及双币种的表（`profit_check` / `profit_metrics` / `dev_plan` US-FBA成本分析表等）`rate` 字段为**普通可编辑数字**，默认 6.8（利润指标）/ 7（推广计划，L9）仅作 `def` 初始值（`U.formFields` 的 `def`，`js/ui.js:142`），**绝不写在常量里**。
- `U.profitV2` 读取 `rec.rate` 而非全局常量；无值时回退默认但不硬编码到公式。

### 4.5 其余已确认项（B1/B6/B7/B8/B9/B10/B11）

- **B1 六维权重/阈值**：沿用（市场.2/竞争.15/价格带.15/毛利.2/合规.15/供应链.15；≥75 优先打爆 / ≥55 可上架），权重在 `mod-assets.js:66-70` 已定义，原样保留（§三 3.1）。
- **B6 头程抛重**：`抛重kg = 长×宽×高 ÷ 6000`（L8，B6 拍板 ÷6000 取大）；实重/抛重取大；按渠道（快递/空运/海运，B8）映射费率。实现 `U.volWeight(l,w,h, div=6000)` 与 `U.chargeableWeight(实重, 抛重)=max`。
- **B7 ABA 推荐/趋势判定**：`recommend/trend` 先按模板规则占位（增量产品/容量大/推荐产品），判定逻辑后续固化，Phase 3 不写死（PHASE1 标注「待确认」）。
- **B8 头程费率**：按重量或体积重计费、由用户维护（同 B3 维护思路）。
- **B9 子表切换**：见 §2.3，导出保持多 sheet。
- **B10 旧表并行保留**：`candidates/competitors/products` 不迁移，新表独立（§六）。
- **B11 导出双格式**：CSV（现有）+ xlsx（新增 SheetJS），见 §五。

---

## 五、导出方案（B11：CSV + xlsx 双格式）

### 5.1 SheetJS 引入与离线化

- 下载 `xlsx.full.min.js`（SheetJS 社区版）放到 `vendor/sheetjs/xlsx.full.min.js`。
- `index.html:65-71` 的 `<script>` 链中，`echarts` 之后追加：
  ```html
  <script src="vendor/sheetjs/xlsx.full.min.js"></script>
  ```
- **离线可用要求**（§八 风险点之一）：必须本地 vendored，**禁止**仅用 CDN `<script src="https://cdn.sheetjs.com/...">`（断网即失效，违背纯前端离线约束）。CDN 仅作「vendored 缺失时的兜底提示」，不用于运行时加载。
- 加载判定：`if(window.XLSX){...}else{U.toast('未找到 SheetJS，仅可导出 CSV')}`。

### 5.2 `U.exportXLSX` 设计（`js/ui.js`）

复用现有 `U.download`（`js/ui.js:186`）的 Blob 思路，但改为 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`：

```js
// sheets: [{name, rows:[{...}], headers:[{key,label}]}]
U.exportXLSX = function(filename, sheets){
  if(!window.XLSX){ U.toast('SheetJS 未加载，改用 CSV'); return; }
  const wb = XLSX.utils.book_new();
  sheets.forEach(s=>{
    const aoa = [ s.headers.map(h=>h.label) ];          // 表头
    s.rows.forEach(r=> aoa.push(s.headers.map(h=> r[h.key] )));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0,31)); // 截断超长名
  });
  XLSX.writeFile(wb, filename.endsWith('.xlsx')?filename:(filename+'.xlsx'));
};
```

### 5.3 单 sheet Tab 导出

每个 Tab 顶部「导出 Excel」按钮：

```js
root.querySelector('#expXlsx').onclick = () => {
  const rows = await DB.all(store);          // 或当前子标签过滤后的 rows
  const headers = COLS.map(c=>({key:c.k, label:c.t}));   // COLS 同 U.table 的 cols
  U.exportXLSX('选品立项.xlsx', [{ name:'选品立项', rows, headers }]);
};
```

导出文件名严格沿用 PHASE1 §二：选品立项.xlsx / 多维度市场分析.xlsx / ABA关键词调研.xlsx / 选品调研表.xlsx / 基础竞品分析表.xlsx / 竞品多维度分析.xlsx / 竞品调研推广计划表.xlsx / 产品利润核对表.xlsx / 选品利润指标.xlsx / 通用产品分析表.xlsx / 产品开发表.xlsx。

### 5.4 多 sheet Tab 导出（B9 + B11）

多 sheet Tab（市场分析/ABA/调研表/竞品多维度/竞品计划/利润核对表/通用分析/开发表）导出时，**一次导出多个 sheet**，与子标签顺序一致：

```js
root.querySelector('#expXlsx').onclick = () => {
  const sheets = SUBTABS.map(sub => {
    const rows = await DB.all(store, {sheet: sub.key}); // 按 sheet 列过滤
    return { name: sub.label.slice(0,31),
             rows, headers: SUB_COLS[sub.key] };
  });
  U.exportXLSX('多维度市场分析.xlsx', sheets);
};
```

> 注意 `XLSX.utils.book_append_sheet` 的 sheet 名 ≤31 字符且唯一，多 sheet 同名需加序号。

### 5.5 CSV 保留

`U.exportCSV`（`js/ui.js:191`）继续可用，作为轻量/兼容导出；每个 Tab 同时提供「导出 CSV」（单 sheet 取当前视图，多 sheet 取当前子标签或合并为单表）。

---

## 六、IndexedDB 新表设计（`js/db.js`）

### 6.1 表清单与 `TABLES` 追加

`DB_VER=4`（`js/db.js:3`）→ **bump 为 `5`**（`js/db.js:3`）。`TABLES`（`js/db.js:4-8`）追加 11 张（含 B3 的 `fba_rate` 共 12 张，可选）：

```js
const TABLES=[ /* ...原有 32 张... */ ,
  'project_progress','market_analysis','aba_keywords','research',
  'competitor_basic','competitor_multi','competitor_plan',
  'profit_check','profit_metrics','product_analysis','dev_plan'
  // ,'fba_rate'   // B3 用户可维护费率表（可选独立 store 或放 settings）
];
```

> **为何 bump DB_VER**：`open()` 的 `onupgradeneeded`（`js/db.js:15-23`）仅在新 `DB_VER > 旧版本` 时触发，遍历 `TABLES` 对缺失 store 调 `createObjectStore`（`js/db.js:17-22`）。不 bump 则新表不会被创建。bump 后旧用户库自动补建新表，旧表数据不动（B10）。

### 6.2 各新表 schema / 索引 / 与旧表关系

> 以下为 schema 草案（Phase 3 实现用）。`keyPath:'id', autoIncrement:true`（同 `js/db.js:19-20`，除 settings 用 key）。索引按查询维度建。

| store | 主要字段 | 索引 | 与旧表关系 |
|---|---|---|---|
| `project_progress` | id, candidateId, progress, startDate, doneDate, note | `candidateId` | 关联 `candidates.id`（B10 旧表，不迁移） |
| `market_analysis` | id, sheet, seq, + 各 sheet 字段(asin/price/marginPct…) | `sheet` | 全新；旧 `competitors` 不覆盖 |
| `aba_keywords` | id, sheet, seq, term, rankQ1..Q4, recommend, … | `sheet`,`term` | 全新 |
| `research` | id, sheet, seq, + 各 sheet 字段 | `sheet` | 全新 |
| `competitor_basic` | id, asin(PK业务), name, price, fbaFee, reviews, rating, badReviews, badRate, img… | `asin` | 全新；与旧 `competitors`(快照) 并存 |
| `competitor_multi` | id, sheet, seq, + 各 sheet 字段 | `sheet` | 全新 |
| `competitor_plan` | id, sheet, + 产品调研/成本推算/推广计划字段(**无刷单字段**) | `sheet`,`asin` | 全新；B4 剔除 |
| `profit_check` | id, sheet, + 尺寸/配送费/母口径金额字段 | `sheet`,`asin` | 母口径落地；旧 `products.cost` 并行 |
| `profit_metrics` | id, channel, currency, price, weightG, costRmb, rate, profitRmb… | `channel` | 全新（利润指标视角） |
| `product_analysis` | id, sheet, + 需求定型/调研字段 | `sheet` | 全新 |
| `dev_plan` | id, sheet, + 前台/后台/定位/供应商/成本/流程字段 | `sheet` | 全新 |
| `fba_rate`（B3 可选） | id, tier, sizeSeg, fee, effDate | `tier` | 用户可维护费率，内置 202509 默认 |

### 6.3 seed() 演示数据策略（缺表才写）

复用现有 `fillTable(store,builder)`（`js/db.js:190-194`）——**仅当 `DB.count(store)===0` 才写入**，已有数据绝不覆盖（与 B10 一致）。在 `seed()`（`js/db.js:196-419`）末尾追加各新表的 `fillTable` 调用，例如：

```js
await fillTable('project_progress', ()=>[
  {candidateId:/* 取自 candidates 演示 id */, progress:'产品数据分析和定位', startDate:dAgo(today,20), doneDate:null, note:''},
  ...
]);
await fillTable('market_analysis', ()=>[ /* 每 sheet 1-2 行样例，含 formula 字段由前端计算可不存 */ ]);
await fillTable('aba_keywords', ()=>[ /* 搜索词 + 季度排名样例 */ ]);
await fillTable('competitor_basic', ()=>[ /* 2-3 个 ASIN 样例 */ ]);
await fillTable('profit_check', ()=>[ /* 母口径样例，cost$/profit$ 由 seed 时直接算好写入，或留空前端算 */ ]);
await fillTable('profit_metrics', ()=>[ /* 1-2 行含 rate 默认 6.8 */ ]);
await fillTable('product_analysis', ()=>[ /* 样例 */ ]);
await fillTable('dev_plan', ()=>[ /* 样例 */ ]);
// competitor_multi / competitor_plan / research 同理
```

> `ensureBase()`（`js/db.js:116-187`）**不改**：旧 `candidates/competitors/products` 演示数据保留，新表演示数据独立补充，互不干扰。
> 重置演示数据入口在「数据与备份」页（`mod-assets.js:284` `DBSeed`）保持不变。

---

## 七、UI 规范增量（仅补增量，不重写）

### 7.1 `css/style.css` 新增类（科技蓝统一）

```css
/* Tab 条（页面内一级） */
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:6px 0 14px;flex-wrap:wrap}
.tab{padding:8px 14px;cursor:pointer;font-size:13px;color:var(--ink2);border-bottom:2px solid transparent;margin-bottom:-1px}
.tab:hover{color:var(--blue)}
.tab.active{color:var(--blue);border-bottom-color:var(--blue);font-weight:600}

/* 子标签（B9 二级，较 Tab 小一号） */
.sub-tabs{display:flex;gap:2px;background:var(--blue-soft);border-radius:8px;padding:3px;margin-bottom:12px;flex-wrap:wrap}
.sub-tab{padding:5px 11px;cursor:pointer;font-size:12px;color:var(--ink2);border-radius:6px}
.sub-tab:hover{color:var(--blue)}
.sub-tab.active{background:#fff;color:var(--blue);font-weight:600;box-shadow:0 1px 3px rgba(30,95,168,.12)}

/* 分区卡（一个 sheet / 一个区块独立成卡） */
.section-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;margin-bottom:12px}
.section-card > h4{margin:0 0 8px;font-size:13px;color:var(--blue)}

/* 图片 URL 字段（=DISPIMG 转 URL，§八） */
.img-field{display:flex;gap:8px;align-items:center}
.img-field img{width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--line)}

/* 公式只读展示 */
.formula-ro{background:#F2F7FC;color:var(--blue);font-weight:600;cursor:not-allowed}
td.formula, .formula{color:var(--blue);font-weight:600}
```

### 7.2 `js/ui.js` 新增 / 调整组件

| 组件 | 类型 | 说明 |
|---|---|---|
| `U.tabs(tabs)` | 新增 | 返回一级 Tab 条 HTML（`§2.2`） |
| `U.bindTabs(root,tabs,bodyEl,onSwitch)` | 新增 | 绑定切换事件 |
| `U.subTabs(sheets)` / `U.bindSubTabs(...)` | 新增 | B9 二级子标签（`§2.3`） |
| `U.sectionCard(title,body)` | 新增 | 分区卡（`§7.1`） |
| `U.imgField(url)` | 新增 | 图片 URL 输入+缩略图预览 |
| `U.profitV2(rec)` | 新增 | 母口径利润（`§4.1`），与 `U.profit` 并存 |
| `U.exportXLSX(filename,sheets)` | 新增 | SheetJS 多 sheet 导出（`§5.2`） |
| `U.fbaFee(tier,weight)` | 新增 | 查 B3 费率表 |
| `U.volWeight(l,w,h,div)` / `U.chargeableWeight()` | 新增 | B6 抛重 |
| `U.formFields` | 调整 | 支持 `readonly:true` → 渲染 `.formula-ro`（现有 `js/ui.js:140-150`） |
| `window.UI` 导出 | 调整 | 在 `js/ui.js:204-206` 的返回对象中追加上述新函数 |

> 不涉及对 `U.table / U.card / U.empty / U.modal / U.exportCSV / U.tag / U.money / U.pct` 的破坏性改动，仅增量扩展。

---

## 八、风险与待办（Phase 3 实现风险提示）

### 8.1 关键风险点

1. **`=DISPIMG` 图片转 URL（高风险）**：Excel 模板用 `=DISPIMG` 内嵌图片，Web 端只能存 URL 或本地上传占位（`img` 字段类型 U）。Phase 3 需明确：录入时接受图片 URL 字符串；若需本地图片，走 `FileReader` 转 base64 存 IndexedDB（注意体积/配额，`mod-assets.js:291-296` 已有 storage estimate 提示）。导出 xlsx 时图片无法简单回写为 `=DISPIMG`，**先导出 URL 文本**，高级图片嵌入留待后续。
2. **SheetJS 离线化（中风险）**：必须本地 vendored（`vendor/sheetjs/`），不可依赖 CDN（断网/内网失效，违背纯前端离线约束）。需随仓库分发该 ~900KB 文件，并在 `index.html` 注册。注意 SheetJS 社区版 License 与版本冻结（避免自动升级破坏）。
3. **旧表兼容与 DB_VER bump（中风险）**：bump `DB_VER` 4→5 后，`onupgradeneeded` 会为**所有缺失 store** 建表，旧表数据保留（B10 OK）。但需回归测试：老用户升级后旧页面（如仍引用 `selection` 的代码路径）是否会 404；本方案已确认旧路由 key 不再使用，但 `P.selection/P.competitors/P.profit` 函数若保留需保证不被误触。建议 Phase 3 保留旧函数做只读兼容或显式移除并确认无引用。
4. **大数据量渲染性能（中风险）**：市场分析/TOP100/竞品总表等 sheet 行数可能上千。`U.table`（`js/ui.js:97-108`）当前一次性 `innerHTML` 全量渲染，超大数据易卡顿。建议 Phase 3 对多 sheet Tab 加分页/虚拟滚动或限制单 sheet 渲染行数（如 `slice(0,200)` + 「加载更多」），图表（echarts）同理按需 `U.chart`。
5. **B4 刷单字段防御（低风险但必须）**：`competitor_plan` 字段白名单需在实现与测试中双重保障——schema 不定义、put 前校验拒绝含敏感键名，避免后续维护误加。
6. **利润口径一致性回归（中风险）**：母口径 `U.profitV2` 与旧 `U.profit` 并存，需测试「products.cost 快速估算」与「profit_check 母口径」数值对齐关系，防止两套公式长期漂移（§4.1 已规定旧视角内部调用 V2）。

### 8.2 需要用户 / 跨境电商专家后续提供的资料

| 资料 | 用途 | 对应决策 |
|---|---|---|
| 最新 FBA 费率表（分尺寸分段/站点，202509 版或更新） | 初始化 `fba_rate` 默认值、配送费核对 | B3 / L7 |
| 头程费率（快递/空运/海运/专线，按重量或体积重） | `U.chargeableWeight` + 费率映射 | B6 / B8 / L8 |
| 汇率来源与默认取值（各站点） | `rate` 默认初始值（非硬编码） | B5 / L9 |
| ABA「增量产品/容量大/推荐产品」「趋势」判定规则原文 | 固化 `recommend/trend` 公式 | B7 / L10 |
| 选品利润指标 Sheet1 公式细节（样例四舍五入口径） | 校准 L4 各 RMB 分项 | L4 / B2 |
| 现有 `candidates/competitors/products` 是否仍需要旧页面入口 | 决定旧函数保留或移除 | B10 |
| 各 Excel 模板**完整表头**（≥80% 覆盖率细化） | 字段映射终稿落库 | PHASE1 §三 |

---

## 九、Phase 3 落地检查清单（摘要）

- [ ] `js/app.js:16-20` MENU 改为 3 个 `dev-*` key，profit 保留 `star:1`
- [ ] `js/db.js:3` DB_VER 4→5；`js/db.js:4-8` TABLES 追加 11(+1) 张；`seed()` 补 `fillTable`（缺表才写）
- [ ] `js/ui.js` 新增 `U.tabs/U.subTabs/U.sectionCard/U.imgField/U.profitV2/U.exportXLSX/U.fbaFee/U.volWeight`；`U.formFields` 支持 `readonly`
- [ ] `css/style.css` 新增 `.tabs/.tab/.sub-tabs/.sub-tab/.section-card/.img-field/.formula-ro`
- [ ] `js/mod-product-dev.js`（建议）实现 `P['dev-selection']/P['dev-competitor']/P['dev-profit']`，并 `window.Pages=Object.assign(...,P)` 注册；`index.html` 引入新文件 + SheetJS
- [ ] 母口径 `U.profitV2` 统一所有利润计算；旧 `U.profit` 内部调用 V2
- [ ] `competitor_plan` schema 无刷单字段 + put 前防御校验
- [ ] 多 sheet Tab 子标签切换 + 导出保持多 sheet（B9+B11）
- [ ] 汇率/费率全部记录级可编辑，无全局硬编码（B5/B3）

---

> 文档范围：仅 Phase 2 架构 / 设计规划，不改动任何源码。下一阶段 Phase 3 据此逐项落地。
> 架构师 / 2026-09-13
