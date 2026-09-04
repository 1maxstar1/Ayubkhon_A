#!/bin/sh
# Applies .env to the running PocketBase: app name/URL, SMTP, daily backups,
# rate limits, log retention. Safe to re-run.
#   sh deploy/configure.sh
#   TEST_EMAIL=you@firma.uz sh deploy/configure.sh     (also sends a test code e-mail)
set -e
cd "$(dirname "$0")/.."
. ./.env
# Local API address. With a domain the service redirects http->https, so talk
# to the https port with the domain name resolved to 127.0.0.1.
if [ -n "$PB_LOCAL_URL" ]; then BASE="$PB_LOCAL_URL"; R=""
elif [ -n "$PB_DOMAIN" ]; then BASE="https://$PB_DOMAIN"; R="-k --resolve $PB_DOMAIN:443:127.0.0.1"
else BASE="http://127.0.0.1:80"; R=""; fi
tok() { sed -n 's/.*"token":"\([^"]*\)".*/\1/p'; }
TOKEN=$(curl -sS $R -X POST "$BASE/api/collections/_superusers/auth-with-password" -H 'content-type: application/json' \
  -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | tok)
[ -n "$TOKEN" ] || { echo "configure: superuser auth failed at $BASE"; exit 1; }

SMTP_ON=false; [ -n "$SMTP_HOST" ] && [ -n "$SMTP_USER" ] && SMTP_ON=true
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
BODY=$(cat <<JSON
{
  "meta": {
    "appName": "Таблица сопоставления №2",
    "appURL": "$(esc "$APP_URL")",
    "senderName": "$(esc "${SENDER_NAME:-Таблица сопоставления №2}")",
    "senderAddress": "$(esc "${SENDER_ADDRESS:-${SMTP_USER:-noreply@example.com}}")"
  },
  "smtp": {
    "enabled": $SMTP_ON,
    "host": "$(esc "${SMTP_HOST:-smtp.example.com}")",
    "port": ${SMTP_PORT:-587},
    "username": "$(esc "$SMTP_USER")",
    "password": "$(esc "$SMTP_PASS")",
    "tls": ${SMTP_TLS:-false},
    "authMethod": ""
  },
  "backups": { "cron": "0 3 * * *", "cronMaxKeep": 7 },
  "rateLimits": {
    "enabled": true,
    "rules": [
      { "label": "*:auth",   "audience": "", "duration": 3,  "maxRequests": 4 },
      { "label": "*:create", "audience": "", "duration": 5,  "maxRequests": 40 },
      { "label": "/api/",    "audience": "", "duration": 10, "maxRequests": 400 }
    ]
  },
  "logs": { "maxDays": 14, "logIP": true }
}
JSON
)
OUT=$(mktemp)
CODE=$(curl -sS $R -o "$OUT" -w '%{http_code}' -X PATCH "$BASE/api/settings" -H "Authorization: $TOKEN" -H 'content-type: application/json' -d "$BODY")
[ "$CODE" = 200 ] || { echo "configure: settings PATCH failed ($CODE)"; cat "$OUT"; rm -f "$OUT"; exit 1; }
rm -f "$OUT"
if [ "$SMTP_ON" = true ]; then S="SMTP $SMTP_HOST"
elif [ -n "$GMAIL_RELAY_URL" ]; then S="xat Gmail relay orqali (bir necha soniyada yetadi)"
elif [ -n "$BREVO_API_KEY" ]; then S="xat Brevo API orqali — 15-20 daqiqa kechikishi mumkin"
else S="SMTP YO'Q — kirish kodlari yuborilmaydi"; fi
echo "sozlamalar qo'llandi: $APP_URL · $S · zaxira har kuni 03:00 (7 nusxa) · rate limit yoqiq"

if [ -n "$TEST_EMAIL" ]; then
  OUT=$(mktemp)
  CODE=$(curl -sS $R -o "$OUT" -w '%{http_code}' -X POST "$BASE/api/settings/test/email" -H "Authorization: $TOKEN" -H 'content-type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"template\":\"otp\",\"collection\":\"users\"}")
  if [ "$CODE" = 204 ]; then echo "sinov xati $TEST_EMAIL ga ketdi — pochtani tekshiring"; else echo "sinov xati yuborilmadi ($CODE):"; cat "$OUT"; echo; fi
  rm -f "$OUT"
fi
