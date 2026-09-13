#!/usr/bin/env bash
# 一键推送脚本 —— 改完代码后运行即可
#
# 用法（在 Git Bash 里执行）:
#   bash push.sh "feat: 更新利润测算列"        # 自定义提交说明
#   bash push.sh                                # 不带参数则用默认说明
#
# 前提：当前目录是 cross-border-commander-clean 仓库根目录
# 效果：git add -A && git commit && git push origin main
#       GitHub Pages 会在约 1 分钟内自动重新部署

set -e

# 默认提交说明（没传参数时用日期）
msg="${1:-update: 常规更新 $(date +%Y-%m-%d)}"

echo ">> 添加所有改动 ..."
git add -A

echo ">> 提交: $msg"
git commit -m "$msg"

echo ">> 推送到 main ..."
git push origin main

echo ""
echo "✅ 已推送。GitHub Pages 将自动重新部署，约 1 分钟后生效:"
echo "   https://aurora-am.github.io/amazon-ops-commander/"
