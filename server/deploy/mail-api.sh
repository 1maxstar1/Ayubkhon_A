#!/bin/sh
# Run on your Mac when the provider blocks outgoing SMTP: sends mail through
# Brevo's HTTPS API. Writes the key into the server's .env, restarts the
# service and sends a test code e-mail to the admin address.
#   sh server/deploy/mail-api.sh root@SERVER_IP 'xkeysib-…' sender@gmail.com
# The sender must be verified in Brevo (Senders & IP -> Add a sender).
set -e
TARGET="$1"; KEY="$2"; SENDER="$3"
[ -n "$SENDER" ] || { echo "usage: sh server/deploy/mail-api.sh root@IP 'brevo-api-key' sender@email"; exit 1; }
ssh "$TARGET" "cd /opt/taqqoslash/server && \
  grep -q '^BREVO_API_KEY=' .env || printf '\nBREVO_API_KEY=\n' >> .env; \
  sed -i \"s|^BREVO_API_KEY=.*|BREVO_API_KEY=$KEY|; s|^SENDER_ADDRESS=.*|SENDER_ADDRESS=$SENDER|\" .env && \
  systemctl restart pocketbase && sleep 3 && \
  . ./.env && TEST_EMAIL=\"\$PB_ADMIN_EMAIL\" sh deploy/configure.sh"
