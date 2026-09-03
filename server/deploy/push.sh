#!/bin/sh
# Run on your Mac. Builds the frontend, copies the server folder to the VPS
# and runs the installer there. Re-run any time to update (data is kept).
#   sh server/deploy/push.sh root@SERVER_IP
#   sh server/deploy/push.sh root@SERVER_IP smeta.firma.uz     (adds HTTPS by domain)
#   PB_ADMIN_EMAIL=you@firma.uz sh server/deploy/push.sh root@IP  (admin e-mail, first install only)
set -e
TARGET="$1"; DOMAIN="$2"
[ -n "$TARGET" ] || { echo "usage: sh server/deploy/push.sh root@IP [domain]"; exit 1; }
cd "$(dirname "$0")/../.."
command -v node >/dev/null || { echo "node kerak (brew install node)"; exit 1; }
node build.mjs --serve
echo "yuklanmoqda -> $TARGET:/opt/taqqoslash …"
tar czf - --exclude='server/pb_data*' --exclude='server/pocketbase' --exclude='server/pocketbase.exe' \
  --exclude='server/*.zip' --exclude='server/.env' --exclude='server/*.log' server \
  | ssh "$TARGET" 'mkdir -p /opt/taqqoslash && tar xzf - -C /opt/taqqoslash'
ssh "$TARGET" "PB_DOMAIN='$DOMAIN' PB_ADMIN_EMAIL='${PB_ADMIN_EMAIL:-}' sh /opt/taqqoslash/server/deploy/install.sh"
