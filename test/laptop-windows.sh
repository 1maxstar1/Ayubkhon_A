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
# No Google Drive until a test makes one; releases come from files the test writes.
export TAQ_DRIVE_ROOTS="$T/gdrive/My Drive" TAQ_RELEASES="$T/rel/releases.txt" TAQ_RELEASE_ZIP="$T/rel/zips"
ps1() { "$PWSH" -NoProfile -File server/laptop.ps1 "$@"; }
cleanup() { ps1 stop >/dev/null 2>&1; [ -n "$SUP" ] && kill "$SUP" 2>/dev/null; rm -rf "$T"; }
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
DOC=$(ps1 doctor 2>&1)
echo "$DOC" | grep -q 'Avtomatik kirish: ISHLAYAPTI' && ok 'doctor: the auto sign-in works' || no "doctor: $DOC"
echo "$DOC" | grep -q "Hisob bazada:    bor, rol admin" && ok 'doctor: the account is there, an administrator' || no 'doctor account'
echo "$DOC" | grep -q "Server tomoni to'g'ri" && ok 'doctor: and says the rest is the browser' || no 'doctor verdict'
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

echo '-- an old server still holding the port --'
# What the first Windows install ran into: a server from an earlier attempt,
# an older version without auto sign-in, answering on the port - and «start»
# took «something answers» for «it is running» and opened the browser on it.
ps1 stop >/dev/null
SU=$(curl -sS -X POST "$URL/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
  -d "{\"identity\":\"ekspert@example.com\",\"password\":\"$PASS\"}" 2>/dev/null | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
mkdir -p "$T/oldpub"
sed 's/>v[0-9.]*</>v2.2.0</' dist/index.html > "$T/oldpub/index.html"
( PB_DEV=1 server/pocketbase serve --http=127.0.0.1:$PORT --dir="$TAQ_HOME/pb_data" --hooksDir=server/pb_hooks \
    --publicDir="$T/oldpub" >/dev/null 2>&1 & )
i=0; while [ $i -lt 20 ] && [ "$(health)" != 200 ]; do sleep 0.5; i=$((i + 1)); done
SU=$(curl -sS -X POST "$URL/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
  -d "{\"identity\":\"ekspert@example.com\",\"password\":\"$PASS\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
UID_=$(curl -sS "$URL/api/collections/users/records?filter=email%3D%27ekspert%40example.com%27" -H "Authorization: $SU" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
curl -sS -o /dev/null -X PATCH "$URL/api/collections/users/records/$UID_" -H "Authorization: $SU" -H 'content-type: application/json' -d '{"role":"ekspert"}'
is "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/laptop/signin")" 404 'the old server asks for an e-mail (no auto sign-in)'
ps1 status | grep -q 'v2.2.0 ishlayapti' && ok 'status says an older version is running' || no "status: $(ps1 status | head -3)"
DOC=$(ps1 doctor 2>&1)
echo "$DOC" | grep -q 'ISHLAMAYAPTI.*ot-laptop' && ok 'doctor names the reason: not started as a laptop' || no "doctor stale: $(echo "$DOC" | grep -i avtomatik)"
echo "$DOC" | grep -q 'Sinovda avtomatik kirish: ISHLAYAPTI' && ok 'runs it once itself, and there it works' || no "doctor trial: $(echo "$DOC" | grep -i sinov)"
echo "$DOC" | grep -q -- '--- server xabarlari ---' && ok "and shows what the server said" || no 'doctor log'
is "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/laptop/signin")" 200 'and leaves the working one running'
# put the old one back, for start to find
ps1 stop >/dev/null
( PB_DEV=1 server/pocketbase serve --http=127.0.0.1:$PORT --dir="$TAQ_HOME/pb_data" --hooksDir=server/pb_hooks \
    --publicDir="$T/oldpub" >/dev/null 2>&1 & )
i=0; while [ $i -lt 20 ] && [ "$(health)" != 200 ]; do sleep 0.5; i=$((i + 1)); done
curl -sS -o /dev/null -X PATCH "$URL/api/collections/users/records/$UID_" -H "Authorization: $SU" -H 'content-type: application/json' -d '{"role":"ekspert"}'
OUT=$(ps1 start 2>&1)
echo "$OUT" | grep -q 'Eski server topildi (v2.2.0)' && ok 'start notices it is not the current one' || no "start: $(echo "$OUT" | head -2)"
SIGNIN=$(curl -sS -X POST "$URL/api/laptop/signin")
echo "$SIGNIN" | grep -q '"token":"' && ok 'and replaces it: no sign-in again' || no "after replace: $SIGNIN"
echo "$SIGNIN" | grep -q '"role":"admin"' && ok 'with the account put back to administrator' || no 'role not restored'
is "$(curl -s -o /dev/null -w '%{http_code}' "$URL/" -D - | grep -ci '^cache-control: no-cache')" 1 'and the page is served so the browser asks for it afresh'
ps1 start | grep -q 'Allaqachon ishlayapti' && ok 'a start after that leaves the current one alone' || no 'restart loop'

echo '-- updates, on a copy of the program --'
# The program as the ZIP installs it - no .git - so it updates itself; the
# repository's own folder is never written to.
ps1 stop >/dev/null
APP="$T/app"; PRISTINE="$T/pristine"
mkdir -p "$APP" "$PRISTINE" "$T/rel/zips"
git ls-files -co --exclude-standard | while IFS= read -r f; do
  [ -f "$f" ] && mkdir -p "$PRISTINE/$(dirname "$f")" && cp "$f" "$PRISTINE/$f"
done
cp -R "$PRISTINE/." "$APP/"
app() { "$PWSH" -NoProfile -File "$APP/server/laptop.ps1" "$@"; }
served() { curl -s -m 3 "$URL/" | sed -n 's/.*class="ver"[^>]*>\(v[0-9.]*\)<.*/\1/p' | head -1; }
ORIG=$(sed -n 's/.*class="ver"[^>]*>\(v[0-9.]*\)<.*/\1/p' "$PRISTINE/dist/index.html" | head -1)
# mkrel <tag> <sha> [newhook|nosignin|badps1]: a release ZIP shaped the way
# GitHub shapes one, everything inside «<repo>-<commit>/».
mkrel() {
  d="$T/rel/src/Ayubkhon_A-$2"; rm -rf "$T/rel/src"; mkdir -p "$d"
  cp -R "$PRISTINE/." "$d/"
  sed -i "s/\(class=\"ver\"[^>]*>\)v[0-9.]*</\1$1</" "$d/dist/index.html"
  case "$3" in
    newhook) echo '// only in this release' > "$d/server/pb_hooks/zz_new.pb.js" ;;
    nosignin) echo 'throw new Error("this release cannot sign in")' > "$d/server/pb_hooks/laptop.pb.js" ;;
    badps1) printf '\r\nfunction Broken {{{\r\n' >> "$d/server/laptop.ps1" ;;
  esac
  (cd "$T/rel/src" && zip -qr "$T/rel/zips/$2.zip" .)
}
SHA1=1111111111111111111111111111111111111111; SHA2=2222222222222222222222222222222222222222
SHA3=3333333333333333333333333333333333333333; SHA4=4444444444444444444444444444444444444444
SHA5=5555555555555555555555555555555555555555
app start >/dev/null
is "$(served)" "$ORIG" "the copy runs its own version ($ORIG)"
printf '# releases\n\n' > "$T/rel/releases.txt"
app update | grep -q "Eng yangi versiya o'rnatilgan" && ok 'update with nothing newer leaves it alone' || no 'update when current'
mkrel v9.0.0 $SHA1 newhook
printf 'v9.0.0 %s first\n' $SHA1 >> "$T/rel/releases.txt"
NB=$(ls "$TAQ_BACKUPS"/*.zip | wc -l | tr -d ' ')
OUT=$(app update 2>&1)
echo "$OUT" | grep -q 'Yangilandi: v9.0.0' && ok 'update installs the newer release' || no "update: $OUT"
is "$(served)" v9.0.0 'and that is what now answers'
[ -f "$APP/server/pb_hooks/zz_new.pb.js" ] && ok "with the release's own files" || no 'new hook missing'
[ -d "$APP/server/server" ] || [ -d "$APP/dist/dist" ] && no 'copied into a folder inside itself' || ok 'merged into the folder, not nested inside it'
is "$(ls "$TAQ_BACKUPS"/*.zip | wc -l | tr -d ' ')" $((NB + 1)) 'a backup is taken before it'
is "$(sed -n 's/.*class="ver"[^>]*>\(v[0-9.]*\)<.*/\1/p' "$TAQ_HOME/previous/dist/index.html" | head -1)" "$ORIG" 'the old version is kept beside the data'
curl -sS -X POST "$URL/api/laptop/signin" | grep -q '"token":"' && ok 'and the new one signs in by itself' || no 'signin after update'
app status | grep -q "oldingi versiya saqlangan: $ORIG" && ok 'status says what rollback would bring back' || no "status: $(app status)"

OUT=$(app rollback 2>&1)
echo "$OUT" | grep -q "Qaytarildi: v9.0.0 -> $ORIG" && ok 'rollback brings the old version back' || no "rollback: $OUT"
is "$(served)" "$ORIG" 'and it is the old one that answers'
[ -f "$APP/server/pb_hooks/zz_new.pb.js" ] && no "a hook of the rolled-back release still there" || ok 'without the hooks only the newer release had'
grep -q '^FAILED=.*v9.0.0' "$TAQ_HOME/update.env" && ok 'the release rolled back from is not taken again by itself' || no "update.env: $(cat "$TAQ_HOME/update.env")"
app rollback 2>&1 | grep -q 'Oldingi versiya saqlanmagan' && ok 'a second rollback has nothing to go back to' || no 'second rollback'

echo '-- backups in Google Drive --'
grep -q '^BACKUP_COPY=' "$TAQ_HOME/settings.env" && no 'no Drive, yet a Drive copy set' || ok 'no Drive folder: nothing is set'
app drive 2>&1 | grep -q 'Google Drive papkasi topilmadi' && ok 'drive says how to get Google Drive when there is none' || no 'drive without Drive'
mkdir -p "$T/gdrive/My Drive"
app stop >/dev/null; OUT=$(app start 2>&1)
echo "$OUT" | grep -q "Zaxiralar Google Drive'ga ham qo'yiladi" && ok 'the Drive folder is found by itself at start' || no "start with Drive: $(echo "$OUT" | head -3)"
grep -q "^BACKUP_COPY=$T/gdrive/My Drive/Smeta zaxira$" "$TAQ_HOME/settings.env" && ok 'and remembered' || no "settings: $(cat "$TAQ_HOME/settings.env")"
grep -q '^PB_ADMIN_EMAIL=ekspert@example.com$' "$TAQ_HOME/settings.env" && grep -q '^PB_ADMIN_PASS=' "$TAQ_HOME/settings.env" \
  && ok 'next to the account it already held' || no 'settings lost the account'
app backup >/dev/null
is "$(ls "$T/gdrive/My Drive/Smeta zaxira/"*.zip 2>/dev/null | wc -l | tr -d ' ')" 1 'a backup is also copied into Drive'
is "$(cmp -s "$(ls -t "$TAQ_BACKUPS"/*.zip | head -1)" "$(ls -t "$T/gdrive/My Drive/Smeta zaxira/"*.zip | head -1)" && echo same)" same 'the same file as on the disk'
app status | grep -q "Google Drive'da: 1 ta" && ok 'status counts the Drive copies' || no "status drive: $(app status | grep -i drive)"
app drive off | grep -q "to'xtatildi" && ok 'drive off stops it' || no 'drive off'
app backup >/dev/null
is "$(ls "$T/gdrive/My Drive/Smeta zaxira/"*.zip | wc -l | tr -d ' ')" 1 'and later backups stay on this disk'
app stop >/dev/null; app start >/dev/null
grep -q '^BACKUP_COPY=' "$TAQ_HOME/settings.env" && no 'turned off by hand, yet on again' || ok 'turned off by hand, it stays off'
app drive | grep -q "Google Drive'ga ham qo'yiladi" && ok 'drive turns it back on' || no 'drive on again'

echo '-- updates by themselves, under the supervisor --'
app stop >/dev/null
mkrel v9.1.0 $SHA2
printf 'v9.1.0 %s second\n' $SHA2 >> "$T/rel/releases.txt"
TAQ_TICK=2 TAQ_UPDATE_EVERY=3 TAQ_UPDATE_RETRY=3 TAQ_UPDATE_ANYTIME=1 \
  "$PWSH" -NoProfile -File "$APP/server/laptop.ps1" serve >/dev/null 2>&1 &
SUP=$!
i=0; while [ $i -lt 120 ] && [ "$(served)" != v9.1.0 ]; do sleep 1; i=$((i + 1)); done
is "$(served)" v9.1.0 'the supervisor installs the newest release by itself'
i=0; while [ $i -lt 40 ] && ! grep -q "update $ORIG -> v9.1.0: ok" "$TAQ_HOME/supervisor.log"; do sleep 1; i=$((i + 1)); done
grep -q "update $ORIG -> v9.1.0: ok" "$TAQ_HOME/supervisor.log" && ok 'straight from the old version, skipping the one rolled back from' || no "log: $(tail -4 "$TAQ_HOME/supervisor.log")"
i=0; while [ $i -lt 30 ] && kill -0 $SUP 2>/dev/null; do sleep 1; i=$((i + 1)); done
kill -0 $SUP 2>/dev/null && no 'the old supervisor is still running' || ok 'the old supervisor hands over and ends'
NEW=$(cat "$TAQ_HOME/autostart.pid" 2>/dev/null)
[ -n "$NEW" ] && kill -0 "$NEW" 2>/dev/null && ok 'to a new one, running the new version' || no "new supervisor: $NEW"
curl -sS -X POST "$URL/api/laptop/signin" | grep -q '"token":"' && ok 'which signs in by itself' || no 'signin after auto update'

mkrel v9.2.0 $SHA3 nosignin
printf 'v9.2.0 %s cannot sign in\n' $SHA3 >> "$T/rel/releases.txt"
i=0; while [ $i -lt 150 ] && ! grep -q '^FAILED=.*v9.2.0' "$TAQ_HOME/update.env"; do sleep 1; i=$((i + 1)); done
grep -q '^FAILED=.*v9.2.0' "$TAQ_HOME/update.env" && ok 'a release that cannot sign in is marked failed' || no "no failure: $(tail -5 "$TAQ_HOME/supervisor.log")"
i=0; while [ $i -lt 60 ] && [ "$(served)" != v9.1.0 ]; do sleep 1; i=$((i + 1)); done
is "$(served)" v9.1.0 'and the version before it is put back'
curl -sS -X POST "$URL/api/laptop/signin" | grep -q '"token":"' && ok 'signing in by itself again' || no 'signin after failed update'
sleep 8
is "$(served)" v9.1.0 'and it is not tried again'

PIDB=$(cat "$TAQ_HOME/server.pid")
mkrel v9.3.0 $SHA4 badps1
printf 'v9.3.0 %s broken launcher\n' $SHA4 >> "$T/rel/releases.txt"
i=0; while [ $i -lt 60 ] && ! grep -q '^FAILED=.*v9.3.0' "$TAQ_HOME/update.env"; do sleep 1; i=$((i + 1)); done
grep -q 'v9.3.0 refused: laptop.ps1' "$TAQ_HOME/supervisor.log" && ok 'a release whose launcher does not parse is refused' || no "badps1: $(tail -3 "$TAQ_HOME/supervisor.log")"
is "$(cat "$TAQ_HOME/server.pid")" "$PIDB" 'without even restarting the server'

app autoupdate off >/dev/null
mkrel v9.4.0 $SHA5
printf 'v9.4.0 %s\n' $SHA5 >> "$T/rel/releases.txt"
sleep 10
is "$(served)" v9.1.0 'autoupdate off: a newer release waits'
app status | grep -q "Avtomatik yangilanish: o'chirilgan" && ok 'and status says so' || no 'status autoupdate off'
app autoupdate on >/dev/null
i=0; while [ $i -lt 90 ] && [ "$(served)" != v9.4.0 ]; do sleep 1; i=$((i + 1)); done
is "$(served)" v9.4.0 'autoupdate on: it comes'
OUT=$(app rollback v9.1.0 2>&1)
echo "$OUT" | grep -q 'Qaytarildi: v9.4.0 -> v9.1.0' && ok 'rollback to a release by name' || no "rollback v9.1.0: $OUT"
is "$(served)" v9.1.0 'brings that release'
grep -q '^FAILED=.*v9.4.0' "$TAQ_HOME/update.env" && ok 'and keeps the newer ones from coming back by themselves' || no 'rollback by name FAILED'
sleep 8
is "$(served)" v9.1.0 'they do not'
NEW=$(cat "$TAQ_HOME/autostart.pid" 2>/dev/null)
[ -n "$NEW" ] && kill -0 "$NEW" 2>/dev/null && ok 'still under a supervisor after the rollback' || no 'no supervisor after rollback'
app stop >/dev/null
is "$(health)" 000 'stop stops the supervisor and the server'
SUP=''

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
