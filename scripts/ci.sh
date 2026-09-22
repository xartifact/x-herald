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

echo "==> agent-extensions tests"
cd "$PROJECT_ROOT/packages/agent-extensions"
bun test --reporter=dots

echo "==> backend tests"
cd "$PROJECT_ROOT/apps/gateway"
bun test --reporter=dots
