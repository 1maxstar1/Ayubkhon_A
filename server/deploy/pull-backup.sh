#!/bin/sh
# Run on your Mac: makes a fresh backup on the server and downloads it.
#   sh server/deploy/pull-backup.sh root@SERVER_IP [~/Backups/smeta]
set -e
TARGET="$1"; DEST="${2:-$HOME/Backups/smeta}"
[ -n "$TARGET" ] || { echo "usage: sh server/deploy/pull-backup.sh root@IP [dest]"; exit 1; }
mkdir -p "$DEST"
ssh "$TARGET" 'cd /opt/taqqoslash/server && . ./.env && \
  if [ -n "$PB_DOMAIN" ]; then B="https://$PB_DOMAIN"; R="-k --resolve $PB_DOMAIN:443:127.0.0.1"; else B="http://127.0.0.1:80"; R=""; fi && \
  T=$(curl -sS $R -X POST "$B/api/collections/_superusers/auth-with-password" -H "content-type: application/json" \
     -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | sed -n "s/.*\"token\":\"\([^\"]*\)\".*/\1/p") && \
  curl -sS $R -o /dev/null -w "yangi zaxira: HTTP %{http_code}\n" -X POST "$B/api/backups" -H "Authorization: $T" -H "content-type: application/json" -d "{}"'
LATEST=$(ssh "$TARGET" 'ls -t /opt/taqqoslash/server/pb_data/backups/*.zip | head -1')
scp -q "$TARGET:$LATEST" "$DEST/"
echo "saqlandi: $DEST/$(basename "$LATEST")"
