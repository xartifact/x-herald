#!/usr/bin/env bash
# Every failed check must block publishing and deployment.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==> format + lint + typecheck"
bun run check

echo "==> CI script regression tests"
bun test scripts/ci.test.ts

echo "==> UI tests"
bun run test:ui

echo "==> ai-agent tests"
cd "$PROJECT_ROOT/packages/ai-agent"
bun test --reporter=dots

echo "==> agent-extensions tests"
cd "$PROJECT_ROOT/packages/agent-extensions"
bun test --reporter=dots

echo "==> backend tests"
cd "$PROJECT_ROOT/apps/gateway"
# --isolate 是必需的，不是加速选项：`mock.module()` 注册在进程全局，且是「先注册者
# 生效」—— 再次注册（含 mock.restore()）不会撤销它。任何把 db/client 换成残缺假对象
# 的文件都会污染同进程后续所有文件，产生 "db.insert is not a function" 这类雪崩。
# 文件执行顺序在 Linux runner 与 macOS 本地不同，所以该污染只在 CI 显形。
# `--isolate` 让每个测试文件持有独立全局对象，从根上消除顺序依赖。
#
# 代价：bun 在 --isolate teardown 时即使 0 失败也可能以 99 退出（本地与 Linux 容器
# 均复现）。因此仅在**汇总确实为 0 fail** 时把 99 当成功；其余情况照常失败，
# 不做无条件豁免 —— 无条件豁免会让真实回归以 99 的形式静默通过。
set +e
BACKEND_LOG=$(mktemp)
bun test --isolate --reporter=dots 2>&1 | tee "$BACKEND_LOG"
BACKEND_STATUS=${PIPESTATUS[0]}
set -e
if [ "$BACKEND_STATUS" -eq 99 ] && grep -qE '^[[:space:]]*0 fail[[:space:]]*$' "$BACKEND_LOG"; then
  echo "note: bun 以 99 退出且汇总为 0 fail（--isolate teardown 已知行为），按成功处理"
  BACKEND_STATUS=0
fi
rm -f "$BACKEND_LOG"
if [ "$BACKEND_STATUS" -ne 0 ]; then
  exit "$BACKEND_STATUS"
fi
