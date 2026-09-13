# 部署与更新说明

纯前端静态站，数据只存在浏览器 IndexedDB，不调后端、不抓数据。

## 仓库
- GitHub：`aurora-am/amazon-ops-commander`
- 公网地址：`https://aurora-am.github.io/amazon-ops-commander/`
- 本地源码目录：`cross-border-commander-clean/`

## 改完代码后一键推送
在 Git Bash 里进入 `cross-border-commander-clean` 目录执行：

```bash
bash push.sh "feat: 你的改动说明"
```

脚本会自动 `git add -A && git commit && git push origin main`。
推送后 GitHub Pages 约 1 分钟自动重新部署，刷新公网地址即可看到更新。

## 手动推送（等价）
```bash
git add -A
git commit -m "feat: 你的改动说明"
git push origin main
```

## 本地预览
```bash
# 在 cross-border-commander-clean 目录下
python -m http.server 8211 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8211
```

## 注意事项
- 提交作者需是自己的 GitHub 账号（已配置 `aurora-am <aurora-am@users.noreply.github.com>`），否则会出现陌生撰稿人。
- 若换电脑，先 `git config --global user.email "aurora-am@users.noreply.github.com"` 再提交。
- Pages 开关在仓库 Settings → Pages；若显示 404 即未开启。
