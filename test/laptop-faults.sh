#!/bin/sh
# The Mac launcher when something goes wrong (fourth audit, G2), run for real in a throwaway copy:
#
#   the port is taken by another program — the launcher says so, not «the password does not match»;
#   the log of the run before survives the next start (serve.log.1) — it holds why the server fell over;
#   under «start» a server that falls over is started again (launchd does that only for «serve»).
#
#   sh test/laptop-faults.sh
set -e
cd "$(dirname "$0")/.."
REPO=$(pwd)
T=$(mktemp -d)
APP="$T/app"
PORT=8157
BASE="http://127.0.0.1:$PORT"
FAIL=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; FAIL=$((FAIL + 1)); }
check() { if eval "$1"; then ok "$2"; else bad "$2"; fi; }
up() { curl -sS -m 2 -o /dev/null "$BASE/api/health" 2>/dev/null; }
wait_up() { i=0; while [ $i -lt 90 ]; do up && return 0; sleep 1; i=$((i + 1)); done; return 1; }
wait_down() { i=0; while [ $i -lt 40 ] && up; do sleep 0.5; i=$((i + 1)); done; }

[ -x server/pocketbase ] || (cd server && sh get-pocketbase.sh >/dev/null)

mkdir -p "$APP/server" "$T/home" "$T/bin"
cp build.mjs package.json "$APP/"
cp -R src dist "$APP/"
cp server/*.sh server/pb_schema.json server/backup-prune.cjs "$APP/server/"
cp -R server/pb_hooks "$APP/server/"
ln -s "$REPO/server/pocketbase" "$APP/server/pocketbase"
# «open» is the Mac's way to show the page; here it must do nothing (on Linux it can be another program)
printf '#!/bin/sh\nexit 0\n' > "$T/bin/open"; chmod +x "$T/bin/open"
export PATH="$T/bin:$PATH" HOME="$T/home" PB_PORT=$PORT PB_SETUP_PORT=8158 PB_ADMIN_EMAIL=owner@example.com UZEX_AUTO=0
L="$APP/server/laptop.sh"
LOG="$APP/server/pb_data/serve.log"

BG=0; HOLD=0
stop_bg() { if [ "$BG" != 0 ]; then kill "$BG" 2>/dev/null || true; wait "$BG" 2>/dev/null || true; BG=0; fi; wait_down
  pkill -f "$APP/server/pocketbase" 2>/dev/null || true; wait_down; }
# The launcher is settled — signed in, the day's copy taken, its trap set — once the copy is there: stopping it
# earlier leaves its server behind, which is not what these checks are about.
settled() { i=0; while [ $i -lt 60 ] && [ -z "$(ls "$HOME/Backups/smeta"/*.zip 2>/dev/null)" ]; do sleep 1; i=$((i + 1)); done; sleep 2; }
pid_now() { cat "$APP/server/pb_data/serve.pid" 2>/dev/null || true; }
# up again, and as a process other than $1
wait_new() { i=0; while [ $i -lt 90 ]; do P=$(pid_now); if [ -n "$P" ] && [ "$P" != "$1" ] && up; then return 0; fi; sleep 1; i=$((i + 1)); done; return 1; }
cleanup() { stop_bg; if [ "$HOLD" != 0 ]; then kill "$HOLD" 2>/dev/null || true; fi; pkill -f "$APP/server" 2>/dev/null || true; rm -rf "$T"; }
trap cleanup EXIT

# 1 — another program holds the port: «serve» stops and says the port is taken
node -e "require('http').createServer((q,s)=>{s.writeHead(404);s.end('{}')}).listen($PORT,'127.0.0.1')" &
HOLD=$!
wait_up || true
set +e
OUT=$(sh "$L" serve 2>&1); CODE=$?
set -e
check '[ "$CODE" != 0 ]' "the launcher does not carry on with the port taken"
check 'echo "$OUT" | grep -q "port band"' "it says the port is taken"
check '! echo "$OUT" | grep -q "parol"' "and not that the password does not match"
kill "$HOLD" 2>/dev/null || true; wait "$HOLD" 2>/dev/null || true; HOLD=0
wait_down

# 2 — the log of the run before is kept
sh "$L" serve >"$T/serve1.out" 2>&1 & BG=$!
wait_up
check 'up' "the launcher starts the program"
check '[ -s "$LOG" ]' "the server writes its log"
settled
echo "MARKER-OF-THE-RUN-BEFORE" >> "$LOG"
FIRST=$(pid_now)
stop_bg
sh "$L" serve >"$T/serve2.out" 2>&1 & BG=$!
wait_new "$FIRST" || true
check 'grep -q MARKER-OF-THE-RUN-BEFORE "$LOG.1" 2>/dev/null' "starting again keeps the log of the run before (serve.log.1)"
check '! grep -q MARKER-OF-THE-RUN-BEFORE "$LOG"' "and the new run writes a log of its own"
settled
stop_bg

# 3 — under «start», a server that falls over is started again
sh "$L" start >"$T/start.out" 2>&1 & BG=$!
wait_up
check 'up' "«start» starts the program"
settled
OLD=$(pid_now)
kill -9 "$OLD" 2>/dev/null || true
wait_down
check 'wait_new "$OLD"' "a server that fell over answers again by itself, as a new process"
check 'grep -q "qayta ishga tushirilmoqda" "$T/start.out"' "and the launcher says it restarted it"
stop_bg

echo
if [ $FAIL = 0 ]; then echo "laptop-faults: all ok"; else echo "laptop-faults: $FAIL failed"; exit 1; fi
