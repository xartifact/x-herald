#!/bin/sh
# Install the x-herald CLI from a GitHub Release (or an internal mirror).
#
#   curl -fsSL https://raw.githubusercontent.com/xartifact/x-herald/main/scripts/install-cli.sh | sh
#   X_HERALD_CLI_VERSION=0.2.0 sh install-cli.sh
#   X_HERALD_CLI_BASE_URL=https://nexus.example/repository/raw/x-herald-cli/v0.2.0 sh install-cli.sh
#
# No Bun, Node, or repository checkout is required: the release artifact is a
# single self-contained binary with the operator skill embedded.
set -eu

REPO="${X_HERALD_CLI_REPO:-xartifact/x-herald}"
VERSION="${X_HERALD_CLI_VERSION:-latest}"
BIN_DIR="${X_HERALD_CLI_BIN_DIR:-$HOME/.local/bin}"
BASE_URL="${X_HERALD_CLI_BASE_URL:-}"

if [ -z "$BASE_URL" ]; then
  if [ "$VERSION" = "latest" ]; then
    BASE_URL="https://github.com/$REPO/releases/latest/download"
  else
    BASE_URL="https://github.com/$REPO/releases/download/cli-v$VERSION"
  fi
fi
BASE_URL="${BASE_URL%/}"

fail() {
  echo "install-cli: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令: $1"
}

need uname
need curl

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  MINGW* | MSYS* | CYGWIN*) platform="windows" ;;
  *) fail "不支持的系统: ${os}（支持 Darwin / Linux / Windows）" ;;
esac

case "$arch" in
  arm64 | aarch64) cpu="arm64" ;;
  x86_64 | amd64) cpu="x64" ;;
  *) fail "不支持的架构: ${arch}（支持 arm64 / x64）" ;;
esac

target="$platform-$cpu"
asset="x-herald-$target"
case "$platform" in
  windows) asset="$asset.exe" ;;
esac

mkdir -p "$BIN_DIR"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT INT TERM

echo "==> 下载 $BASE_URL/$asset"
curl -fsSL "$BASE_URL/$asset" -o "$tmp_dir/$asset" \
  || fail "下载失败: $BASE_URL/${asset}（内网可用 X_HERALD_CLI_BASE_URL 指向镜像）"

# Checksum is mandatory when the release published one: a silent mismatch means a
# truncated download or a substituted artifact, both of which must abort.
echo "==> 校验 SHA256"
if curl -fsSL "$BASE_URL/SHA256SUMS" -o "$tmp_dir/SHA256SUMS"; then
  if command -v sha256sum >/dev/null 2>&1; then
    expected="$(cd "$tmp_dir" && grep " $asset\$" SHA256SUMS | awk '{print $1}')"
    actual="$(sha256sum "$tmp_dir/$asset" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    expected="$(cd "$tmp_dir" && grep " $asset\$" SHA256SUMS | awk '{print $1}')"
    actual="$(shasum -a 256 "$tmp_dir/$asset" | awk '{print $1}')"
  else
    fail "缺少 sha256sum/shasum，无法校验下载内容"
  fi
  [ -n "$expected" ] || fail "SHA256SUMS 中没有 $asset"
  [ "$expected" = "$actual" ] || fail "SHA256 不匹配: 期望 ${expected}，实际 $actual"
else
  fail "缺少 $BASE_URL/SHA256SUMS，拒绝安装未校验的二进制"
fi

dest="$BIN_DIR/x-herald"
case "$platform" in
  windows) dest="$BIN_DIR/x-herald.exe" ;;
esac
mv "$tmp_dir/$asset" "$dest"
chmod +x "$dest"

echo "==> 已安装 $dest"
"$dest" --version

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo
    echo "注意: $BIN_DIR 不在 PATH 中，加入方式："
    echo "  export PATH=\"$BIN_DIR:\$PATH\"   # ~/.zshrc / ~/.bashrc"
    ;;
esac

echo
echo "下一步："
echo "  x-herald skill install        # 把运维技能写进已安装的 agent"
echo "  x-herald auth login           # 换 JWT（或导出 X_HERALD_URL / X_HERALD_TOKEN）"
