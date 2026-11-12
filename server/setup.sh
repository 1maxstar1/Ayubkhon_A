#!/bin/sh
# One-time setup: binary, superuser, collections. Re-running is safe (upsert / merge).
#   PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASS=... ./setup.sh
set -e
cd "$(dirname "$0")"
: "${PB_ADMIN_EMAIL:?set PB_ADMIN_EMAIL}"
: "${PB_ADMIN_PASS:?set PB_ADMIN_PASS (10+ chars)}"
PORT="${PB_SETUP_PORT:-8091}"
. ./pb.sh
"$PB" superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASS" --dir "${PB_DATA_DIR:-pb_data}"
"$PB" serve --http "127.0.0.1:$PORT" --dir "${PB_DATA_DIR:-pb_data}" --hooksDir pb_hooks >/dev/null 2>&1 &
PID=$!
# The trap's own status is what the script exits with, so a `kill` that finds
# the temporary server already gone used to make a successful setup report
# failure — and install.sh, under `set -e`, stopped right after printing
# «collections imported», with nothing saying what went wrong.
# It is also waited for: whatever starts next on the same data directory — the program itself, a test server —
# must not find this one still closing its database. Not for ever: a server that does not end in five seconds is
# made to (the watchdog, silenced so that a caller reading this script's output is not kept waiting for it). Each
# step carries its own «|| true»: under set -e a kill that finds the server gone, or a wait that returns its exit
# status, would otherwise end the trap with that status — and a «; true» at the end is never reached.
trap 'kill $PID 2>/dev/null || true; ( sleep 5; kill -9 $PID 2>/dev/null ) >/dev/null 2>&1 & W=$!; wait $PID 2>/dev/null || true; kill $W 2>/dev/null || true' EXIT
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
