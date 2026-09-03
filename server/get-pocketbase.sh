#!/bin/sh
# Downloads the PocketBase binary next to this script (Linux, macOS, Windows/Git Bash).
# Verified 2026-09-03: v0.34.0 linux_amd64 starts and answers /api/health.
set -e
V="${PB_VERSION:-0.34.0}"
OS="$(uname -s | tr A-Z a-z)"; ARCH="$(uname -m)"
case "$ARCH" in x86_64|amd64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; esac
BIN=pocketbase
case "$OS" in mingw*|msys*|cygwin*) OS=windows; BIN=pocketbase.exe;; esac
cd "$(dirname "$0")"
URL="https://github.com/pocketbase/pocketbase/releases/download/v$V/pocketbase_${V}_${OS}_${ARCH}.zip"
echo "downloading $URL"
curl -sSL -o pb.zip "$URL"
if command -v unzip >/dev/null 2>&1; then unzip -oq pb.zip "$BIN"
elif command -v python3 >/dev/null 2>&1; then python3 -c "import zipfile;zipfile.ZipFile('pb.zip').extract('$BIN')"
elif command -v python >/dev/null 2>&1; then python -c "import zipfile;zipfile.ZipFile('pb.zip').extract('$BIN')"
else tar -xf pb.zip "$BIN"; fi
rm pb.zip && chmod +x "$BIN"
"./$BIN" --version
