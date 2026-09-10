#!/bin/sh
# Runs every test in order and prints a pass/fail summary with timings.
#   sh test/all.sh [registry.xls] [smeta1.xlsx] [smeta2.xlsx]
# The browser tests need: npm i -D playwright && npx playwright install chromium
cd "$(dirname "$0")/.."
REG="$1"; S1="$2"; S2="$3"
OUT=test/all-results.txt
: > "$OUT"

# The usage line above names the files by what they are, not by their real
# paths, and those names have been typed in literally — a whole run then ends
# in a node stack trace saying ENOENT smeta1.xlsx, which says the same thing
# far less clearly. Said once, here, before anything runs.
for F in "$REG" "$S1" "$S2"; do
  [ -z "$F" ] && continue
  [ -f "$F" ] && continue
  echo "fayl topilmadi: $F"
  echo
  echo "  Bu yerga o'z faylingizning yo'li kerak. Eng oson yo'li: buyruqni"
  echo "  «sh test/all.sh » deb yozing va faylni Finder'dan terminal oynasiga"
  echo "  sudrab tashlang — yo'li o'zi yoziladi. Uchtagacha fayl beriladi:"
  echo "  reyestr (.xls), keyin ikkita smeta (.xlsx)."
  echo
  echo "  Fayllarsiz ham ishlaydi — u holda smetaga bog'liq testlar SKIP bo'ladi:"
  echo
  echo "      sh test/all.sh"
  exit 1
done

# The browser tests need a browser. Without playwright each of them ends in the
# same twelve-line «Cannot find package» trace, which reads like seven separate
# failures of the program rather than one missing dependency.
if node -e "require.resolve('playwright')" 2>/dev/null; then PW=1; else PW=0; fi

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
skip() {
  printf '%-22s %-4s %3s   %s\n' "$1" "SKIP" "-" "$2"
  printf '%s\tSKIP\t0\n' "$1" >> "$OUT"
}
# A browser test with no browser, or a smeta test with no smeta, is skipped by
# name rather than left out of the summary: a run that says «20 ok» and lists
# twenty tests is telling the truth about a suite of twenty-five only if it
# says which five it did not run.
browser_run() { if [ "$PW" = 1 ]; then run "$@"; else skip "$1" "playwright o'rnatilmagan: npm i -D playwright && npx playwright install chromium"; fi; }
smeta_run() { if [ -n "$S1" ]; then run "$@"; else skip "$1" "smeta fayli berilmagan"; fi; }
both_run() { if [ -n "$S1" ]; then browser_run "$@"; else skip "$1" "smeta fayli berilmagan"; fi; }

node build.mjs --serve >/dev/null
echo "test                   sonuc  vaqt"
echo "-----------------------------------"
run build            node build.mjs
run normalize        node test/normalize.cjs
run xlsx-guard       node test/xlsx-guard.cjs
run sections         node test/sections.cjs
run regions          node test/regions.cjs
smeta_run pipeline       node test/pipeline.cjs "$S1" "$S2" --out test/out.xlsx
smeta_run hints          node test/hints.cjs "$S1" "$S2"
run registry-parse   node test/registry.cjs
run deploy-target    sh test/deploy-target.sh
run pb-smoke         sh test/pb-smoke.sh
run install          node test/install.mjs
run registry-import  sh test/registry-import.sh
run admin-api        sh test/admin-api.sh
run dedupe           node test/dedupe.mjs
run mail-otp         node test/mail-otp.mjs
run match-keys       node test/match-keys.mjs
run corrections-bulk node test/corrections-bulk.mjs
run ownership        node test/ownership.mjs
run disable-user     node test/disable-user.mjs
both_run  browser        node test/browser.mjs "$S1" "$S2"
browser_run e2e-auth     node test/e2e-auth.mjs
browser_run e2e-admin    node test/e2e-admin.mjs
browser_run upload-order node test/upload-order.mjs
both_run  e2e-workspace  node test/e2e-workspace.mjs "$S1" "$S2"
both_run  e2e-hints      node test/e2e-hints.mjs "$S1"
if [ -n "$REG" ]; then browser_run e2e-fullregistry node test/e2e-fullregistry.mjs "$REG"; else skip e2e-fullregistry "reyestr fayli berilmagan"; fi
echo "-----------------------------------"
# Counted by column rather than by grepping for the word: «\t» is a tab to GNU
# grep and the letter t to the one on a Mac, and the summary is the line most
# likely to be believed without checking.
count() { awk -F'\t' -v r="$1" '$2 == r { n++ } END { print n + 0 }' "$OUT"; }
FAILED=$(count FAIL)
PASSED=$(count OK)
SKIPPED=$(count SKIP)
echo "$PASSED ok, $FAILED fail$([ "$SKIPPED" -gt 0 ] && echo ", $SKIPPED skip")"
[ "$FAILED" = 0 ]
