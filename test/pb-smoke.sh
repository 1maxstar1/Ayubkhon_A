#!/bin/sh
# Server smoke test: fresh data dir -> setup -> serve -> OTP sign-in -> API read.
set -e
cd "$(dirname "$0")/../server"
export PB_DATA_DIR=pb_data_test PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASS=adminpass1234
PORT=8092; BASE="http://127.0.0.1:$PORT"
rm -rf pb_data_test
PB_SETUP_PORT=8093 ./setup.sh
PB_DEV=1 PB_HTTP="127.0.0.1:$PORT" ./run.sh >pb_data_test/serve.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sS -m 2 -o /dev/null "$BASE/api/health" && break || sleep 1; done
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)$1))"; }
SU=$(curl -sS -X POST "$BASE/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
  -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | json '.token')
curl -sS -o /dev/null -X POST "$BASE/api/collections/users/records" -H "Authorization: $SU" -H 'content-type: application/json' \
  -d '{"email":"test@example.com","password":"Xx12345678901","passwordConfirm":"Xx12345678901","name":"Test Ekspert","role":"ekspert","active":true,"emailVisibility":true}'
# OTP: no SMTP in dev — the code lands in dev-otp.txt via the hook
OTPID=$(curl -sS -X POST "$BASE/api/collections/users/request-otp" -H 'content-type: application/json' \
  -d '{"email":"test@example.com"}' | json '.otpId')
sleep 1
CODE=$(sed -n 's/.*code=\([0-9]*\).*/\1/p' pb_data_test/dev-otp.txt | tail -1)
[ -n "$CODE" ] || { echo "FAIL: no OTP code in dev-otp.txt"; exit 1; }
TOK=$(curl -sS -X POST "$BASE/api/collections/users/auth-with-otp" -H 'content-type: application/json' \
  -d "{\"otpId\":\"$OTPID\",\"password\":\"$CODE\"}" | json '.token')
# token lifetime must be 4 hours
node -e "
const c = JSON.parse(Buffer.from(process.argv[1].split('.')[1], 'base64url').toString());
const life = c.exp - (c.iat != null ? c.iat : c.exp - 14400);
if (life < 14300 || life > 14400) { console.log('FAIL: token lifetime', life); process.exit(1); }
console.log('token lifetime s', life);
" "$TOK"
# rules: superuser seeds one application; the user sees it, anonymous sees none
curl -sS -o /dev/null -X POST "$BASE/api/collections/applications/records" -H "Authorization: $SU" -H 'content-type: application/json' -d '{"number":"1","org_name":"Probe"}'
N=$(curl -sS "$BASE/api/collections/applications/records?perPage=1" -H "Authorization: $TOK" | json '.totalItems')
A=$(curl -sS "$BASE/api/collections/applications/records?perPage=1" | json '.totalItems')
[ "$N" = 1 ] || { echo "FAIL: user sees $N applications, expected 1"; exit 1; }
[ "$A" = 0 ] || { echo "FAIL: anonymous sees $A applications, expected 0"; exit 1; }
C1=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/collections/applications/records" -H "Authorization: $TOK" -H 'content-type: application/json' -d '{"number":"2"}')
[ "$C1" = 400 ] || [ "$C1" = 403 ] || { echo "FAIL: user could create application ($C1)"; exit 1; }
echo "user sees $N application(s), anonymous $A, user create -> $C1"
echo "pb-smoke OK"
