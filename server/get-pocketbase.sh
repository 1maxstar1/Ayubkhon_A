#!/bin/sh
# Downloads the PocketBase binary next to this script. Verified 2026-09-03:
# v0.34.0 linux_amd64 starts and answers /api/health in the dev container.
set -e
V="${PB_VERSION:-0.34.0}"
OS="$(uname -s | tr A-Z a-z)"; ARCH="$(uname -m)"
case "$ARCH" in x86_64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; esac
cd "$(dirname "$0")"
curl -sSL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v$V/pocketbase_${V}_${OS}_${ARCH}.zip"
unzip -oq pb.zip pocketbase && rm pb.zip && chmod +x pocketbase
./pocketbase --version
