#!/bin/sh
# Server smoke test: fresh data dir -> setup -> serve -> OTP sign-in -> API read.
set -e
cd "$(dirname "$0")/../server"
export PB_DATA_DIR=pb_data_test PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASS=adminpass1234
# a test server never fetches the exchange's quotes by itself (setup.sh's temporary server inherits this too)
export UZEX_AUTO=0
PORT=8092; BASE="http://127.0.0.1:$PORT"
# No server of an earlier test may still be serving the directory that is about to be removed. A test that was
# killed, or one that left without waiting for its server, leaves one behind; it went on writing while the next
# test started — and that one failed for no reason of its own. Ended here, and waited for: asked first, then made to.
#
# Only a pocketbase serving pb_data_test is ever ended — never the owner's own server (laptop mode serves pb_data
# from this same checkout), whatever pid it has. Found three ways, so that none depends on one tool: the pids
# test/server.mjs wrote down (test/.servers.pid), pgrep, and without pgrep /proc. A pid is never taken on the
# strength of the file alone: its command line is read first (/proc, or ps on a Mac) and must serve pb_data_test.
PIDS=../test/.servers.pid
# This checkout's pb_data_test, given relative (as server/run.sh gives it) or absolute — the path taken literally,
# spaces and all — and nothing after it: never another directory, never a later argument that happens to end so.
# Given relative, the directory is the process's own working directory's: «--dir pb_data_test» of another checkout is
# not this one's, so its working directory must be this one (/proc/PID/cwd, or lsof on a Mac); one that cannot be
# read is left alone. The path is compared as written (pwd) and as it is on disk (pwd -P, through any symlink).
HERE=$(pwd -P)
esc() { printf '%s' "$1" | sed 's/[][\\.*^$+?(){}|/]/\\&/g'; }
ANY="serve .*--dir[= ](.*/)?pb_data_test( |\$)"   # every candidate, any checkout: ours() decides
ABS="serve .*--dir[= ]($(esc "$(pwd)")|$(esc "$HERE"))/pb_data_test( |\$)"
REL="serve .*--dir[= ]pb_data_test( |\$)"
# Is the process's working directory this one? Compared as a directory — device and inode — not as a path: /proc gives
# the path one mount names it by (a bind mount names it otherwise), and lsof (a Mac) escapes bytes it finds
# unprintable — a Cyrillic folder name, under some locales. stat is «-c» on Linux, «-f» on a Mac; lsof prints the
# device in hex.
HERE_ID=$( { stat -c '%d %i' "$HERE" || stat -f '%d %i' "$HERE"; } 2>/dev/null )
in_here() {
  [ -n "$HERE_ID" ] || return 1
  if [ -e "/proc/$1/cwd" ]; then [ "$(stat -L -c '%d %i' "/proc/$1/cwd" 2>/dev/null)" = "$HERE_ID" ]
  elif command -v lsof >/dev/null 2>&1; then
    IH_D=$(lsof -a -p "$1" -d cwd -FDi 2>/dev/null | sed -n 's/^D0x//p' | head -1)
    IH_I=$(lsof -a -p "$1" -d cwd -FDi 2>/dev/null | sed -n 's/^i//p' | head -1)
    [ -n "$IH_D" ] && [ -n "$IH_I" ] && [ "$(printf '%d' "0x$IH_D" 2>/dev/null) $IH_I" = "$HERE_ID" ]
  else return 1; fi
}
ours() {
  OC=$(cmd_of "$1")
  printf '%s' "$OC" | grep -Eq -- "$ABS" && return 0
  printf '%s' "$OC" | grep -Eq -- "$REL" && in_here "$1"
}
cmd_of() {
  if [ -r "/proc/$1/cmdline" ]; then { tr '\0' ' ' < "/proc/$1/cmdline"; } 2>/dev/null
  elif command -v ps >/dev/null 2>&1; then ps -ww -p "$1" -o args= 2>/dev/null; fi
}
# gone: no such process, or a zombie (ended, waiting for a parent to collect it — kill -0 still succeeds on one).
# /proc/PID/stat is «pid (comm) state …», and comm may itself hold «) »: the state follows the last one.
gone() {
  kill -0 "$1" 2>/dev/null || return 0
  if [ -r "/proc/$1/stat" ]; then
    ST=$({ cat "/proc/$1/stat"; } 2>/dev/null)
    case "${ST##*) }" in Z*) return 0 ;; esac
  elif command -v ps >/dev/null 2>&1; then
    case "$(ps -p "$1" -o stat= 2>/dev/null)" in Z*) return 0 ;; esac
  fi
  return 1
}
left_behind() {
  {
    if [ -f "$PIDS" ]; then
      while read -r p; do
        case "$p" in ''|*[!0-9]*) continue ;; esac
        echo "$p"
      done < "$PIDS"
    fi
    if command -v pgrep >/dev/null 2>&1; then pgrep -f -- "$ANY" 2>/dev/null
    elif [ -d /proc ]; then
      for d in /proc/[0-9]*; do
        { tr '\0' ' ' < "$d/cmdline"; } 2>/dev/null | grep -Eq -- "$ANY" && echo "${d#/proc/}"
      done
    fi
  } | sort -u | while read -r p; do
    [ -n "$p" ] && [ "$p" != "$$" ] && ! gone "$p" && ours "$p" && echo "$p"
  done
}
LEFTOVER=$(left_behind | tr '\n' ' ')
if [ -n "$LEFTOVER" ]; then
  kill $LEFTOVER 2>/dev/null || true
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    STILL=""; for p in $LEFTOVER; do gone "$p" || STILL="$STILL $p"; done
    [ -z "$STILL" ] && break; sleep 0.2
  done
  if [ -n "$STILL" ]; then kill -9 $STILL 2>/dev/null || true; sleep 0.5; fi
fi
: > "$PIDS"
# A server the test before has only just stopped may still be closing its database, and its last files can appear
# while the directory is being removed: «Directory not empty», and the next test failed before it began. Removed
# again after a moment instead.
rm -rf pb_data_test 2>/dev/null || { sleep 1; rm -rf pb_data_test; }
PB_SETUP_PORT=8093 ./setup.sh
PB_DEV=1 PB_HTTP="127.0.0.1:$PORT" ./run.sh >pb_data_test/serve.log 2>&1 &
PID=$!
echo "$PID" >> "$PIDS"
# Waited for, not only told to stop: the test that called this starts its own server on the same directory the
# moment this returns, and it must not find this one still closing its database. «|| true» on each step: under
# set -e a failing step would end the trap with its status (see server/setup.sh).
trap 'kill $PID 2>/dev/null || true; ( sleep 5; kill -9 $PID 2>/dev/null ) >/dev/null 2>&1 & W=$!; wait $PID 2>/dev/null || true; kill $W 2>/dev/null || true' EXIT
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
