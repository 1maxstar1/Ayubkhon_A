#!/bin/sh
# Runs the server on this computer for the whole office (local network).
# No VPS, no monthly fee: colleagues open http://<this machine's IP>:8090
#
#   sh server/lan.sh              real e-mail codes (SMTP must be configured)
#   PB_DEV=1 sh server/lan.sh     codes printed here instead (testing alone)
set -e
cd "$(dirname "$0")/.."
command -v node >/dev/null 2>&1 || { echo "node topilmadi — https://nodejs.org dan o'rnating"; exit 1; }
export PB_ADMIN_EMAIL="${PB_ADMIN_EMAIL:-admin@example.com}" PB_ADMIN_PASS="${PB_ADMIN_PASS:-adminpass1234}"
PORT="${PB_PORT:-8090}"

# This machine's address on the office network.
LAN=$(
  { ipconfig getifaddr en0 || ipconfig getifaddr en1; } 2>/dev/null ||
  { hostname -I 2>/dev/null | awk '{print $1}'; } ||
  { ip -4 addr show scope global 2>/dev/null | awk '/inet /{sub(/\/.*/,"",$2);print $2;exit}'; }
)
[ -n "$LAN" ] || LAN=$(ifconfig 2>/dev/null | awk '/inet .*broadcast/{print $2;exit}')
[ -n "$LAN" ] || LAN="<kompyuter-IP>"

if [ -f server/pb_data/serve.pid ] && kill -0 "$(cat server/pb_data/serve.pid)" 2>/dev/null; then
  kill "$(cat server/pb_data/serve.pid)"; sleep 1
fi
sh server/setup.sh
node build.mjs --serve
( cd server; mkdir -p pb_data; PB_DEV="${PB_DEV:-0}" PB_HTTP="0.0.0.0:$PORT" sh run.sh >pb_data/serve.log 2>&1 & echo $! > pb_data/serve.pid )
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sS -m 2 -o /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null && break || sleep 1; done
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)$1))"; }
SU=$(curl -sS -X POST "http://127.0.0.1:$PORT/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
  -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | json '.token')
curl -sS -o /dev/null -X POST "http://127.0.0.1:$PORT/api/collections/users/records" -H "Authorization: $SU" -H 'content-type: application/json' \
  -d "{\"email\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\",\"passwordConfirm\":\"$PB_ADMIN_PASS\",\"name\":\"Administrator\",\"role\":\"admin\",\"active\":true,\"emailVisibility\":true}" || true

echo
echo "─────────────────────────────────────────────────────────────"
echo "  Xodimlar shu manzilni ochadi:   http://$LAN:$PORT/"
echo "  Administrator sahifasi:         http://$LAN:$PORT/admin.html"
echo "  Baza paneli (faqat shu kompyuterda): http://127.0.0.1:$PORT/_/"
echo "─────────────────────────────────────────────────────────────"
if [ "${PB_DEV:-0}" = 1 ]; then
  echo "  DEV rejimi: kodlar shu oynada chiqadi, pochtaga ketmaydi."
else
  echo "  Kirish kodlari pochtaga yuboriladi. Agar kelmasa, baza panelida"
  echo "  Settings -> Mail bo'limida SMTP sozlanganini tekshiring."
fi
echo "  Kompyuter uxlab qolmasin — aks holda dastur hamma uchun to'xtaydi."
echo "  To'xtatish: Ctrl+C"
echo
stop() { kill "$(cat server/pb_data/serve.pid)" 2>/dev/null; echo; echo "server to'xtatildi"; exit 0; }
trap stop INT TERM
F=server/pb_data/dev-otp.txt
LAST=""
while kill -0 "$(cat server/pb_data/serve.pid)" 2>/dev/null; do
  if [ "${PB_DEV:-0}" = 1 ] && [ -f "$F" ]; then
    CUR=$(tail -1 "$F")
    if [ "$CUR" != "$LAST" ]; then
      LAST="$CUR"
      echo "  KIRISH KODI  $(echo "$CUR" | sed 's/.*OTP \([^ ]*\) .*code=\([0-9]*\).*/\2   (\1)/')"
    fi
  fi
  sleep 1
done
