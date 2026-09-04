#!/bin/sh
# Admin maintenance endpoints (pb_hooks/admin.pb.js): facets, workspace clear,
# workspace delete, application delete, and that an ekspert gets 403.
# Expects test/pb-smoke.sh to have run (pb_data_test with superuser + test user).
set -e
cd "$(dirname "$0")/.."
PORT=8098; BASE="http://127.0.0.1:$PORT"
node test/registry.cjs --json server/pb_data_test/rows.json >/dev/null
PB_DATA_DIR=pb_data_test PB_HTTP="127.0.0.1:$PORT" PB_DEV=1 sh server/run.sh >server/pb_data_test/admin-api.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sS -m 2 -o /dev/null "$BASE/api/health" 2>/dev/null && break || sleep 1; done
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)$1))"; }
H='content-type: application/json'
SU=$(curl -sS -X POST "$BASE/api/collections/_superusers/auth-with-password" -H "$H" \
  -d '{"identity":"admin@example.com","password":"adminpass1234"}' | json '.token')
node -e "const f=require('fs');f.writeFileSync('server/pb_data_test/body.json',JSON.stringify({rows:JSON.parse(f.readFileSync('server/pb_data_test/rows.json','utf8'))}))"
curl -sS -o /dev/null -X POST "$BASE/api/registry/import" -H "Authorization: $SU" -H "$H" --data-binary @server/pb_data_test/body.json
# ekspert token
OTPID=$(curl -sS -X POST "$BASE/api/collections/users/request-otp" -H "$H" -d '{"email":"test@example.com"}' | json '.otpId')
sleep 1
CODE=$(sed -n 's/.*code=\([0-9]*\).*/\1/p' server/pb_data_test/dev-otp.txt | tail -1)
TOK=$(curl -sS -X POST "$BASE/api/collections/users/auth-with-otp" -H "$H" -d "{\"otpId\":\"$OTPID\",\"password\":\"$CODE\"}" | json '.token')

# facets: distinct expertise types with counts
F=$(curl -sS "$BASE/api/registry/facets" -H "Authorization: $TOK")
NT=$(echo "$F" | json '.expertise_type.length')
[ "$NT" -ge 2 ] || { echo "FAIL: facets expertise_type $NT"; exit 1; }
echo "facets: $NT expertise types, $(echo "$F" | json '.buyer_type.length') buyer types, $(echo "$F" | json '.status.length') statuses"
A=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/registry/facets")
[ "$A" = 401 ] || [ "$A" = 403 ] || { echo "FAIL: anonymous facets -> $A"; exit 1; }

# a workspace with a correction and an export, made by the ekspert
APP=$(curl -sS "$BASE/api/collections/applications/records?perPage=1&filter=number='67159'" -H "Authorization: $TOK" | json '.items[0].id')
ME=$(curl -sS -X POST "$BASE/api/collections/users/auth-refresh" -H "Authorization: $TOK" | json '.record.id')
WS=$(curl -sS -X POST "$BASE/api/collections/workspaces/records" -H "Authorization: $TOK" -H "$H" \
  -d "{\"application\":\"$APP\",\"region\":\"fargona\",\"status\":\"done\",\"changed\":1,\"opened_by\":\"$ME\",\"updated_by\":\"$ME\",\"state\":{\"prices\":{\"x\":1}}}" | json '.id')
curl -sS -o /dev/null -X POST "$BASE/api/collections/corrections/records" -H "Authorization: $TOK" -H "$H" \
  -d "{\"workspace\":\"$WS\",\"application\":\"$APP\",\"region\":\"fargona\",\"res_key\":\"k1\",\"name\":\"Bolt\",\"smeta_price\":10,\"market_price\":12,\"by\":\"$ME\"}"
curl -sS -o /dev/null -X POST "$BASE/api/collections/exports/records" -H "Authorization: $TOK" -F "workspace=$WS" -F "application=$APP" -F "by=$ME" -F "file=@test/fixtures/registry-sample.xls;filename=x.xlsx"
cnt() { curl -sS "$BASE/api/collections/$1/records?perPage=1&filter=$2" -H "Authorization: $SU" | json '.totalItems'; }
[ "$(cnt corrections "workspace='$WS'")" = 1 ] && [ "$(cnt exports "workspace='$WS'")" = 1 ] || { echo "FAIL: seed"; exit 1; }

# ekspert may not clear / delete
C=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/workspaces/$WS/clear" -H "Authorization: $TOK")
D=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/workspaces/$WS" -H "Authorization: $TOK")
[ "$C" = 403 ] && [ "$D" = 403 ] || { echo "FAIL: ekspert clear=$C delete=$D"; exit 1; }
echo "ekspert clear/delete -> 403"

# clear keeps the workspace and region, drops everything else
R=$(curl -sS -X POST "$BASE/api/admin/workspaces/$WS/clear" -H "Authorization: $SU")
echo "clear: $R"
W=$(curl -sS "$BASE/api/collections/workspaces/records/$WS" -H "Authorization: $SU")
[ "$(echo "$W" | json '.status')" = in_progress ] || { echo "FAIL: status after clear"; exit 1; }
[ "$(echo "$W" | json '.region')" = fargona ] || { echo "FAIL: region lost"; exit 1; }
[ "$(echo "$W" | json '.changed')" = 0 ] || { echo "FAIL: changed after clear"; exit 1; }
[ "$(echo "$W" | json '.files.length')" = 0 ] || { echo "FAIL: files after clear"; exit 1; }
[ "$(cnt corrections "workspace='$WS'")" = 0 ] && [ "$(cnt exports "workspace='$WS'")" = 0 ] || { echo "FAIL: children after clear"; exit 1; }
echo "clear OK: in_progress, region kept, no files/corrections/exports"

# delete removes the workspace, keeps the application
curl -sS -o /dev/null -X POST "$BASE/api/collections/corrections/records" -H "Authorization: $TOK" -H "$H" \
  -d "{\"workspace\":\"$WS\",\"application\":\"$APP\",\"res_key\":\"k2\",\"smeta_price\":1,\"market_price\":2}"
curl -sS -o /dev/null -X DELETE "$BASE/api/admin/workspaces/$WS" -H "Authorization: $SU"
[ "$(cnt workspaces "id='$WS'")" = 0 ] || { echo "FAIL: workspace still there"; exit 1; }
[ "$(cnt corrections "application='$APP'")" = 0 ] || { echo "FAIL: corrections survive workspace delete"; exit 1; }
[ "$(cnt applications "id='$APP'")" = 1 ] || { echo "FAIL: application deleted with workspace"; exit 1; }
echo "workspace delete OK: application kept"

# manual application through the import hook, then delete it with its workspace
curl -sS -o /dev/null -X POST "$BASE/api/registry/import" -H "Authorization: $SU" -H "$H" \
  -d '{"rows":[{"number":"900001","org_name":"Qolda MChJ","inn":"123456789","project_title":"Test"}]}'
APP2=$(curl -sS "$BASE/api/collections/applications/records?perPage=1&filter=number='900001'" -H "Authorization: $SU" | json '.items[0].id')
[ -n "$APP2" ] && [ "$APP2" != undefined ] || { echo "FAIL: manual application not created"; exit 1; }
WS2=$(curl -sS -X POST "$BASE/api/collections/workspaces/records" -H "Authorization: $TOK" -H "$H" -d "{\"application\":\"$APP2\",\"region\":\"andijon\",\"status\":\"in_progress\"}" | json '.id')
E=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/applications/$APP2" -H "Authorization: $TOK")
[ "$E" = 403 ] || { echo "FAIL: ekspert could delete application ($E)"; exit 1; }
R=$(curl -sS -X DELETE "$BASE/api/admin/applications/$APP2" -H "Authorization: $SU")
echo "application delete: $R"
[ "$(cnt applications "id='$APP2'")" = 0 ] && [ "$(cnt workspaces "id='$WS2'")" = 0 ] || { echo "FAIL: application/workspace survive"; exit 1; }
echo "admin-api OK"
