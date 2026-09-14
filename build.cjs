#!/usr/bin/env node
/* 单文件构建：把 css/js/vendor 全部内联到 index.html，减少中国大陆访问 github.io 时的多资源加载失败问题。 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'index.html');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'index.html');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let html = fs.readFileSync(SRC, 'utf8');

// 内联 CSS
html = html.replace(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?">/g, (m, href) => {
  const fp = path.join(ROOT, href);
  const css = fs.readFileSync(fp, 'utf8');
  return `<style>\n/* ${href} */\n${css}\n</style>`;
});

// 内联 JS（按 src 顺序保留，vendor 也内联）
html = html.replace(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g, (m, src) => {
  const fp = path.join(ROOT, src);
  const js = fs.readFileSync(fp, 'utf8');
  return `<script>\n/* ${src} */\n${js}\n</script>`;
});

// 增加 noscript + JS 加载失败兜底提示
const fallback = `
<noscript>
  <div style="padding:40px;text-align:center;color:#c00">
    你的浏览器禁用了 JavaScript，本应用无法运行。
  </div>
</noscript>
<script>
  // 5 秒后若主应用仍未标记初始化完成，提示网络/缓存问题
  setTimeout(function(){
    if (!window.__CMDR_READY__) {
      var content = document.getElementById('content');
      if (content && !content.querySelector('.kpi')) {
        content.innerHTML = '<div class="card"><h3>页面加载未完成</h3>' +
          '<div style="font-size:13px;line-height:1.9;color:var(--red)">5 秒内应用未完成初始化，常见原因：</div>' +
          '<ul style="font-size:12px;line-height:1.9;margin-top:8px;padding-left:18px">' +
          '<li>GitHub Pages 在中国大陆部分地区被墙/限流，请尝试开启 VPN/代理后刷新。</li>' +
          '<li>浏览器缓存了旧版本，请按 Ctrl+F5（或 Shift+F5）强制刷新。</li>' +
          '<li>以 file:// 方式直接打开时，部分浏览器会禁用 IndexedDB，请用本地服务访问。</li>' +
          '</ul></div>';
      }
    }
  }, 5000);
</script>`;

// 在 </body> 前插入兜底
html = html.replace('</body>', fallback + '\n</body>');

// 标记应用初始化完成（app.js 成功执行后会设为 true）
html = html.replace('window.App=App;', 'window.App=App; window.__CMDR_READY__=true;');

fs.writeFileSync(OUT, html, 'utf8');
console.log('dist/index.html 已生成，大小:', (fs.statSync(OUT).size / 1024).toFixed(1), 'KB');
