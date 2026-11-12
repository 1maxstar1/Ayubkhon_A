#!/bin/sh
# The laptop launcher's backups, run for real in a throwaway copy of the program:
#
#   a copy is taken, lands in ~/Backups/smeta and — the point of it — in a second place off this disk
#   (a cloud drive's folder when there is one; «drive <folder>» names another, «drive off» none);
#   «restore <zip>» puts the database back from a copy, moves the one it replaces aside, and says what came back;
#   a file that is not a backup is refused before anything is touched.
#
# Nothing of this was tested before: the restore had never been done by anybody, and the launcher said
# «zaxira: …» whether or not the copy had been written.
#
#   sh test/laptop-backup.sh
set -e
cd "$(dirname "$0")/.."
REPO=$(pwd)
T=$(mktemp -d)
APP="$T/app"
PORT=8147
BASE="http://127.0.0.1:$PORT"
FAIL=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; FAIL=$((FAIL + 1)); }
check() { if eval "$1"; then ok "$2"; else bad "$2"; fi; }
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d)$1)}catch(e){console.log('')}})"; }

# the program, without anybody's data: the sources, the launcher, and the PocketBase binary by link
mkdir -p "$APP/server" "$T/home"
cp build.mjs package.json "$APP/"
cp -R src dist "$APP/"
cp server/*.sh server/pb_schema.json server/backup-prune.cjs "$APP/server/"
cp -R server/pb_hooks "$APP/server/"
ln -s "$REPO/server/pocketbase" "$APP/server/pocketbase"

# a home of its own, with a cloud drive in it the way Google Drive for desktop keeps one on a Mac
DRIVE="$T/home/Library/CloudStorage/GoogleDrive-owner@example.com/My Drive"
mkdir -p "$DRIVE"
export HOME="$T/home" PB_PORT=$PORT PB_SETUP_PORT=8148 PB_ADMIN_EMAIL=owner@example.com UZEX_AUTO=0
L="$APP/server/laptop.sh"
LOCAL="$HOME/Backups/smeta"
COPY="$DRIVE/Smeta zaxira (Mac)"

SERVE=0
serve() { sh "$L" serve >"$T/serve.out" 2>&1 & SERVE=$!
  i=0; while [ $i -lt 90 ]; do curl -sS -m 2 -o /dev/null "$BASE/api/health" 2>/dev/null && break; sleep 1; i=$((i + 1)); done; }
unserve() { if [ "$SERVE" != 0 ]; then kill "$SERVE" 2>/dev/null || true; wait "$SERVE" 2>/dev/null || true; SERVE=0; fi
  i=0; while [ $i -lt 20 ] && curl -sS -m 1 -o /dev/null "$BASE/api/health" 2>/dev/null; do sleep 0.5; i=$((i + 1)); done; }
cleanup() { unserve; pkill -f "$APP/server" 2>/dev/null || true; rm -rf "$T"; }
trap cleanup EXIT
token() { PASS=$(sed -n 's/^PB_ADMIN_PASS=//p' "$APP/server/.env"); curl -sS -X POST "$BASE/api/collections/_superusers/auth-with-password" \
  -H 'content-type: application/json' -d "{\"identity\":\"owner@example.com\",\"password\":\"$PASS\"}" | json '.token'; }
users() { curl -sS "$BASE/api/collections/users/records?perPage=1&fields=id" -H "Authorization: $(token)" | json '.totalItems'; }
zips() { ls -1 "$1"/*.zip 2>/dev/null | wc -l | tr -d ' '; }

# 1 — starting the program takes the day's copy, here and in the cloud folder it found by itself
serve
check 'curl -sS -m 2 -o /dev/null "$BASE/api/health"' "the launcher starts the program in the copy"
i=0; while [ $i -lt 30 ] && [ "$(zips "$LOCAL")" = 0 ]; do sleep 1; i=$((i + 1)); done
check '[ "$(zips "$LOCAL")" = 1 ]' "starting it takes a backup into ~/Backups/smeta"
# the second copy is made right after the first: waited for, not looked at the instant the first appears
i=0; while [ $i -lt 30 ] && [ "$(zips "$COPY")" = 0 ]; do sleep 1; i=$((i + 1)); done
check '[ "$(zips "$COPY")" = 1 ]' "and a second copy into the cloud drive it found («$(basename "$DRIVE")/Smeta zaxira (Mac)»)"
check '[ "$(ls "$LOCAL")" = "$(ls "$COPY")" ]' "the same file in both places"
OUT=$(sh "$L" status)
check 'echo "$OUT" | grep -q "ikkinchi nusxa: 1 ta"' "«status» says where the second copy is and how many it holds"

# 2 — a record is added, a copy taken, the record lost: the copy brings it back
check '[ "$(users)" = 1 ]' "one account to begin with"
curl -sS -o /dev/null -X POST "$BASE/api/collections/users/records" -H "Authorization: $(token)" -H 'content-type: application/json' \
  -d '{"email":"marker@example.com","password":"Xx12345678901","passwordConfirm":"Xx12345678901","name":"Marker","role":"ekspert","active":true}'
check '[ "$(users)" = 2 ]' "a second account is added"
sleep 1
OUT=$(sh "$L" backup)
check 'echo "$OUT" | grep -q "^zaxira: " && echo "$OUT" | grep -q "^ikkinchi nusxa: .*Smeta zaxira (Mac)"' "«backup» says where both copies went"
check '[ "$(zips "$LOCAL")" = 2 ] && [ "$(zips "$COPY")" = 2 ]' "two copies in each place now"
GOOD=$(ls -t "$LOCAL"/*.zip | head -1)
ID=$(curl -sS "$BASE/api/collections/users/records?perPage=1&filter=email%3D%27marker%40example.com%27" -H "Authorization: $(token)" | json '.items[0].id')
curl -sS -o /dev/null -X DELETE "$BASE/api/collections/users/records/$ID" -H "Authorization: $(token)"
check '[ "$(users)" = 1 ]' "the account is deleted — the mistake to undo"

# 3 — what is not a backup is refused before anything is touched
echo "not a zip" > "$T/junk.zip"
OUT=$(RESTORE_YES=1 sh "$L" restore "$T/junk.zip" 2>&1) && R=0 || R=$?
check '[ $R != 0 ] && echo "$OUT" | grep -q "buzilgan yoki zip emas"' "a file that is not a zip is refused"
( cd "$T" && echo x > note.txt && zip -q other.zip note.txt )
OUT=$(RESTORE_YES=1 sh "$L" restore "$T/other.zip" 2>&1) && R=0 || R=$?
check '[ $R != 0 ] && echo "$OUT" | grep -q "data.db"' "so is a zip that is not this program's backup"
OUT=$(sh "$L" restore "$GOOD" 2>&1 </dev/null) && R=0 || R=$?
check '[ $R != 0 ] && echo "$OUT" | grep -q "RESTORE_YES=1"' "and without a yes nothing is restored"
check '[ "$(users)" = 1 ] && ! ls -d "$APP"/server/pb_data.before-restore-* >/dev/null 2>&1' "the running database is untouched by all three"
OUT=$(sh "$L" restore)
check 'echo "$OUT" | grep -q "$(basename "$GOOD")" && echo "$OUT" | grep -q "Smeta zaxira (Mac)"' "«restore» alone lists the copies of both places"

# 4 — the restore itself, by the file's bare name
OUT=$(RESTORE_YES=1 sh "$L" restore "$(basename "$GOOD")" 2>&1) && R=0 || R=$?
check '[ $R = 0 ] && echo "$OUT" | grep -q "^tiklandi: $(basename "$GOOD")"' "«restore <zip>» restores"
check 'echo "$OUT" | grep -q "arizalar: 0 .*narx tuzatishlari: 0"' "and says what the database holds now"
check 'ls -d "$APP"/server/pb_data.before-restore-* >/dev/null 2>&1' "the database it replaced is moved aside, not deleted"
check '! curl -sS -m 1 -o /dev/null "$BASE/api/health" 2>/dev/null' "it leaves the program stopped, to be started the usual way"
unserve
serve
check '[ "$(users)" = 2 ]' "started again, the deleted account is back"
check '[ "$(zips "$APP/server/pb_data/backups")" -ge 2 ]' "and the copies kept with the old database are still listed"

# 5 — the second place can be named, and switched off
mkdir -p "$T/usb"
OUT=$(sh "$L" drive "$T/usb")
check 'echo "$OUT" | grep -q "ikkinchi nusxa endi shu yerga yoziladi" && [ "$(zips "$T/usb")" = 1 ]' "«drive <folder>» names another place and copies the latest backup there at once"
sleep 1
sh "$L" backup >/dev/null
check '[ "$(zips "$T/usb")" = 2 ] && [ "$(zips "$COPY")" = 2 ]' "the next backup goes there, not to the place found before"
OUT=$(sh "$L" drive off; sh "$L" backup; sh "$L" status)
check 'echo "$OUT" | grep -q "ikkinchi nusxa: YO.Q" && [ "$(zips "$T/usb")" = 2 ]' "«drive off» keeps no second copy, and every command says so plainly"
if [ "$(id -u)" != 0 ]; then
  # A folder that cannot be written to is not taken as the second place; one that stops being writable later
  # (a drive unplugged, a cloud folder signed out) is said out loud at the next backup. This half ran for the
  # first time on CI — everywhere else the tests run as root — and was wrong: it named the folder after
  # closing it, which the launcher rightly refuses, and then looked for the warning of a place that was never set.
  chmod 500 "$T/usb"
  OUT=$(sh "$L" drive "$T/usb" 2>&1 || true)
  check 'echo "$OUT" | grep -q "papkaga yozib bo.lmaydi"' "a folder that cannot be written to is not taken as the second place"
  chmod 700 "$T/usb"
  sh "$L" drive "$T/usb" >/dev/null 2>&1 || true
  chmod 500 "$T/usb"
  sleep 1
  OUT=$(sh "$L" backup 2>&1 || true)
  chmod 700 "$T/usb"
  check 'echo "$OUT" | grep -q "DIQQAT: ikkinchi nusxa yozilmadi"' "a second place that cannot be written to is said out loud"
else
  ok "a second place that cannot be written to is said out loud (not checked: running as root, which can write anywhere)"
fi
chmod 700 "$T/usb" 2>/dev/null || true

unserve
if [ $FAIL = 0 ]; then echo "laptop-backup OK"; else echo "FAILED ($FAIL)"; tail -5 "$T/serve.out" 2>/dev/null; fi
[ $FAIL = 0 ]
