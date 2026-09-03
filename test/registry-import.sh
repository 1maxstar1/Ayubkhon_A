#!/bin/sh
# Registry import through the hook: fixture twice -> 400 added, then 400 updated.
# Expects test/pb-smoke.sh to have run (pb_data_test with superuser).
set -e
cd "$(dirname "$0")/.."
PORT=8094; BASE="http://127.0.0.1:$PORT"
node test/registry.cjs --json server/pb_data_test/rows.json >/dev/null
PB_DATA_DIR=pb_data_test PB_HTTP="127.0.0.1:$PORT" PB_DEV=1 sh server/run.sh >server/pb_data_test/import.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sS -m 2 -o /dev/null "$BASE/api/health" 2>/dev/null && break || sleep 1; done
json() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
SU=$(curl -sS -X POST "$BASE/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
  -d '{"identity":"admin@example.com","password":"adminpass1234"}' | json '["token"]')
python3 - <<'PY' > server/pb_data_test/body.json
import json; rows=json.load(open('server/pb_data_test/rows.json')); json.dump({"rows":rows},open('server/pb_data_test/body.json','w'))
PY
R1=$(curl -sS -X POST "$BASE/api/registry/import" -H "Authorization: $SU" -H 'content-type: application/json' --data-binary @server/pb_data_test/body.json)
echo "first:  $R1"
R2=$(curl -sS -X POST "$BASE/api/registry/import" -H "Authorization: $SU" -H 'content-type: application/json' --data-binary @server/pb_data_test/body.json)
echo "second: $R2"
[ "$(echo "$R1" | json '["added"]')" = 400 ] || { echo "FAIL: first import should add 400"; exit 1; }
[ "$(echo "$R2" | json '["updated"]')" = 400 ] || { echo "FAIL: second import should update 400"; exit 1; }
[ "$(echo "$R2" | json '["added"]')" = 0 ] || { echo "FAIL: second import added rows"; exit 1; }
N=$(curl -sS "$BASE/api/collections/applications/records?perPage=1&filter=number='67159'" -H "Authorization: $SU" | json '["items"][0]["org_name"]')
echo "67159 -> $N"
C=$(curl -sS "$BASE/api/collections/contragents/records?perPage=1" -H "Authorization: $SU" | json '["totalItems"]')
U=$(python3 -c "import json;print(len({r['inn'] for r in json.load(open('server/pb_data_test/rows.json')) if r.get('inn')}))")
[ "$C" = "$U" ] || { echo "FAIL: contragents $C, unique inn $U"; exit 1; }
echo "contragents $C = unique INN"
# a plain user may not import
TOK=$(curl -sS -X POST "$BASE/api/collections/users/request-otp" -H 'content-type: application/json' -d '{"email":"test@example.com"}' | json '["otpId"]')
sleep 1; CODE=$(sed -n 's/.*code=\([0-9]*\).*/\1/p' server/pb_data_test/dev-otp.txt | tail -1)
UT=$(curl -sS -X POST "$BASE/api/collections/users/auth-with-otp" -H 'content-type: application/json' -d "{\"otpId\":\"$TOK\",\"password\":\"$CODE\"}" | json '["token"]')
F=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/registry/import" -H "Authorization: $UT" -H 'content-type: application/json' -d '{"rows":[{"number":"1"}]}')
[ "$F" = 403 ] || { echo "FAIL: ekspert could import ($F)"; exit 1; }
echo "ekspert import -> 403"
echo "registry-import OK"
