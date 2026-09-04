#!/bin/sh
# Point the server at the Apps Script relay (deploy/gmail-relay.gs) so sign-in
# codes are sent by Gmail itself and arrive in seconds instead of the 15-20
# minutes a shared Brevo sender takes.
#   sh server/deploy/gmail-relay.sh root@SERVER_IP 'https://script.google.com/macros/s/…/exec' 'SECRET'
# Pass "off" as the URL to fall back to Brevo.
set -e
TARGET="$1"; URL="$2"; SECRET="$3"
[ -n "$URL" ] || { echo "usage: sh server/deploy/gmail-relay.sh root@IP 'https://script.google.com/macros/s/…/exec' 'SECRET'"; exit 1; }
if [ "$URL" = off ]; then URL=""; SECRET=""; fi
ssh "$TARGET" "cd /opt/taqqoslash/server && \
  grep -q '^GMAIL_RELAY_URL=' .env || printf '\nGMAIL_RELAY_URL=\nGMAIL_RELAY_SECRET=\n' >> .env; \
  grep -q '^GMAIL_RELAY_SECRET=' .env || printf 'GMAIL_RELAY_SECRET=\n' >> .env; \
  sed -i \"s|^GMAIL_RELAY_URL=.*|GMAIL_RELAY_URL=$URL|; s|^GMAIL_RELAY_SECRET=.*|GMAIL_RELAY_SECRET=$SECRET|\" .env && \
  systemctl restart pocketbase && sleep 3 && \
  . ./.env && TEST_EMAIL=\"\$PB_ADMIN_EMAIL\" sh deploy/configure.sh 2>&1 | tail -2 && \
  sleep 2 && journalctl -u pocketbase --no-pager -n 30 | grep -iE 'relay|mail|error' | tail -5"
