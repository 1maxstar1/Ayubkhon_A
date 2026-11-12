#!/bin/sh
# Downloads the PocketBase binary next to this script (Linux, macOS, Windows/Git Bash).
# Verified 2026-09-03: v0.34.0 linux_amd64 starts and answers /api/health.
#
# The archive is checked against its sha256 before anything in it is unpacked (fourth audit, C1): the sums
# below are the ones PocketBase publishes for v0.34.0 (checksums.txt of the release), and three of them were
# compared with the archives themselves when they were written here. A different version needs its sum given
# as PB_SHA256 — a version with no sum known is refused, never taken unchecked.
set -e
V="${PB_VERSION:-0.34.0}"
OS="$(uname -s | tr A-Z a-z)"; ARCH="$(uname -m)"
case "$ARCH" in x86_64|amd64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; armv7*) ARCH=armv7;; esac
BIN=pocketbase
case "$OS" in mingw*|msys*|cygwin*) OS=windows; BIN=pocketbase.exe;; esac
cd "$(dirname "$0")"
NAME="pocketbase_${V}_${OS}_${ARCH}.zip"

# The published sum of an archive, or nothing.
known_sum() {
  case "$1" in
    pocketbase_0.34.0_darwin_amd64.zip)  echo 4328404fb200b60e8e0e2ac51ae0f0187e689bc0979b37369f6070e89f2f8481 ;;
    pocketbase_0.34.0_darwin_arm64.zip)  echo b19c2994a6d58c55ba0232293200de7b501aaa7d66da73cf10a86ffbc9ca9483 ;;
    pocketbase_0.34.0_linux_amd64.zip)   echo dea29ca40669fb7f31bb47761a8c3494c3f06b42f99d60831bbbcf4bdef5f69d ;;
    pocketbase_0.34.0_linux_arm64.zip)   echo 631f698900d83ff4b0735a146d33b4e59c99de923f1ae488a90ce58bd6a69f53 ;;
    pocketbase_0.34.0_linux_armv7.zip)   echo 0eb3c6060e70aec402c662dc79fa7a5067135ace75377f9ae23ff59ba4fd7132 ;;
    pocketbase_0.34.0_windows_amd64.zip) echo 76de59741106767ac518e860916ce4fb68740d44207ce2be73cd3f14f884757e ;;
    pocketbase_0.34.0_windows_arm64.zip) echo 7c9073acd1a78da905963ab04f53ac55bb22fec05b5e56efec101c79e1d88dda ;;
  esac
}
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -c1-64
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -c1-64
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | sed 's/.*= *//'
  else echo ""; fi
}

WANT=$(printf '%s' "${PB_SHA256:-$(known_sum "$NAME")}" | tr A-F a-f)
if [ -z "$WANT" ]; then
  echo "no sha256 known for $NAME — give it as PB_SHA256 (from the release's checksums.txt)" >&2; exit 1
fi
printf '%s' "$WANT" | grep -Eq '^[0-9a-f]{64}$' || { echo "PB_SHA256 must be 64 hex characters" >&2; exit 1; }

URL="${PB_DOWNLOAD_BASE:-https://github.com/pocketbase/pocketbase/releases/download}/v$V/$NAME"
echo "downloading $URL"
rm -f pb.zip
curl -fsSL -o pb.zip "$URL"
GOT=$(sha256_of pb.zip)
if [ -z "$GOT" ]; then rm -f pb.zip; echo "no sha256 tool (sha256sum, shasum or openssl) — refusing to unpack an unchecked archive" >&2; exit 1; fi
if [ "$GOT" != "$WANT" ]; then
  rm -f pb.zip
  echo "sha256 mismatch for $NAME: got $GOT, expected $WANT — nothing was unpacked" >&2
  exit 1
fi
if command -v unzip >/dev/null 2>&1; then unzip -oq pb.zip "$BIN"
elif command -v python3 >/dev/null 2>&1; then python3 -c "import zipfile;zipfile.ZipFile('pb.zip').extract('$BIN')"
elif command -v python >/dev/null 2>&1; then python -c "import zipfile;zipfile.ZipFile('pb.zip').extract('$BIN')"
else tar -xf pb.zip "$BIN"; fi
rm pb.zip && chmod +x "$BIN"
"./$BIN" --version
