#!/bin/sh
# Run on your Mac when sign-in codes stop arriving. Shows what the server has
# (Brevo key present? service alive?), the last mail-related log lines, then
# sends one test code e-mail and prints the exact server answer.
#   sh server/deploy/mail-check.sh root@SERVER_IP [you@example.com]
TARGET="$1"; TO="$2"
[ -n "$TARGET" ] || { echo "usage: sh server/deploy/mail-check.sh root@IP [email]"; exit 1; }
ssh "$TARGET" "cd /opt/taqqoslash/server && . ./.env && \
  echo '--- service';   systemctl is-active pocketbase; \
  echo '--- .env';      grep -E '^(BREVO_API_KEY|SENDER_ADDRESS|SMTP_HOST|PB_DOMAIN)=' .env | sed 's/\(BREVO_API_KEY=xkeysib-.\{8\}\).*/\1…/'; \
  echo '--- hook';      ls -l pb_hooks/mail-api.pb.js; \
  echo '--- last mail / OTP log lines'; journalctl -u pocketbase --no-pager -n 400 | grep -iE 'brevo|mail|otp|smtp|error' | tail -25; \
  echo '--- test e-mail'; TEST_EMAIL=\"\${TO:-\$PB_ADMIN_EMAIL}\" sh deploy/configure.sh 2>&1 | tail -3; \
  echo '--- log right after the test'; sleep 2; journalctl -u pocketbase --no-pager -n 40 | grep -iE 'brevo|mail|error' | tail -8; echo '(bo\'sh bo\'lsa: deploy/push.sh dan keyin qayta ishga tushiring)'"
