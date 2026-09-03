#!/bin/sh
# Started by systemd. HTTPS with an automatic Let's Encrypt certificate when
# PB_DOMAIN is set in .env; plain HTTP on port 80 (by IP) otherwise.
cd "$(dirname "$0")/.."
[ -f .env ] && . ./.env
. ./pb.sh
BIND="${PB_HTTP_BIND:-0.0.0.0:80}"
if [ -n "$PB_DOMAIN" ]; then
  set -- serve "$PB_DOMAIN" --http="$BIND" --https="${PB_HTTPS_BIND:-0.0.0.0:443}"
else
  set -- serve --http="$BIND"
fi
[ "${PB_PRINT_CMD:-0}" = 1 ] && echo "$PB $* --dir=pb_data --hooksDir=pb_hooks --publicDir=pb_public"
exec "$PB" "$@" --dir=pb_data --hooksDir=pb_hooks --publicDir=pb_public
