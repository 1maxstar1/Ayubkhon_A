#!/bin/sh
# One-time setup: binary, superuser, collections. Re-running is safe (upsert / merge).
#   PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASS=... ./setup.sh
set -e
cd "$(dirname "$0")"
: "${PB_ADMIN_EMAIL:?set PB_ADMIN_EMAIL}"
: "${PB_ADMIN_PASS:?set PB_ADMIN_PASS (10+ chars)}"
PORT="${PB_SETUP_PORT:-8091}"
[ -x ./pocketbase ] || ./get-pocketbase.sh
./pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASS" --dir "${PB_DATA_DIR:-pb_data}"
./pocketbase serve --http "127.0.0.1:$PORT" --dir "${PB_DATA_DIR:-pb_data}" --hooksDir pb_hooks >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -sS -m 2 -o /dev/null "http://127.0.0.1:$PORT/api/health" && break || sleep 1
done
TOKEN=$(curl -sS -X POST "http://127.0.0.1:$PORT/api/collections/_superusers/auth-with-password" \
  -H 'content-type: application/json' \
  -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "superuser auth failed"; exit 1; }
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "http://127.0.0.1:$PORT/api/collections/import" \
  -H "Authorization: $TOKEN" -H 'content-type: application/json' --data-binary @pb_schema.json)
[ "$CODE" = 204 ] || { echo "schema import failed: HTTP $CODE"; exit 1; }
echo "collections imported"
