#!/usr/bin/env bash
# Build the x-herald CLI into self-contained binaries.
#
# One binary per platform: the operator skill (skills/*.md + commands.json) is a
# static import, so Bun embeds it — the artifact needs no checkout, no node_modules,
# and no Bun install on the target machine.
#
#   ./scripts/build-cli.sh                 # all targets → dist/cli/
#   ./scripts/build-cli.sh bun-darwin-arm64 # one target (local smoke test)
#   SKIP_CHECKSUM=1 ./scripts/build-cli.sh  # skip SHA256SUMS (unusual)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/cli"

OUT_DIR="${OUT_DIR:-$ROOT/dist/cli}"
mkdir -p "$OUT_DIR"

ALL_TARGETS=(
  bun-darwin-arm64
  bun-darwin-x64
  bun-linux-x64
  bun-linux-arm64
  bun-windows-x64
)

# A target whose compile fails is a hard error: shipping a partial matrix silently
# leaves one platform on an older release.
TARGETS=("$@")
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  TARGETS=("${ALL_TARGETS[@]}")
fi

for target in "${TARGETS[@]}"; do
  # Drop Bun's own "bun-" target prefix from the published name: the asset is
  # x-herald's binary, and `uname` output it is derived from has no such prefix.
  name="${target#bun-}"
  case "$target" in
    bun-windows-*) outfile="$OUT_DIR/x-herald-$name.exe" ;;
    *) outfile="$OUT_DIR/x-herald-$name" ;;
  esac
  echo "==> $target -> $outfile"
  bun build src/index.ts --compile --minify --target="$target" --outfile "$outfile"
done

if [[ "${SKIP_CHECKSUM:-0}" != "1" ]]; then
  ( cd "$OUT_DIR" && shasum -a 256 x-herald-* > SHA256SUMS 2>/dev/null \
    || sha256sum x-herald-* > SHA256SUMS )
  echo "==> $OUT_DIR/SHA256SUMS"
fi
