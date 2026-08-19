#!/usr/bin/env bash
# 安装 x-herald agent extension 到 pi / omp / prime-agent 运行时目录。
#
# 目标布局（与扩展 README 一致）：
#   ~/.pi/agent/extensions/x-herald/      (pi)
#   ~/.omp/agent/extensions/x-herald/     (omp)
#   ~/.prime/agent/extensions/x-herald/   (prime-agent)
#
# 用法：
#   ./scripts/install-extension.sh                # 安装到 pi/omp/prime（存在即装）
#   ./scripts/install-extension.sh --runtime pi   # 只装 pi
#   ./scripts/install-extension.sh --runtime omp  # 只装 omp
#   ./scripts/install-extension.sh --runtime prime # 只装 prime-agent
#   ./scripts/install-extension.sh --symlink      # dev 模式：symlink 源目录（改动即时生效）
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_SRC="$PROJECT_ROOT/packages/agent-extensions"

if [[ ! -f "$EXT_SRC/index.ts" ]]; then
  echo "extension source not found: $EXT_SRC" >&2
  exit 1
fi

RUNTIMES=()
SYMLINK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --runtime)
      case "$2" in
        pi | omp | prime) RUNTIMES+=("$2"); shift 2 ;;
        *) echo "unknown runtime: $2 (expected pi|omp|prime)" >&2; exit 2 ;;
      esac
      ;;
    --symlink) SYMLINK=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[[ ${#RUNTIMES[@]} -eq 0 ]] && RUNTIMES=(pi omp prime)

# js-yaml 运行时依赖由 bun 提升到根 node_modules 的 .bun 虚拟目录
# （bun install 的 workspace 布局），与 .npm/.pnpm 布局都不同，逐个探测。
find_jsyaml() {
  local candidates=(
    "$PROJECT_ROOT/node_modules/.bun/js-yaml@*/node_modules/js-yaml"
    "$PROJECT_ROOT/node_modules/js-yaml"
  )
  for c in "${candidates[@]}"; do
    for p in $c; do
      [[ -f "$p/package.json" ]] && { echo "$p"; return 0; }
    done
  done
  return 1
}

JSYAML="$(find_jsyaml || true)"

for runtime in "${RUNTIMES[@]}"; do
  home_dir="$HOME/.$runtime"
  if [[ ! -d "$home_dir" ]]; then
    echo "skip $runtime (no $home_dir)"
    continue
  fi
  dest="$home_dir/agent/extensions/x-herald"
  mkdir -p "$dest"

  if [[ $SYMLINK -eq 1 ]]; then
    ln -sfn "$EXT_SRC" "$dest"
    echo "symlinked $EXT_SRC -> $dest (dev mode)"
    continue
  fi

  # 清理旧安装残留（早期 pnpm 模式复制过整棵仓库：package.json/lock 等）。
  # 保留 node_modules/js-yaml（若已装），避免重复拷贝。
  if [[ -L "$dest" ]]; then
    rm "$dest" # 先解除旧 symlink，再创建真目录
    mkdir -p "$dest"
  fi
  find "$dest" -maxdepth 1 -mindepth 1 ! -name node_modules -exec rm -rf {} +
  if [[ -d "$dest/node_modules/js-yaml" ]]; then
    echo "keep existing $dest/node_modules/js-yaml"
  fi

  cp -R "$EXT_SRC"/index.ts "$EXT_SRC"/src "$EXT_SRC"/schemas \
    "$EXT_SRC"/README.md "$EXT_SRC"/LICENSE "$dest"/

  # js-yaml 运行时依赖：扩展在 ~/.pi/agent 下独立运行，不经过 monorepo 解析。
  if [[ -n "$JSYAML" && ! -d "$dest/node_modules/js-yaml" ]]; then
    mkdir -p "$dest/node_modules"
    cp -R "$JSYAML" "$dest/node_modules/js-yaml"
    # js-yaml 的 CJS 依赖 argparse
    local_argparse="$(dirname "$JSYAML")/argparse"
    if [[ -d "$local_argparse" ]]; then
      cp -R "$local_argparse" "$dest/node_modules/argparse"
    fi
  fi

  echo "installed x-herald extension -> $dest"
done
