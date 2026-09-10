# Sourced by every script that takes root@IP as its first argument, right after
# it has read $TARGET.
#
# Three things go wrong with that argument, and all three have happened.
# «root@SERVER_IP» and «root@IP» are how the line is written in README.md, in
# CLAUDE.md and in docs/versiyalar.md, and they get pasted in unchanged — ssh
# then says «could not resolve hostname server_ip», which is true and
# unhelpful, after push.sh has already built the pages and started sending a
# tar. An address copied out of a worked example — 203.0.113.17 is in the
# range the RFC keeps for documentation — times out after a minute instead.
# And the real address, once it has worked, has to be typed again next time.
#
# So the address that last worked is kept in deploy/.target (not in git), a
# script run without an argument uses it, and find-server.sh digs it out of
# the shell history and ~/.ssh when nobody remembers it.
#
# Only `case` and `if` at the top level here: this file is sourced under
# `set -e`, where a failing `[ … ] && …` as the last command would abort the
# caller.
DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd)
TARGET_FILE="$DEPLOY_DIR/.target"
if [ -z "$TARGET" ] && [ -f "$TARGET_FILE" ]; then
  TARGET=$(cat "$TARGET_FILE")
  echo "server: $TARGET   (deploy/.target)"
fi
case "$TARGET" in
  '')
    echo "server manzili berilmagan."
    echo "Uni topish va eslab qolish uchun:   sh server/deploy/find-server.sh"
    exit 1 ;;
  *@IP|*@SERVER_IP|*@server_ip|*@SERVER-IP|*@VPS_IP|*@vps_ip|*@your-server*|IP|SERVER_IP)
    echo "«$TARGET» — bu ko'rsatmadagi o'rnini bosuvchi nom, haqiqiy manzil emas."
    echo "Haqiqiy manzilni topish uchun:   sh server/deploy/find-server.sh"
    exit 1 ;;
  *@203.0.113.*|*@198.51.100.*|*@192.0.2.*)
    echo "«$TARGET» — bu misollar uchun ajratilgan manzil (RFC 5737), unda server bo'lmaydi."
    echo "Haqiqiy manzilni topish uchun:   sh server/deploy/find-server.sh"
    exit 1 ;;
esac

# For a script's success path: the address that just worked is the one to
# offer next time.
remember_target() {
  if [ "$(cat "$TARGET_FILE" 2>/dev/null)" != "$TARGET" ]; then
    printf '%s\n' "$TARGET" > "$TARGET_FILE"
    echo "manzil eslab qolindi: $TARGET — keyingi safar argumentsiz ishlaydi: sh server/deploy/push.sh"
  fi
}
