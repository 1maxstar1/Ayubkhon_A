#!/bin/sh
# server/laptop.ps1 — the Windows launcher — run under PowerShell against the
# Linux PocketBase binary, so what can be checked off Windows is checked:
# first start from nothing, sign-in by the code the page gets back, the server
# outliving the script that started it, status, backup, stop.
#
# What it cannot reach is the Windows-only part: Windows PowerShell 5.1
# itself, the hidden windows, the Startup shortcut, Get-NetTCPConnection, the
# idle time and the drive letters of Google Drive. The rest is exercised here,
# and every release must also prove itself on the real computer before it is
# kept (see laptop.ps1).
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
export TAQ_DRIVE_ROOTS="$T/gdrive" TAQ_RELEASES="$T/rel/releases.txt" TAQ_RELEASE_ZIP="$T/rel/zips"
# A new version must stay up this long before it is kept; the test waits less.
export TAQ_SETTLE=3 TAQ_TRIAL=25
ps1() { "$PWSH" -NoProfile -File server/laptop.ps1 "$@"; }
cleanup() {
  ps1 stop >/dev/null 2>&1
  for f in "$TAQ_HOME"/autostart.pid "$TAQ_HOME"/trial.pid "$TAQ_HOME"/server.pid; do
    [ -f "$f" ] && kill "$(cut -d' ' -f1 "$f")" 2>/dev/null
  done
  [ -n "$SUP" ] && kill "$SUP" 2>/dev/null
  [ -n "$SLEEPER" ] && kill "$SLEEPER" 2>/dev/null
  rm -rf "${T:?}"
}
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

echo '-- versions, on a copy of the program --'
# The program as the ZIP installs it - no .git - so it updates itself. A new
# version goes into app\<version>-<commit> beside the data; the program folder
# itself is never written to, and current.txt names what runs.
ps1 stop >/dev/null
APP="$T/app"; PRISTINE="$T/pristine"
mkdir -p "$APP" "$PRISTINE" "$T/rel/zips"
git ls-files -co --exclude-standard | while IFS= read -r f; do
  [ -f "$f" ] && mkdir -p "$PRISTINE/$(dirname "$f")" && cp "$f" "$PRISTINE/$f"
done
cp -R "$PRISTINE/." "$APP/"
app() { "$PWSH" -NoProfile -File "$APP/server/laptop.ps1" "$@"; }
served() { curl -s -m 3 "$URL/" | sed -n 's/.*class="ver"[^>]*>\(v[0-9.]*\)<.*/\1/p' | head -1; }
signs_in() { curl -sS -m 5 -X POST "$URL/api/laptop/signin" | grep -q '"token":"'; }
pidof_() { cut -d' ' -f1 "$TAQ_HOME/$1" 2>/dev/null; }
alive() { p=$(pidof_ "$1"); [ -n "$p" ] && kill -0 "$p" 2>/dev/null; }
wait_for() { i=0; while [ $i -lt "$1" ]; do eval "$2" && return 0; sleep 1; i=$((i + 1)); done; return 1; }
ORIG=$(sed -n 's/.*class="ver"[^>]*>\(v[0-9.]*\)<.*/\1/p' "$PRISTINE/dist/index.html" | head -1)
APPSUM=$(cd "$APP" && find . -type f | sort | xargs md5sum | md5sum)
DRV="$T/gdrive/Мой диск"
# mkrel <tag> <sha> [newhook|nosignin|badps1|crash]: a release ZIP shaped the
# way GitHub shapes one, everything inside «<repo>-<commit>/».
mkrel() {
  d="$T/rel/src/Ayubkhon_A-$2"; rm -rf "${T:?}/rel/src"; mkdir -p "$d"
  cp -R "$PRISTINE/." "$d/"
  sed -i "s/\(class=\"ver\"[^>]*>\)v[0-9.]*</\1$1</" "$d/dist/index.html"
  case "$3" in
    newhook) echo '// only in this release' > "$d/server/pb_hooks/zz_new.pb.js" ;;
    nosignin) echo 'throw new Error("this release cannot sign in")' > "$d/server/pb_hooks/laptop.pb.js" ;;
    badps1) printf '\r\nfunction Broken {{{\r\n' >> "$d/server/laptop.ps1" ;;
    # parses and answers selftest, but the supervisor dies the moment it runs
    crash) sed -i "s/^  'serve' {\r\$/  'serve' {\r\n    Invoke-NoSuchCommand\r/" "$d/server/laptop.ps1" ;;
    # passes the trial, but its supervisor dies in its first full round
    postcrash) sed -i "s/^        \$rounds++\r\$/        throw 'boom after the trial'\r\n        \$rounds++\r/" "$d/server/laptop.ps1" ;;
  esac
  (cd "$T/rel/src" && zip -qr "$T/rel/zips/$2.zip" .)
}
release() { printf 'v%s %s %s\n' "$1" "$2" "$3" >> "$T/rel/releases.txt"; }
SHA1=1111111111111111111111111111111111111111; SHA2=2222222222222222222222222222222222222222
SHA3=3333333333333333333333333333333333333333; SHA4=4444444444444444444444444444444444444444
SHA5=5555555555555555555555555555555555555555; SHA6=6666666666666666666666666666666666666666
SHA7=7777777777777777777777777777777777777777; SHA8=8888888888888888888888888888888888888888
SHA9=9999999999999999999999999999999999999999

app start >/dev/null
is "$(served)" "$ORIG" "the copy runs its own version ($ORIG)"
printf '# releases\n\n' > "$T/rel/releases.txt"
app update | grep -q "Eng yangi versiya o'rnatilgan" && ok 'update with nothing newer leaves it alone' || no 'update when current'

mkrel v9.0.0 $SHA1 newhook; release 9.0.0 $SHA1 first
NB=$(ls "$TAQ_BACKUPS"/*.zip | wc -l | tr -d ' ')
OUT=$(app update 2>&1)
echo "$OUT" | grep -q 'Yangilandi: v9.0.0' && ok 'update installs the newer release' || no "update: $OUT"
is "$(served)" v9.0.0 'and that is what now answers'
signs_in && ok 'signing in by itself' || no 'signin after update'
is "$(tr -d '\r\n' < "$TAQ_HOME/current.txt")" "v9.0.0-111111111111" 'current.txt names the new version'
is "$(tr -d '\r\n' < "$TAQ_HOME/previous.txt")" ROOT 'previous.txt the program folder'
[ -f "$TAQ_HOME/app/v9.0.0-111111111111/server/pb_hooks/zz_new.pb.js" ] && ok "the release's own files, in a folder of its own" || no 'app dir'
is "$(cd "$APP" && find . -type f | sort | xargs md5sum | md5sum)" "$APPSUM" 'the program folder is not touched'
is "$(ls "$TAQ_BACKUPS"/*.zip | wc -l | tr -d ' ')" $((NB + 1)) 'a backup is taken before it'
alive autostart.pid && ok 'the new version runs under its own supervisor' || no 'no supervisor after update'
app status | grep -q '^Versiya: v9.0.0' && ok 'the program folder hands status to the new version' || no "status: $(app status | head -3)"
app status | grep -q "oldingi versiya: $ORIG" && ok 'which says what rollback would bring back' || no "status prev: $(app status)"
is "$(app selftest)" "selftest ok $ORIG" 'selftest is answered by the program folder itself'

OUT=$(app rollback 2>&1)
echo "$OUT" | grep -q "Qaytarildi: v9.0.0 -> $ORIG" && ok 'rollback brings the old version back' || no "rollback: $OUT"
is "$(served)" "$ORIG" 'and it is the old one that answers'
signs_in && ok 'signing in by itself' || no 'signin after rollback'
is "$(tr -d '\r\n' < "$TAQ_HOME/current.txt")" ROOT 'current.txt points at the program folder again'
grep -q '^FAILED=.*v9.0.0@111111111111' "$TAQ_HOME/update.env" && ok 'the version rolled back from is not taken again by itself' || no "update.env: $(cat "$TAQ_HOME/update.env")"
OUT=$(app rollback 2>&1)
echo "$OUT" | grep -q "Qaytarildi: $ORIG -> v9.0.0" && ok 'a second rollback undoes the first (the pointers swap)' || no "second rollback: $OUT"
is "$(served)" v9.0.0 'and that version runs again'
OUT=$(app rollback 2>&1)
echo "$OUT" | grep -q "Qaytarildi: v9.0.0 -> $ORIG" && ok 'and a third goes back again' || no "third rollback: $OUT"
is "$(served)" "$ORIG" 'to the program folder'

mkrel v9.0.1 $SHA2 badps1; release 9.0.1 $SHA2 broken launcher
OUT=$(app update 2>&1)
echo "$OUT" | grep -q "v9.0.1 o'rnatilmaydi: laptop.ps1 o'qilmaydi" && ok 'a launcher that does not parse is refused' || no "badps1: $OUT"
is "$(served)" "$ORIG" 'and nothing changes'
mkrel v9.0.2 $SHA3 crash; release 9.0.2 $SHA3 runs but dies
OUT=$(app update 2>&1)
echo "$OUT" | grep -q "v9.0.2 ishga tushmadi - $ORIG da qoldi" && ok 'a launcher that parses but dies when it runs is not kept' || no "crash: $OUT"
is "$(served)" "$ORIG" 'the old version answers again'
signs_in && ok 'signing in by itself' || no 'signin after crash release'
[ -d "$TAQ_HOME/app/v9.0.2-333333333333" ] && no 'the failed version is left on the disk' || ok 'and the failed version is removed'
mkrel v9.0.3 $SHA4 nosignin; release 9.0.3 $SHA4 cannot sign in
OUT=$(app update 2>&1)
echo "$OUT" | grep -q 'v9.0.3 ishga tushmadi' && ok 'a version whose page would ask for a login is not kept' || no "nosignin: $OUT"
is "$(served)" "$ORIG" 'the old one answers'
grep -q '^FAILED=.*v9.0.1@222222222222.*v9.0.2@333333333333.*v9.0.3@444444444444' "$TAQ_HOME/update.env" \
  && ok 'all three remembered by version and commit' || no "FAILED: $(grep FAILED "$TAQ_HOME/update.env")"
app status | grep -q "o'zi qayta urinmaydi: .*v9.0.3" && ok 'status lists them' || no 'status FAILED'
mkrel v9.0.4 $SHA8 postcrash; release 9.0.4 $SHA8 dies after its trial
OUT=$(app update 2>&1)
echo "$OUT" | grep -q 'v9.0.4 ishga tushmadi' && ok 'a version whose supervisor dies after the trial is not kept either' || no "postcrash: $OUT"
is "$(served)" "$ORIG" 'the old one answers'
grep -q 'serve died (v9.0.4)' "$TAQ_HOME/supervisor.log" && ok 'and the log says what killed it' || no "no serve died: $(tail -4 "$TAQ_HOME/supervisor.log")"
is "$(tr -d '\r\n' < "$TAQ_HOME/current.txt")" ROOT 'current.txt is back where it was'

# The window of a typed update is closed in the middle of the trial: the
# version on approval gives way, and the version current.txt names comes back
# supervised.
mkrel v9.0.5 $SHA9; release 9.0.5 $SHA9 cut off by hand
TAQ_SETTLE=60 "$PWSH" -NoProfile -File "$APP/server/laptop.ps1" update >/dev/null 2>&1 &
UPD=$!
wait_for 90 'alive trial.pid && [ "$(served)" = v9.0.5 ]' && ok 'a typed update puts the new version on approval' || no 'typed trial did not start'
# Closing a console window ends every process attached to it: the update and
# a launcher it handed the command to - not the version on approval, which
# runs hidden, in a console of its own.
for c in $(pgrep -P $UPD); do grep -q 'serve' /proc/$c/cmdline 2>/dev/null || kill -9 $c 2>/dev/null; done
kill -9 $UPD 2>/dev/null
wait_for 60 '[ "$(served)" = "$ORIG" ] && alive autostart.pid' && ok 'its window closed: the old version is back, under a supervisor' || no "after closing: served $(served)"
alive trial.pid && no 'the version on approval is still running' || ok 'and the version on approval has gone'
grep -q 'nobody is waiting for v9.0.5' "$TAQ_HOME/supervisor.log" && ok 'saying why in the log' || no 'trial give-way log'
app stop >/dev/null; app start >/dev/null

echo '-- backups in Google Drive --'
grep -q '^BACKUP_COPY=' "$TAQ_HOME/settings.env" && no 'no Drive, yet a Drive copy set' || ok 'no Drive folder: nothing is set'
app drive 2>&1 | grep -q 'Google Drive papkasi topilmadi' && ok 'drive says how to get Google Drive when there is none' || no 'drive without Drive'
app drive "relative/path" 2>&1 | grep -q "Bunday papka yo'q" && ok 'a folder that is not a full path is refused' || no 'drive relative'
mkdir -p "$DRV"
app stop >/dev/null; OUT=$(app start 2>&1)
echo "$OUT" | grep -q "Zaxiralar Google Drive'ga ham qo'yiladi" && ok 'the Drive folder is found by itself at start' || no "start with Drive: $(echo "$OUT" | head -3)"
grep -q "^BACKUP_COPY=$DRV/Smeta zaxira" "$TAQ_HOME/settings.env" && ok 'remembered, Cyrillic name and all' || no "settings: $(cat "$TAQ_HOME/settings.env")"
grep -q '^PB_ADMIN_EMAIL=ekspert@example.com' "$TAQ_HOME/settings.env" && grep -q '^PB_ADMIN_PASS=' "$TAQ_HOME/settings.env" \
  && ok 'next to the account it already held' || no 'settings lost the account'
mkdir -p "$DRV/Smeta zaxira"; echo 'not ours' > "$DRV/Smeta zaxira/someone-elses.zip"
app backup >/dev/null
is "$(ls "$DRV/Smeta zaxira/"pb_*.zip 2>/dev/null | wc -l | tr -d ' ')" 1 'a backup is also copied into Drive'
is "$(cmp -s "$(ls -t "$TAQ_BACKUPS"/*.zip | head -1)" "$(ls -t "$DRV/Smeta zaxira/"pb_*.zip | head -1)" && echo same)" same 'the same file as on the disk'
[ -f "$DRV/Smeta zaxira/someone-elses.zip" ] && ok "a file that is not a backup is left alone" || no 'pruned a foreign file'
ls "$DRV/Smeta zaxira/" | grep -q '\.part$' && no 'a half-copied file left behind' || ok 'no half-copied file is left'
app status | grep -q "Google Drive'da: 1 ta" && ok 'status counts the Drive copies' || no "status drive: $(app status | grep -i drive)"
app drive off | grep -q "to'xtatildi" && ok 'drive off stops it' || no 'drive off'
app backup >/dev/null
is "$(ls "$DRV/Smeta zaxira/"pb_*.zip | wc -l | tr -d ' ')" 1 'and later backups stay on this disk'
app stop >/dev/null; app start >/dev/null
grep -q '^BACKUP_COPY=' "$TAQ_HOME/settings.env" && no 'turned off by hand, yet on again' || ok 'turned off by hand, it stays off'
app drive on | grep -q "Google Drive'ga ham qo'yiladi" && ok "'drive on' turns it back on" || no 'drive on'
grep -q "^BACKUP_COPY=$DRV/Smeta zaxira" "$TAQ_HOME/settings.env" && ok "and 'on' is not taken for a folder" || no 'drive on path'
# Drive not mounted when the backup is taken: the supervisor copies it later.
mv "$DRV" "$T/gdrive/away"
NDRV=$(ls "$T/gdrive/away/Smeta zaxira/"pb_*.zip | wc -l | tr -d ' ')
OUT=$(app backup 2>&1)
echo "$OUT" | grep -q "Drive'ga nusxa olinmadi" && ok 'a copy with Drive away fails out loud' || no "drive away: $OUT"
[ -d "$DRV" ] && no 'the Drive folder was created on the disk' || ok 'without making the Drive folder itself on the disk'
app status | grep -q 'oxirgi xato:' && ok 'and status shows the error' || no 'status drive error'
mv "$T/gdrive/away" "$DRV"

echo '-- by themselves, under the supervisor --'
app stop >/dev/null
mkrel v9.1.0 $SHA5; release 9.1.0 $SHA5 second
app autoupdate on >/dev/null
TAQ_TICK=2 TAQ_UPDATE_EVERY=3 TAQ_UPDATE_RETRY=3 TAQ_IDLE_SECONDS=0 \
  "$PWSH" -NoProfile -File "$APP/server/laptop.ps1" serve resumed >/dev/null 2>&1 &
SUP=$!
wait_for 30 '[ "$(served)" = "$ORIG" ]'
wait_for 20 'grep -q "^AVAILABLE=v9.1.0" "$TAQ_HOME/update.env"' && ok 'the supervisor finds the newer release' || no "AVAILABLE: $(cat "$TAQ_HOME/update.env")"
wait_for 20 '[ "$(ls "$DRV/Smeta zaxira/"pb_*.zip | wc -l | tr -d " ")" -gt "$NDRV" ]' && ok 'and puts the backup Drive missed into Drive' || no 'drive sync on tick'
sleep 6
is "$(served)" "$ORIG" 'but someone is at the keyboard: it waits'
app status | grep -q 'yangi versiya bor: v9.1.0' && ok 'status says a release is waiting' || no "status waiting: $(app status | grep -i tekshiruv)"
kill $SUP 2>/dev/null; app stop >/dev/null
app autoupdate on >/dev/null
TAQ_TICK=2 TAQ_UPDATE_EVERY=3 TAQ_UPDATE_RETRY=3 TAQ_IDLE_SECONDS=3600 \
  "$PWSH" -NoProfile -File "$APP/server/laptop.ps1" serve resumed >/dev/null 2>&1 &
SUP=$!
wait_for 120 '[ "$(served)" = v9.1.0 ]'
is "$(served)" v9.1.0 'nobody at the keyboard for an hour: it goes in'
wait_for 40 'grep -q "update $ORIG -> v9.1.0: ok" "$TAQ_HOME/supervisor.log"' && ok 'straight from the old version, skipping the ones that failed' || no "log: $(tail -4 "$TAQ_HOME/supervisor.log")"
wait_for 30 '! kill -0 $SUP 2>/dev/null' && ok 'the old supervisor ends' || no 'the old supervisor is still running'
alive autostart.pid && ok 'the new version supervises itself' || no 'no supervisor after auto update'
signs_in && ok 'and signs in by itself' || no 'signin after auto update'

# The installed version stops starting (a file gone): after three tries the
# supervisor puts the one before it back by itself.
rm "${TAQ_HOME:?}/app/v9.1.0-555555555555/dist/admin.html"
kill "$(pidof_ server.pid)"
wait_for 150 '[ "$(served)" = "$ORIG" ]'
is "$(served)" "$ORIG" 'a version that cannot start any more gives way to the one before it'
grep -q '^FAILED=.*v9.1.0@555555555555' "$TAQ_HOME/update.env" && ok 'and is not taken again' || no 'recover FAILED'
wait_for 20 'alive autostart.pid' && ok 'under a supervisor again' || no 'no supervisor after recovery'
app stop >/dev/null

# The machine goes off in the middle of an install: whatever was running
# before is what starts next time.
mkrel v9.2.0 $SHA6; release 9.2.0 $SHA6 third
BEFORE=$(tr -d '\r\n' < "$TAQ_HOME/current.txt"); BEFOREV=$(served)
[ -n "$BEFOREV" ] || { app start >/dev/null 2>&1; BEFOREV=$(served); }
app stop >/dev/null
TAQ_TICK=2 TAQ_UPDATE_EVERY=3 TAQ_IDLE_SECONDS=3600 TAQ_SETTLE=60 \
  "$PWSH" -NoProfile -File "$APP/server/laptop.ps1" serve resumed >/dev/null 2>&1 &
SUP=$!
wait_for 90 'alive trial.pid && [ "$(served)" = v9.2.0 ]' && ok 'the new version is on approval' || no 'trial did not start'
kill -9 $SUP $(pgrep -P $SUP) "$(pidof_ autostart.pid)" "$(pidof_ trial.pid)" "$(pidof_ server.pid)" 2>/dev/null; SUP=''
sleep 1
is "$(tr -d '\r\n' < "$TAQ_HOME/current.txt")" "$BEFORE" 'cut off before approval: current.txt still names the old version'
TAQ_IDLE_SECONDS=0 TAQ_AUTOSTART=1 app start >/dev/null 2>&1
is "$(served)" "$BEFOREV" 'and the old version is what starts'
alive autostart.pid && ok 'start, set to start at sign-in, leaves a supervisor running' || no 'start left no supervisor'

# A lock left by a process that died, whose number now belongs to another.
app stop >/dev/null
sleep 1000 & SLEEPER=$!
echo "$SLEEPER" > "$TAQ_HOME/update.lock"
app start >/dev/null
OUT=$(app update 2>&1)
echo "$OUT" | grep -q 'Yangilandi: v9.2.0' && ok 'a lock whose process is someone else does not block an update' || no "stale lock: $OUT"
kill -0 $SLEEPER 2>/dev/null && ok 'and that process is left alone' || no 'killed an unrelated process'
kill $SLEEPER; SLEEPER=''
app autoupdate off >/dev/null
mkrel v9.3.0 $SHA7; release 9.3.0 $SHA7
OUT=$(app rollback v9.0.0 2>&1)
echo "$OUT" | grep -q 'Qaytarildi: v9.2.0 -> v9.0.0' && ok 'rollback to a release by name' || no "rollback v9.0.0: $OUT"
is "$(served)" v9.0.0 'brings that release'
grep -q '^FAILED=.*v9.3.0@777777777777' "$TAQ_HOME/update.env" && ok 'and keeps the newer ones from coming back by themselves' || no 'rollback by name FAILED'
app status | grep -q "Avtomatik yangilanish: o'chirilgan" && ok 'autoupdate off is shown' || no 'status autoupdate off'

# Started through the program folder (as the sign-in shortcut does), the
# program folder watches the version's supervisor: one that dies is started
# again.
app stop >/dev/null
TAQ_AUTOSTART=1 TAQ_IDLE_SECONDS=0 app start >/dev/null 2>&1
is "$(served)" v9.0.0 'started through the program folder: the version current.txt names'
alive watchdog.pid && ok 'with the program folder watching' || no 'no watchdog'
DEAD=$(pidof_ autostart.pid)
kill -9 "$DEAD"
wait_for 60 'alive autostart.pid && [ "$(pidof_ autostart.pid)" != "$DEAD" ]' && ok 'a supervisor that dies is started again' || no 'not restarted'
grep -q "the supervisor of v9.0.0-111111111111 ended" "$TAQ_HOME/supervisor.log" && ok 'and the death is logged' || no 'death log'

# A newer program folder unpacked over C:\Smeta by hand runs - once, said in
# the pointers - and a rollback after that still means something.
cp "$APP/dist/index.html" "$T/index.keep"
sed -i 's/\(class="ver"[^>]*>\)v[0-9.]*</\1v9.9.9</' "$APP/dist/index.html"
app status >/dev/null 2>&1
is "$(tr -d '\r\n' < "$TAQ_HOME/current.txt")" ROOT 'a newer program folder takes over'
is "$(tr -d '\r\n' < "$TAQ_HOME/previous.txt")" v9.0.0-111111111111 'with the version it replaced kept as previous'
OUT=$(app rollback 2>&1)
echo "$OUT" | grep -q 'Qaytarildi: v9.9.9 -> v9.0.0' && ok 'rollback from it goes to that version' || no "rollback from ROOT: $OUT"
is "$(served)" v9.0.0 'and it is what runs - the newer program folder does not take over again'
cp "$T/index.keep" "$APP/dist/index.html"
app stop >/dev/null
is "$(health)" 000 'stop stops the supervisor and the server'

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
echo 'mine' > "$T/Smeta/README.md"
OUT=$(TAQ_DIR="$T/Smeta" TAQ_ZIP="$T/repo.zip" TAQ_NOSTART=1 "$PWSH" -NoProfile -Command \
  'Get-Content -Raw ./server/install-windows.ps1 | Invoke-Expression' 2>&1)
echo "$OUT" | grep -q "allaqachon o'rnatilgan" && ok 'run again over an install that updates itself, it hands over to its update' || no "installer again: $OUT"
is "$(cat "$T/Smeta/README.md")" mine 'and copies nothing over it'

echo '-- Windows PowerShell 5.1 --'
# The tests above run PowerShell 7. PSScriptAnalyzer's Windows PowerShell 5.1
# profile finds syntax, commands and .NET types 5.1 does not have, in every
# branch - the Windows-only ones too. PSA=/path/to/PSScriptAnalyzer.psd1
if [ -n "$PSA" ] && [ -f "$PSA" ]; then
  N=$("$PWSH" -NoProfile -Command "Import-Module '$PSA'
    \$p = 'win-48_x64_10.0.17763.0_5.1.17763.316_x64_4.0.30319.42000_framework'
    \$s = @{ IncludeRules = @('PSUseCompatibleSyntax','PSUseCompatibleCommands','PSUseCompatibleTypes'); Rules = @{
      PSUseCompatibleSyntax = @{ Enable = \$true; TargetVersions = @('5.1') }
      PSUseCompatibleCommands = @{ Enable = \$true; TargetProfiles = @(\$p) }
      PSUseCompatibleTypes = @{ Enable = \$true; TargetProfiles = @(\$p) } } }
    @(Invoke-ScriptAnalyzer -Path server/laptop.ps1 -Settings \$s).Count + @(Invoke-ScriptAnalyzer -Path server/install-windows.ps1 -Settings \$s).Count" 2>&1 | tail -1)
  is "$N" 0 'nothing in the launchers that Windows PowerShell 5.1 lacks'
else
  echo "skip PSScriptAnalyzer (PSA=/path/to/PSScriptAnalyzer.psd1 to run it)"
fi

echo
if [ "$FAIL" = 0 ]; then echo "laptop-windows OK"; else echo "FAILED ($FAIL)"; fi
[ "$FAIL" = 0 ]
