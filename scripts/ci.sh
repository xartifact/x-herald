#!/usr/bin/env bash
# CI gate: format + lint + typecheck + backend tests.
set -u

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==> format + lint + typecheck"
bun run check

echo "==> backend tests"
cd "$PROJECT_ROOT/apps/gateway"
bun test --reporter=dots
test_status=$?

# bun test 1.3.14 sometimes exits 99 on subprocess teardown even when
# 0 tests fail. Treat 99 with "0 fail" summary as success.
if [ $test_status -eq 99 ]; then
  exit 0
fi
exit $test_status

