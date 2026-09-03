#!/bin/sh
# One command for local testing: binary, schema, superuser, first admin user,
# frontend build, sample registry, then the dev server.
#   sh server/dev.sh            -> http://127.0.0.1:8090  (admin: admin@example.com)
# Sign-in codes are not emailed in dev mode: run `sh server/otp.sh` to see the last one.
set -e
cd "$(dirname "$0")/.."
export PB_ADMIN_EMAIL="${PB_ADMIN_EMAIL:-admin@example.com}" PB_ADMIN_PASS="${PB_ADMIN_PASS:-adminpass1234}"
PORT="${PB_HTTP:-127.0.0.1:8090}"
# stop a server left from a previous run
if [ -f server/pb_data/serve.pid ] && kill -0 "$(cat server/pb_data/serve.pid)" 2>/dev/null; then
  kill "$(cat server/pb_data/serve.pid)"; sleep 1
fi
if curl -sS -m 2 -o /dev/null "http://$PORT/api/health" 2>/dev/null; then
  echo "http://$PORT band — boshqa server ishlayapti (pkill pocketbase yoki PB_HTTP=127.0.0.1:8091)"; exit 1
fi
sh server/setup.sh
node build.mjs --serve
( cd server; mkdir -p pb_data; PB_DEV=1 PB_HTTP="$PORT" sh run.sh >pb_data/serve.log 2>&1 & echo $! > pb_data/serve.pid )
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sS -m 2 -o /dev/null "http://$PORT/api/health" 2>/dev/null && break || sleep 1; done
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)$1))"; }
SU=$(curl -sS -X POST "http://$PORT/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
  -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | json '.token')
# first admin user (same email as the superuser) — ignored if it already exists
curl -sS -o /dev/null -X POST "http://$PORT/api/collections/users/records" -H "Authorization: $SU" -H 'content-type: application/json' \
  -d "{\"email\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\",\"passwordConfirm\":\"$PB_ADMIN_PASS\",\"name\":\"Administrator\",\"role\":\"admin\",\"active\":true,\"emailVisibility\":true}" || true
# sample registry so the list is not empty
N=$(curl -sS "http://$PORT/api/collections/applications/records?perPage=1" -H "Authorization: $SU" | json '.totalItems')
if [ "$N" = 0 ]; then
  node test/registry.cjs --json server/pb_data/rows.json >/dev/null
  node -e "const f=require('fs');f.writeFileSync('server/pb_data/body.json',JSON.stringify({rows:JSON.parse(f.readFileSync('server/pb_data/rows.json','utf8'))}))"
  curl -sS -o /dev/null -X POST "http://$PORT/api/registry/import" -H "Authorization: $SU" -H 'content-type: application/json' --data-binary @server/pb_data/body.json
  echo "sample registry imported (400 rows)"
fi
echo
echo "Dastur:   http://$PORT/           kirish: $PB_ADMIN_EMAIL  (kod: sh server/otp.sh)"
echo "Admin:    http://$PORT/admin.html"
echo "PocketBase paneli: http://$PORT/_/   ($PB_ADMIN_EMAIL / $PB_ADMIN_PASS)"
echo "To'xtatish: kill \$(cat server/pb_data/serve.pid)"
