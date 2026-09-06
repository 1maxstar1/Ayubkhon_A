#!/bin/sh
# Wipes the working data on the server so the registry can be built from
# scratch: applications, contragents, workspaces, price corrections, exports and
# the upload history, with their stored files. Accounts, settings and the mail
# configuration stay. A backup is taken first, into pb_data/backups/.
#   sh server/deploy/reset-data.sh root@SERVER_IP YES
set -e
TARGET="$1"; OK="$2"
[ -n "$TARGET" ] || { echo "usage: sh server/deploy/reset-data.sh root@IP YES"; exit 1; }
if [ "$OK" != YES ]; then
  echo "Bu buyruq serverdagi BARCHA arizalar, ish maydonlari, tuzatishlar va"
  echo "eksportlarni o'chiradi (foydalanuvchilar qoladi). Rozi bo'lsangiz:"
  echo "  sh server/deploy/reset-data.sh $TARGET YES"
  exit 1
fi
ssh "$TARGET" "cd /opt/taqqoslash/server && . ./.env && \
  BASE=\"\${PB_LOCAL_URL:-http://127.0.0.1:80}\"; R=''; \
  if [ -z \"\$PB_LOCAL_URL\" ] && [ -n \"\$PB_DOMAIN\" ]; then BASE=\"https://\$PB_DOMAIN\"; R=\"-k --resolve \$PB_DOMAIN:443:127.0.0.1\"; fi; \
  TOKEN=\$(curl -sS \$R -X POST \"\$BASE/api/collections/_superusers/auth-with-password\" -H 'content-type: application/json' \
    -d \"{\\\"identity\\\":\\\"\$PB_ADMIN_EMAIL\\\",\\\"password\\\":\\\"\$PB_ADMIN_PASS\\\"}\" | sed -n 's/.*\\\"token\\\":\\\"\\([^\\\"]*\\)\\\".*/\\1/p'); \
  [ -n \"\$TOKEN\" ] || { echo 'superuser auth failed'; exit 1; }; \
  echo '--- zaxira'; curl -sS \$R -o /dev/null -w 'backup HTTP %{http_code}\n' -X POST \"\$BASE/api/backups\" -H \"Authorization: \$TOKEN\"; \
  echo '--- tozalash'; curl -sS \$R -X POST \"\$BASE/api/admin/reset\" -H \"Authorization: \$TOKEN\" -H 'content-type: application/json' -d '{\"confirm\":\"СТЕРЕТЬ\"}'; echo; \
  echo '--- qolgan yozuvlar'; for c in applications contragents workspaces corrections exports registry_imports users; do \
    printf '%-18s %s\n' \"\$c\" \"\$(curl -sS \$R \"\$BASE/api/collections/\$c/records?perPage=1\" -H \"Authorization: \$TOKEN\" | sed -n 's/.*\\\"totalItems\\\":\\([0-9]*\\).*/\\1/p')\"; done"
