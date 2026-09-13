SheetJS (xlsx) 本地 vendored 目录
====================================

本目录用于存放 SheetJS 社区版运行文件：`xlsx.full.min.js`

重要约束（来自 Phase 2 §5.1 / §八 风险点 2）：
- 必须本地 vendored，禁止运行时走 CDN（`https://cdn.sheetjs.com/...`）。
  原因：纯前端离线优先，断网/内网场景 CDN 即失效，违背离线约束。
- 文件缺失时，页面会在点击「导出 Excel」时由 `U.exportXLSX` 兜底提示
  “SheetJS 未加载，仅可导出 CSV”，功能降级但不报错。

获取方式（需手动放入，仓库不内置二进制）：
1. 从 SheetJS 官方社区版下载 `xlsx.full.min.js`（https://sheetjs.com/ 或 npm 包 `xlsx` 的 dist）。
2. 将文件重命名/放置为本目录下的 `xlsx.full.min.js`。
3. 注意 License 与版本冻结，避免自动升级破坏现有导出逻辑。

放置完成后目录结构应为：
  vendor/sheetjs/xlsx.full.min.js
  vendor/sheetjs/README.txt   （本文件）
