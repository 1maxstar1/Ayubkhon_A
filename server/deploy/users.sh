#!/bin/sh
# Run on your Mac: adds staff accounts on the server (role ekspert, active).
# Existing e-mails are skipped. Names default to the part before @.
#   sh server/deploy/users.sh root@SERVER_IP a.bekov@firma.uz b.karimov@firma.uz
#   ROLE=admin sh server/deploy/users.sh root@SERVER_IP boss@firma.uz
set -e
TARGET="$1"; shift
[ -n "$1" ] || { echo "usage: sh server/deploy/users.sh root@IP email1 [email2 …]"; exit 1; }
ROLE="${ROLE:-ekspert}"
# The whole job runs on the server in one ssh session (LOCAL=1 runs it here, for tests).
CMD='
cd "${APP_SERVER_DIR:-/opt/taqqoslash/server}" && . ./.env
if [ -n "$PB_LOCAL_URL" ]; then B="$PB_LOCAL_URL"; R=""
elif [ -n "$PB_DOMAIN" ]; then B="https://$PB_DOMAIN"; R="-k --resolve $PB_DOMAIN:443:127.0.0.1"
else B="http://127.0.0.1:80"; R=""; fi
T=$(curl -sS $R -X POST "$B/api/collections/_superusers/auth-with-password" -H "content-type: application/json" \
    -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | sed -n "s/.*\"token\":\"\([^\"]*\)\".*/\1/p")
[ -n "$T" ] || { echo "superuser auth failed"; exit 1; }
for E in $EMAILS; do
  N=$(echo "$E" | cut -d@ -f1 | tr "._" "  ")
  P=$(openssl rand -base64 24 | tr -dc "A-Za-z0-9" | cut -c1-20)
  C=$(curl -sS $R -o /tmp/u.json -w "%{http_code}" -X POST "$B/api/collections/users/records" -H "Authorization: $T" -H "content-type: application/json" \
      -d "{\"email\":\"$E\",\"password\":\"$P\",\"passwordConfirm\":\"$P\",\"name\":\"$N\",\"role\":\"$ROLE\",\"active\":true,\"emailVisibility\":true}")
  case $C in
    200) echo "qo'\''shildi   $E   ($N, $ROLE)";;
    400) if grep -q "already\|unique" /tmp/u.json; then echo "bor edi     $E"; else echo "XATO        $E: $(cat /tmp/u.json)"; fi;;
    *)   echo "XATO $C     $E: $(cat /tmp/u.json)";;
  esac
done'
if [ "${LOCAL:-0}" = 1 ]; then
  EMAILS="$*" ROLE="$ROLE" sh -c "$CMD"
else
  ssh "$TARGET" "EMAILS='$*' ROLE='$ROLE' sh -c '$(printf '%s' "$CMD" | sed "s/'/'\\\\''/g")'"
fi
