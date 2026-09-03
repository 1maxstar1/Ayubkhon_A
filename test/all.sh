#!/bin/sh
# Runs every test in order and prints a pass/fail summary with timings.
#   sh test/all.sh [registry.xls] [smeta1.xlsx] [smeta2.xlsx]
# The browser tests need: npm i -D playwright && npx playwright install chromium
cd "$(dirname "$0")/.."
REG="$1"; S1="$2"; S2="$3"
OUT=test/all-results.txt
: > "$OUT"
run() {
  NAME="$1"; shift
  printf '%-22s ' "$NAME"
  T0=$(date +%s)
  if "$@" >"test/.log-$NAME.txt" 2>&1; then R=OK; else R=FAIL; fi
  T=$(( $(date +%s) - T0 ))
  printf '%-4s %3ss\n' "$R" "$T"
  printf '%s\t%s\t%s\n' "$NAME" "$R" "$T" >> "$OUT"
  [ "$R" = FAIL ] && tail -15 "test/.log-$NAME.txt"
  return 0
}
node build.mjs --serve >/dev/null
echo "test                   sonuc  vaqt"
echo "-----------------------------------"
run build            node build.mjs
[ -n "$S1" ] && run pipeline  node test/pipeline.cjs "$S1" "$S2" --out test/out.xlsx
run registry-parse   node test/registry.cjs
run pb-smoke         sh test/pb-smoke.sh
run registry-import  sh test/registry-import.sh
[ -n "$S1" ] && run browser   node test/browser.mjs "$S1" "$S2"
run e2e-auth         node test/e2e-auth.mjs
run e2e-admin        node test/e2e-admin.mjs
[ -n "$S1" ] && run e2e-workspace node test/e2e-workspace.mjs "$S1" "$S2"
[ -n "$S1" ] && run e2e-hints     node test/e2e-hints.mjs "$S1"
[ -n "$REG" ] && run e2e-fullregistry node test/e2e-fullregistry.mjs "$REG"
echo "-----------------------------------"
FAILED=$(grep -c 'FAIL' "$OUT" || true)
echo "$(grep -c OK "$OUT") ok, $FAILED fail"
[ "$FAILED" = 0 ]
