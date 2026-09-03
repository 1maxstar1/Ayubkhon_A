#!/bin/sh
# Run on your Mac: checks that the server can reach the SMTP host (IPv4),
# writes the mail settings into the server's .env, applies them and sends a
# test code e-mail to the admin address.
#   sh server/deploy/smtp.sh root@SERVER_IP smtp.gmail.com 587 you@gmail.com 'app-password'
#   sh server/deploy/smtp.sh root@SERVER_IP smtp.yandex.ru 465 you@yandex.ru 'password' true
set -e
TARGET="$1"; HOST="$2"; PORT="$3"; USER="$4"; PASS="$5"; TLS="${6:-false}"
[ -n "$PASS" ] || { echo "usage: sh server/deploy/smtp.sh root@IP smtp-host port login 'password' [tls:true|false]"; exit 1; }
echo "--- $HOST:$PORT serverdan ochiqmi (IPv4):"
BANNER=$(ssh "$TARGET" "curl -4 -sS -m 8 telnet://$HOST:$PORT </dev/null 2>&1 | head -1" || true)
case "$BANNER" in
  220*) echo "OCHIQ: $BANNER" ;;
  *)    [ -n "$BANNER" ] || BANNER="(javob kelmadi)"
        echo "YOPIQ yoki javob yo'q: $BANNER"
        echo "Provayder chiquvchi SMTP portini bloklagan bo'lishi mumkin — Serverspace qo'llab-quvvatlashiga"
        echo "\"chiquvchi 465 va 587 portlarni oching\" deb yozing, yoki boshqa portni sinang (465 + tls=true)."
        exit 1 ;;
esac
echo "--- sozlanmoqda…"
ssh "$TARGET" "cd /opt/taqqoslash/server && \
  sed -i \"s|^SMTP_HOST=.*|SMTP_HOST=$HOST|; s|^SMTP_PORT=.*|SMTP_PORT=$PORT|; s|^SMTP_USER=.*|SMTP_USER=$USER|; s|^SMTP_PASS=.*|SMTP_PASS='$PASS'|; s|^SMTP_TLS=.*|SMTP_TLS=$TLS|; s|^SENDER_ADDRESS=.*|SENDER_ADDRESS=$USER|\" .env && \
  . ./.env && TEST_EMAIL=\"\$PB_ADMIN_EMAIL\" sh deploy/configure.sh"
