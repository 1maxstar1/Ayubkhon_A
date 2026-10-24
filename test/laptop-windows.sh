#!/bin/sh
# server/laptop.ps1 — the Windows launcher — run under PowerShell against the
# Linux PocketBase binary, so what can be checked off Windows is checked:
# first start from nothing, sign-in by the code the page gets back, the server
# outliving the script that started it, status, backup, stop.
#
# What it cannot reach is the Windows-only part: the hidden window, the
# shortcut in the Startup folder. Those are a dozen lines; everything they
# call is exercised here.
#
#   sh test/laptop-windows.sh          (needs pwsh on PATH, or PWSH=/path/to/pwsh)
cd "$(dirname "$0")/.."
PWSH="${PWSH:-$(command -v pwsh)}"
[ -n "$PWSH" ] && [ -x "$PWSH" ] || { echo "pwsh topilmadi"; exit 2; }
[ -x server/pocketbase ] || sh test/pb-smoke.sh >/dev/null 2>&1
T=$(mktemp -d)
PORT=8142
URL="http://127.0.0.1:$PORT"
export TAQ_HOME="$T/home" TAQ_BACKUPS="$T/backups" TAQ_PB="$(pwd)/server/pocketbase" TAQ_PORT=$PORT PB_ADMIN_EMAIL=ekspert@example.com
ps1() { "$PWSH" -NoProfile -File server/laptop.ps1 "$@"; }
cleanup() { ps1 stop >/dev/null 2>&1; rm -rf "$T"; }
trap cleanup EXIT
FAIL=0
ok() { echo "ok   $1"; }
no() { echo "FAIL $1"; FAIL=$((FAIL + 1)); }
is() { if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (got: $1)"; fi; }
health() { curl -s -o /dev/null -w '%{http_code}' -m 2 "$URL/api/health"; }

echo '-- first start, from nothing --'
OUT=$(ps1 start 2>&1)
is "$(health)" 200 'the server answers after the script has ended'
echo "$OUT" | grep -q "Dastur:  *$URL/" && ok 'and says where it is' || no 'and says where it is'
[ -f "$TAQ_HOME/settings.env" ] && ok 'the settings are kept beside the data' || no 'settings.env written'
grep -q '^PB_ADMIN_EMAIL=ekspert@example.com$' "$TAQ_HOME/settings.env" && ok 'with the address it was given' || no 'email in settings.env'
PASS=$(sed -n 's/^PB_ADMIN_PASS=//p' "$TAQ_HOME/settings.env")
[ ${#PASS} -ge 20 ] && ok "and a generated password (${#PASS} characters)" || no "password length ${#PASS}"
is "$(ls "$TAQ_BACKUPS"/*.zip 2>/dev/null | wc -l | tr -d ' ')" 1 'a first backup is taken, outside the data folder'

echo '-- no sign-in at all --'
SIGNIN=$(curl -sS -X POST "$URL/api/laptop/signin")
echo "$SIGNIN" | grep -q '"token":"' && ok 'the page is handed a session without asking for anything' || no "laptop/signin: $SIGNIN"
echo "$SIGNIN" | grep -q '"email":"ekspert@example.com"' && ok "the one person's own" || no 'signin email'
echo "$SIGNIN" | grep -q '"role":"admin"' && ok 'who is an administrator' || no 'signin role'
is "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://evil.example' "$URL/api/laptop/signin")" 404 \
  'another site open in the browser gets nothing'

echo '-- signing in by code, the way the page does with the login back on --'
OTP=$(curl -sS -X POST "$URL/api/collections/users/request-otp" -H 'content-type: application/json' -d '{"email":"ekspert@example.com"}' | sed -n 's/.*"otpId":"\([^"]*\)".*/\1/p')
[ -n "$OTP" ] && ok 'the one person can ask for a code' || no 'request-otp'
sleep 1
CODE=$(curl -sS "$URL/api/laptop/otp?id=$OTP" | sed -n 's/.*"code":"\([^"]*\)".*/\1/p')
[ -n "$CODE" ] && ok "the code comes back to this machine ($CODE)" || no 'laptop/otp'
is "$(health)" 200 'and the server is still there after printing it'
TOKEN=$(curl -sS -X POST "$URL/api/collections/users/auth-with-otp" -H 'content-type: application/json' \
  -d "{\"otpId\":\"$OTP\",\"password\":\"$CODE\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && ok 'that code signs them in' || no 'auth-with-otp'
ROLE=$(curl -sS "$URL/api/collections/users/auth-refresh" -X POST -H "Authorization: $TOKEN" | sed -n 's/.*"role":"\([^"]*\)".*/\1/p')
is "$ROLE" admin 'as an administrator, who can load the registry'
is "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" 200 'the program page is served'
is "$(curl -s -o /dev/null -w '%{http_code}' "$URL/admin.html")" 200 'and so is the admin page'

echo '-- the other commands --'
ps1 start | grep -q 'Allaqachon ishlayapti' && ok 'a second start finds it running' || no 'second start'
ps1 status | grep -q "Ishlayapti: $URL/" && ok 'status says it is running' || no 'status running'
ps1 backup >/dev/null && is "$(ls "$TAQ_BACKUPS"/*.zip | wc -l | tr -d ' ')" 2 'backup makes another copy'
ps1 stop >/dev/null
is "$(health)" 000 'stop stops it'
ps1 status | grep -q '^Ishlamayapti' && ok 'and status says so' || no 'status stopped'
ps1 start >/dev/null
is "$(ls "$TAQ_BACKUPS"/*.zip | wc -l | tr -d ' ')" 2 'a start the same day takes no further backup'
TOKEN2=$(curl -sS -X POST "$URL/api/collections/users/auth-with-otp" -H 'content-type: application/json' \
  -d "{\"otpId\":\"$OTP\",\"password\":\"$CODE\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -z "$TOKEN2" ] && ok 'a code that was used once does not work twice' || no 'code reuse'
ps1 nonsense >/dev/null 2>&1 && no 'an unknown command must fail' || ok 'an unknown command is refused'

echo '-- the one-paste installer --'
# What `irm …/install-windows.ps1 | iex` does, from a ZIP shaped the way GitHub
# shapes it: everything inside one folder named after the branch.
git archive --format=zip --prefix=Ayubkhon_A-claude-excel-price-validation-5ehbvb/ -o "$T/repo.zip" HEAD
OUT=$(TAQ_DIR="$T/Smeta" TAQ_ZIP="$T/repo.zip" TAQ_NOSTART=1 "$PWSH" -NoProfile -Command \
  'Get-Content -Raw ./server/install-windows.ps1 | Invoke-Expression; "still here"' 2>&1)
[ -f "$T/Smeta/server/laptop.cmd" ] && ok 'it unpacks into the folder itself, not a folder inside it' || no "layout: $(ls "$T/Smeta" | head -3)"
echo "$OUT" | grep -q 'still here' && ok 'and leaves the PowerShell window it was pasted into open' || no "iex: $OUT"
head -c 3 "$T/Smeta/server/laptop.ps1" | od -An -tx1 | grep -q 'ef bb bf' && ok 'laptop.ps1 keeps its byte-order mark' || no 'BOM lost'
grep -q "$(printf '\r')" "$T/Smeta/server/laptop.cmd" && ok 'and laptop.cmd its Windows line endings' || no 'CRLF lost'
LC_ALL=C grep -q "$(printf '[\200-\377]')" server/install-windows.ps1 && no 'the installer must stay plain ASCII' || ok 'the installer is plain ASCII, as iex needs it'

echo
if [ "$FAIL" = 0 ]; then echo "laptop-windows OK"; else echo "FAILED ($FAIL)"; fi
[ "$FAIL" = 0 ]
