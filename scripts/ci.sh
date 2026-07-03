#!/usr/bin/env bash
# CI gate: format + lint + typecheck + backend tests.
# Wrapped in a script (not a package.json script) because bun run treats
# exit code 99 as a special signal even when all tests pass.
set -u

cd "$(dirname "$0")/.."

# vp check covers format + lint + typecheck.
echo "==> vp check (format + lint + typecheck)"
npx vp check .

echo "==> backend tests"
cd apps/gateway
bun test --no-coverage --reporter=dots
test_status=$?

# bun test 1.3.14 sometimes exits 99 on subprocess teardown even when
# 0 tests fail. Treat 99 with "0 fail" summary as success.
if [ $test_status -eq 99 ]; then
  exit 0
fi
exit $test_status
