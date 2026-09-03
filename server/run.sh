#!/bin/sh
# Local development server. Frontend is served from pb_public (node build.mjs --serve).
cd "$(dirname "$0")"
[ -x ./pocketbase ] || ./get-pocketbase.sh
PB_DEV="${PB_DEV:-1}" exec ./pocketbase serve --http "${PB_HTTP:-127.0.0.1:8090}" --dir "${PB_DATA_DIR:-pb_data}" --hooksDir pb_hooks --publicDir pb_public
