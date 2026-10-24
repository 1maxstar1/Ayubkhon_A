#!/bin/sh
# The program on one person's own laptop: the database is a file on this disk,
# nothing is sent anywhere, and the sign-in code never leaves the machine.
#
#   sh server/laptop.sh              set up if needed, start, open the browser
#   sh server/laptop.sh autostart    ... and from now on start at every login
#   sh server/laptop.sh stop         stop it
#   sh server/laptop.sh status       is it running, how big is the database
#   sh server/laptop.sh backup       make a copy now (kept in ~/Backups/smeta)
#   sh server/laptop.sh update       take the newest version and restart
#   sh server/laptop.sh uninstall    stop, and stop starting at login
#
# The data is never touched by any of these; see «Zaxira» in server/README.md.
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
PORT="${PB_PORT:-8090}"
URL="http://127.0.0.1:$PORT"
ENV_FILE=server/.env
PID_FILE=server/pb_data/serve.pid
LOG=server/pb_data/serve.log
BACKUPS="$HOME/Backups/smeta"
AGENT="$HOME/Library/LaunchAgents/uz.taqqoslash.smeta.plist"
LABEL=uz.taqqoslash.smeta
KEEP=14                                   # backups kept on this disk

say() { printf '%s\n' "$*"; }
die() { say "$*" >&2; exit 1; }
getenv_val() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -1 || true; }
running() { [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; }
answering() { curl -sS -m 2 -o /dev/null "$URL/api/health" 2>/dev/null; }
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d)$1)}catch(e){console.log('')}})"; }

need_tools() {
  command -v node >/dev/null 2>&1 || die "node topilmadi — https://nodejs.org dan o'rnating (macOS: brew install node)"
  command -v curl >/dev/null 2>&1 || die "curl topilmadi"
}

# The superuser password guards the database console on this machine. Made once
# and kept in server/.env (chmod 600, never in git), reused on every later run.
ensure_env() {
  EMAIL=$(getenv_val PB_ADMIN_EMAIL)
  PASS=$(getenv_val PB_ADMIN_PASS)
  if [ -z "$EMAIL" ]; then
    EMAIL="$PB_ADMIN_EMAIL"
    if [ -z "$EMAIL" ]; then
      if [ -t 0 ]; then
        printf 'Ishchi elektron pochtangiz (shu bilan dasturga kirasiz): '
        read -r EMAIL
      fi
      [ -n "$EMAIL" ] || die "pochta kerak: PB_ADMIN_EMAIL=siz@firma.uz sh server/laptop.sh"
    fi
  fi
  if [ -z "$PASS" ]; then
    PASS=$(openssl rand -base64 30 2>/dev/null | tr -dc 'A-Za-z0-9' | cut -c1-24 || true)
    [ -n "$PASS" ] || PASS=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64').replace(/[^A-Za-z0-9]/g,'').slice(0,24))")
    NEW_PASS=1
  fi
  mkdir -p server
  touch "$ENV_FILE"
  # Only the two keys are written, and only when they are not there yet: a
  # .env that already carries SMTP settings (server/lan.sh, a server install)
  # must come through this unchanged.
  grep -q '^PB_ADMIN_EMAIL=' "$ENV_FILE" || printf 'PB_ADMIN_EMAIL=%s\n' "$EMAIL" >> "$ENV_FILE"
  grep -q '^PB_ADMIN_PASS=' "$ENV_FILE" || printf 'PB_ADMIN_PASS=%s\n' "$PASS" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  export PB_ADMIN_EMAIL="$EMAIL" PB_ADMIN_PASS="$PASS"
}

su_token() {
  curl -sS -X POST "$URL/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
    -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | json '.token'
}

start_server() {
  mkdir -p server/pb_data
  # PB_AUTOLOGIN: no sign-in at all on a laptop only its owner uses (owner's
  # decision, 2026-10). PB_AUTOLOGIN=0 sh server/laptop.sh brings the login back.
  ( cd server && PB_DEV=1 PB_LAPTOP=1 PB_AUTOLOGIN="${PB_AUTOLOGIN:-1}" PB_AUTOLOGIN_EMAIL="$PB_ADMIN_EMAIL" \
      PB_HTTP="127.0.0.1:$PORT" sh run.sh >"$ROOT/$LOG" 2>&1 & echo $! > "$ROOT/$PID_FILE" )
  i=0
  while [ $i -lt 20 ]; do
    answering && return 0
    sleep 1; i=$((i + 1))
  done
  say "server ishga tushmadi — $LOG ga qarang"; tail -5 "$LOG" 2>/dev/null; exit 1
}

# The version label the page carries in its header (class="ver").
version_of() { sed -n 's/.*class="ver"[^>]*>\(v[0-9.]*\)<.*/\1/p' | head -1; }
local_version() { version_of < dist/index.html; }
served_version() { curl -sS -m 5 "$URL/" 2>/dev/null | version_of; }
autologin_on() { [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 -X POST "$URL/api/laptop/signin")" = 200 ]; }

# Is what answers on the port this version, running the way this script runs
# it? Something answering is not enough: a server left from an earlier attempt
# or an older version answers just as well, and opening the browser on it shows
# a login the current version no longer has.
is_current() {
  answering || return 1
  [ "$(served_version)" = "$(local_version)" ] || return 1
  [ "${PB_AUTOLOGIN:-1}" = 0 ] || autologin_on || return 1
}

# Whatever PocketBase holds the port, even one this script did not start.
# Nothing that is not PocketBase is touched.
stop_port_holder() {
  if command -v lsof >/dev/null 2>&1; then
    for id in $(lsof -t "-iTCP:$PORT" -sTCP:LISTEN 2>/dev/null); do
      case "$(ps -p "$id" -o comm= 2>/dev/null)" in *pocketbase*) kill "$id" 2>/dev/null || true ;; esac
    done
  fi
  # PocketBase shuts down gracefully; give it the time to let go of the port.
  i=0
  while [ $i -lt 20 ] && answering; do sleep 0.5; i=$((i + 1)); done
}

stop_server() {
  if running; then kill "$(cat "$PID_FILE")" 2>/dev/null || true; sleep 1; fi
  rm -f "$PID_FILE"
}

# The account the person signs in with. Same address as the superuser, and an
# administrator, so one person can both price a project and load the registry.
ensure_user() {
  SU=$(su_token)
  [ -n "$SU" ] || die "bazaga kirib bo'lmadi — server/.env dagi parol mos kelmayapti"
  curl -sS -o /dev/null -X POST "$URL/api/collections/users/records" -H "Authorization: $SU" -H 'content-type: application/json' \
    -d "{\"email\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\",\"passwordConfirm\":\"$PB_ADMIN_PASS\",\"name\":\"Administrator\",\"role\":\"admin\",\"active\":true,\"emailVisibility\":true}" || true
  # An earlier attempt may have left the account as something else.
  F=$(node -e "console.log(encodeURIComponent(\"email='\"+process.argv[1]+\"'\"))" "$PB_ADMIN_EMAIL")
  ID=$(curl -sS "$URL/api/collections/users/records?perPage=1&filter=$F" -H "Authorization: $SU" | json '.items[0]&&JSON.parse(d).items[0].id')
  [ -n "$ID" ] && [ "$ID" != undefined ] || die "hisob yaratilmadi: $PB_ADMIN_EMAIL"
  curl -sS -o /dev/null -X PATCH "$URL/api/collections/users/records/$ID" -H "Authorization: $SU" \
    -H 'content-type: application/json' -d '{"role":"admin","active":true}' || true
}

# setup.sh polls its own temporary instance until it answers, so the first
# second of a first run is a «Failed to connect» from curl that means nothing.
# Kept until something actually goes wrong, and then shown whole.
prepare_db() {
  OUT=$(sh server/setup.sh 2>&1) || { say "$OUT"; die "baza tayyorlanmadi"; }
}

setup() {
  need_tools
  ensure_env
  prepare_db
  node build.mjs --serve >/dev/null
}

# A copy of the whole database, kept outside pb_data — a disk that loses
# pb_data loses the backups inside it too.
backup_now() {
  SU=$(su_token)
  [ -n "$SU" ] || { say "zaxira olinmadi: bazaga kirib bo'lmadi"; return 1; }
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$URL/api/backups" -H "Authorization: $SU" \
    -H 'content-type: application/json' -d '{}')
  case "$CODE" in 2*) ;; *) say "zaxira olinmadi: HTTP $CODE"; return 1;; esac
  mkdir -p "$BACKUPS"
  NEWEST=$(ls -t server/pb_data/backups/*.zip 2>/dev/null | head -1)
  [ -n "$NEWEST" ] || { say "zaxira fayli topilmadi"; return 1; }
  cp "$NEWEST" "$BACKUPS/" 2>/dev/null || true
  # keep the newest $KEEP, here and in pb_data
  ls -t "$BACKUPS"/*.zip 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do rm -f "$f"; done
  ls -t server/pb_data/backups/*.zip 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do rm -f "$f"; done
  say "zaxira: $BACKUPS/$(basename "$NEWEST")"
}

# Once a day is enough, and it is taken at start-up rather than at three in the
# morning: a laptop is asleep at three.
backup_if_stale() {
  NEWEST=$(ls -t "$BACKUPS"/*.zip 2>/dev/null | head -1)
  if [ -n "$NEWEST" ] && [ -z "$(find "$NEWEST" -mmin +1200 2>/dev/null)" ]; then return 0; fi
  backup_now || true
}

open_browser() { command -v open >/dev/null 2>&1 && open "$URL/" 2>/dev/null || true; }

banner() {
  say ""
  say "─────────────────────────────────────────────────────────────"
  say "  Dastur:        $URL/"
  say "  Admin sahifa:  $URL/admin.html"
  say "  Baza paneli:   $URL/_/     (parol: server/.env)"
  say ""
  say "  Kirish oynasi yo'q — sahifa ochilishi bilan ichkaridasiz."
  say "  Hisob: $PB_ADMIN_EMAIL (administrator)"
  say ""
  say "  Ma'lumot shu yerda:  $ROOT/server/pb_data"
  say "  Zaxiralar:           $BACKUPS"
  say "─────────────────────────────────────────────────────────────"
  if [ "${NEW_PASS:-0}" = 1 ]; then
    say ""
    say "  Baza paneli uchun parol yaratildi va server/.env ga yozildi."
  fi
}

plist() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$ROOT/server/laptop.sh</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/server/pb_data/autostart.log</string>
  <key>StandardErrorPath</key><string>$ROOT/server/pb_data/autostart.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLIST
}

case "${1:-start}" in
  start)
    if is_current; then say "allaqachon ishlayapti: $URL/"; open_browser; exit 0; fi
    # Before setup: setup rewrites pb_hooks/lib/nlp.js, a running PocketBase
    # watches that folder and restarts itself, and for that moment it is
    # neither answering nor holding the port — so it has to be gone first.
    if answering; then
      say "eski server topildi ($(served_version)) — $(local_version) bilan almashtirilmoqda..."
      stop_server; stop_port_holder
      if answering; then die "$PORT-port boshqa dastur tomonidan band"; fi
    fi
    setup
    start_server
    ensure_user
    backup_if_stale
    banner
    open_browser
    say "  To'xtatish: Ctrl+C"
    stop() { stop_server; say ""; say "to'xtatildi"; exit 0; }
    trap stop INT TERM
    while running; do sleep 1; done
    ;;

  # What launchd runs: no browser, no banner, and it stays in the foreground so
  # launchd can see it stop and start it again.
  serve)
    setup
    stop_server
    start_server
    ensure_user
    backup_if_stale
    trap 'stop_server; exit 0' INT TERM
    while running; do sleep 5; done
    ;;

  autostart)
    uname -s | grep -qi darwin || die "autostart hozircha faqat macOS uchun"
    setup
    mkdir -p "$(dirname "$AGENT")"
    plist > "$AGENT"
    launchctl unload "$AGENT" 2>/dev/null || true
    launchctl load "$AGENT"
    i=0; while [ $i -lt 30 ]; do answering && break; sleep 1; i=$((i + 1)); done
    answering || die "ishga tushmadi — server/pb_data/autostart.log ga qarang"
    ensure_user
    banner
    say ""
    say "  Endi kompyuter yonganda o'zi ishga tushadi."
    say "  Bekor qilish:  sh server/laptop.sh uninstall"
    open_browser
    ;;

  stop)
    if [ -f "$AGENT" ]; then launchctl unload "$AGENT" 2>/dev/null || true; fi
    stop_server
    say "to'xtatildi"
    ;;

  status)
    if answering; then
      say "ishlayapti: $URL/"
      SV=$(served_version); LV=$(local_version)
      if [ "$SV" = "$LV" ]; then say "versiya: $SV"; else say "versiya: $SV ishlayapti, papkada $LV — almashtirish: sh server/laptop.sh"; fi
      if autologin_on; then say "kirish oynasisiz: ha"; else say "kirish oynasisiz: yo'q"; fi
    else say "ishlamayapti"; fi
    [ -f "$AGENT" ] && say "kompyuter yonganda o'zi ishga tushadi (launchd: $LABEL)" || true
    [ -d server/pb_data ] && say "ma'lumot: $(du -sh server/pb_data 2>/dev/null | cut -f1)  ($ROOT/server/pb_data)" || true
    N=$(ls -1 "$BACKUPS"/*.zip 2>/dev/null | wc -l | tr -d ' ')
    LAST=$(ls -t "$BACKUPS"/*.zip 2>/dev/null | head -1)
    [ -n "$LAST" ] && say "zaxira: $N ta, oxirgisi $(basename "$LAST")" || say "zaxira: hali yo'q"
    ;;

  backup)
    need_tools; ensure_env
    answering || { start_server; STARTED=1; }
    backup_now
    [ "${STARTED:-0}" = 1 ] && stop_server || true
    ;;

  update)
    need_tools
    git pull --ff-only
    setup
    if [ -f "$AGENT" ]; then
      launchctl unload "$AGENT" 2>/dev/null || true
      launchctl load "$AGENT"
      i=0; while [ $i -lt 30 ]; do answering && break; sleep 1; i=$((i + 1)); done
    else
      stop_server; start_server
    fi
    say "yangilandi — brauzerda Cmd+Shift+R bosing"
    ;;

  uninstall)
    if [ -f "$AGENT" ]; then launchctl unload "$AGENT" 2>/dev/null || true; rm -f "$AGENT"; fi
    stop_server
    say "o'chirildi: endi o'zi ishga tushmaydi. Ma'lumot joyida: $ROOT/server/pb_data"
    ;;

  *) die "usage: sh server/laptop.sh [start|autostart|stop|status|backup|update|uninstall]" ;;
esac
