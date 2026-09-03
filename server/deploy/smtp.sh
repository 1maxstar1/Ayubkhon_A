#!/bin/sh
# Run on your Mac: writes the mail settings into the server's .env, applies
# them and sends a test code e-mail to the admin address.
#   sh server/deploy/smtp.sh root@SERVER_IP smtp.gmail.com 587 you@gmail.com 'app-password'
#   sh server/deploy/smtp.sh root@SERVER_IP smtp.yandex.ru 465 you@yandex.ru 'password' true
set -e
TARGET="$1"; HOST="$2"; PORT="$3"; USER="$4"; PASS="$5"; TLS="${6:-false}"
[ -n "$PASS" ] || { echo "usage: sh server/deploy/smtp.sh root@IP smtp-host port login 'password' [tls:true|false]"; exit 1; }
ssh "$TARGET" "cd /opt/taqqoslash/server && \
  sed -i \"s|^SMTP_HOST=.*|SMTP_HOST=$HOST|; s|^SMTP_PORT=.*|SMTP_PORT=$PORT|; s|^SMTP_USER=.*|SMTP_USER=$USER|; s|^SMTP_PASS=.*|SMTP_PASS='$PASS'|; s|^SMTP_TLS=.*|SMTP_TLS=$TLS|; s|^SENDER_ADDRESS=.*|SENDER_ADDRESS=$USER|\" .env && \
  . ./.env && TEST_EMAIL=\"\$PB_ADMIN_EMAIL\" sh deploy/configure.sh"
