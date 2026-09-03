#!/bin/sh
# Shows the last one-time sign-in code written by the dev hook (PB_DEV=1).
cd "$(dirname "$0")"
F="${PB_DATA_DIR:-pb_data}/dev-otp.txt"
[ -f "$F" ] || { echo "hali kod so'ralmagan ($F yo'q)"; exit 1; }
tail -1 "$F" | sed 's/.*OTP \([^ ]*\) .*code=\([0-9]*\).*/\1  ->  \2/'
