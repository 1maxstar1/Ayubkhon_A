#!/bin/sh
# Runs ON the server as root, after deploy/push.sh has copied the files to
# /opt/taqqoslash. Fresh Ubuntu 22.04/24.04 -> running service. Re-running
# updates code and schema and keeps pb_data and .env.
#   sh install.sh                                 http by IP
#   PB_DOMAIN=smeta.firma.uz sh install.sh        https by domain (DNS must point here)
# NO_SYSTEMD=1 does the same without apt/systemd/ufw and leaves a plain-http
# instance running on 127.0.0.1:$PB_TEST_PORT (used by the tests).
set -e
APP="${APP_DIR:-/opt/taqqoslash}"
TEST="${NO_SYSTEMD:-0}"
TMP_PORT="${PB_SETUP_PORT:-8091}"
cd "$APP/server"

if [ "$TEST" != 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq curl unzip ca-certificates ufw openssl >/dev/null
  id pocketbase >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -d "$APP" pocketbase
  systemctl stop pocketbase 2>/dev/null || true
fi

# 1. binary
. ./pb.sh

# 2. .env — generated once; PB_DOMAIN / APP_URL refreshed when a domain is passed
IP=$(curl -sS -m 5 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
[ -n "$IP" ] || IP=127.0.0.1
if [ ! -f .env ]; then
  PASS=$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | cut -c1-24)
  sed -e "s|^PB_ADMIN_EMAIL=.*|PB_ADMIN_EMAIL=${PB_ADMIN_EMAIL:-admin@example.com}|" \
      -e "s|^PB_ADMIN_PASS=.*|PB_ADMIN_PASS=$PASS|" deploy/env.example > .env
  chmod 600 .env
  echo "yangi .env yaratildi (superuser paroli ichida): $APP/server/.env"
fi
if [ -n "$PB_DOMAIN" ]; then
  sed -i "s|^PB_DOMAIN=.*|PB_DOMAIN=$PB_DOMAIN|; s|^APP_URL=.*|APP_URL=https://$PB_DOMAIN|" .env
elif ! grep -q '^PB_DOMAIN=.' .env; then
  sed -i "s|^APP_URL=.*|APP_URL=http://$IP|" .env
fi
. ./.env

# 3. superuser + collections (setup.sh runs its own temporary instance)
PB_ADMIN_EMAIL="$PB_ADMIN_EMAIL" PB_ADMIN_PASS="$PB_ADMIN_PASS" PB_SETUP_PORT="$TMP_PORT" sh setup.sh
rm -f pb_data/dev-otp.txt

# 4. settings + first admin user, through a temporary plain-http instance.
#    (The real service may redirect http->https once a domain is set, so the
#    local API is only reachable reliably this way.)
if [ "$TEST" = 1 ]; then TMP_PORT="${PB_TEST_PORT:-8120}"; fi
PB_DEV=0 "$PB" serve --http="127.0.0.1:$TMP_PORT" --dir=pb_data --hooksDir=pb_hooks --publicDir=pb_public >pb_data/serve.log 2>&1 &
TMP_PID=$!
BASE="http://127.0.0.1:$TMP_PORT"
for i in $(seq 1 30); do [ "$(curl -sS -m 2 -o /dev/null -w '%{http_code}' "$BASE/api/health" 2>/dev/null)" = 200 ] && break || sleep 1; done
PB_LOCAL_URL="$BASE" sh deploy/configure.sh
TOKEN=$(curl -sS -X POST "$BASE/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
  -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -sS -o /dev/null -X POST "$BASE/api/collections/users/records" -H "Authorization: $TOKEN" -H 'content-type: application/json' \
  -d "{\"email\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\",\"passwordConfirm\":\"$PB_ADMIN_PASS\",\"name\":\"Administrator\",\"role\":\"admin\",\"active\":true,\"emailVisibility\":true}" || true

# 5. the real service
if [ "$TEST" = 1 ]; then
  echo $TMP_PID > pb_data/serve.pid          # left running for the test harness
else
  kill $TMP_PID 2>/dev/null; sleep 1
  chown -R pocketbase:pocketbase "$APP"
  cp deploy/pocketbase.service /etc/systemd/system/pocketbase.service
  systemctl daemon-reload
  systemctl enable pocketbase >/dev/null 2>&1 || true
  systemctl restart pocketbase
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
  sleep 2
  if systemctl is-active --quiet pocketbase; then echo "xizmat ishlayapti: systemctl status pocketbase"; else echo "XIZMAT ISHGA TUSHMADI — journalctl -u pocketbase -n 50"; exit 1; fi
fi

echo
echo "═══════════════════════════════════════════════════════════"
echo "  Dastur:        $APP_URL/"
echo "  Admin sahifa:  $APP_URL/admin.html"
echo "  Baza paneli:   $APP_URL/_/"
echo "  Superuser:     $PB_ADMIN_EMAIL   (parol: $APP/server/.env)"
[ -n "$PB_DOMAIN" ] && echo "  HTTPS:         $PB_DOMAIN — sertifikat birinchi ochilishda avtomatik olinadi (1–2 daqiqa)"
[ -n "$SMTP_HOST" ] || [ -n "$BREVO_API_KEY" ] || echo "  DIQQAT: SMTP sozlanmagan — .env ni to'ldirib 'sh deploy/configure.sh' ni qayta ishga tushiring"
echo "═══════════════════════════════════════════════════════════"
