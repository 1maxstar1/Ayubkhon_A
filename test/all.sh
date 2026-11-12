#!/bin/sh
# Runs every test in order and prints a pass/fail summary with timings.
#   sh test/all.sh [registry.xls] [smeta1.xlsx] [smeta2.xlsx]
# The browser tests need: npm i -D playwright && npx playwright install chromium
cd "$(dirname "$0")/.."
REG="$1"; S1="$2"; S2="$3"
OUT=test/all-results.txt
: > "$OUT"
# No server a test starts (the laptop launchers' included) fetches the exchange's weekly quotes by itself: the
# UZEX tests point the sync at their own stand-in site.
UZEX_AUTO=0; export UZEX_AUTO

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
  echo "  Fayllarsiz ham ishlaydi — u holda butun dastur testlari o'ylab topilgan"
  echo "  ikki smetada (test/synth.cjs) ishlaydi. Ishlay olmaydiganlari (egasining"
  echo "  fayllari yoki maxfiy to'plami kerak bo'lganlar, pwsh yoki playwright yo'q)"
  echo "  jadvalda SKIP deb, sababi bilan ko'rinadi:"
  echo
  echo "      sh test/all.sh"
  exit 1
done

# The tests of the whole program — the pipeline, the page in a browser, the workspace, the hints between
# applications — need estimates. The owner's are not in the repository. Given none, those tests used to be
# skipped, which left the larger half of the program untested everywhere but on one machine; they now run on
# two invented estimates (test/synth.cjs). Only the measurement of «Похожие ресурсы» stays with real files:
# it judges names by prices, and invented names have nothing to say about that.
SYN=0; HINT2="$S2"
if [ -z "$S1" ]; then
  SYN=1; S1=test/.synth-1.xlsx; S2=test/.synth-2.xlsx
  node test/synth.cjs "$S1" "$S2" >/dev/null || { echo "sintetik smeta yaratilmadi"; exit 1; }
elif [ -z "$S2" ]; then
  # one real estimate given: the tests that take two get an invented second
  S2=test/.synth-2.xlsx
  node test/synth.cjs test/.synth-1.xlsx "$S2" >/dev/null || { echo "sintetik smeta yaratilmadi"; exit 1; }
fi

# The browser tests need a browser. Without playwright each of them ends in the
# same twelve-line «Cannot find package» trace, which reads like seven separate
# failures of the program rather than one missing dependency.
if node -e "require.resolve('playwright')" 2>/dev/null; then PW=1; else PW=0; fi
# The Windows launcher is checked under PowerShell when there is one.
PWSH="${PWSH:-$(command -v pwsh 2>/dev/null)}"; export PWSH

# A test that exits 77 (the automake convention) had nothing it could measure and says why on its last line:
# shown as SKIP with that reason, not as a pass and not as a failure.
run() {
  NAME="$1"; shift
  printf '%-22s ' "$NAME"
  T0=$(date +%s)
  "$@" >"test/.log-$NAME.txt" 2>&1
  RC=$?
  if [ "$RC" = 0 ]; then R=OK; elif [ "$RC" = 77 ]; then R=SKIP; else R=FAIL; fi
  T=$(( $(date +%s) - T0 ))
  if [ "$R" = SKIP ]; then
    printf '%-4s %3ss   %s\n' "$R" "$T" "$(grep -v '^[[:space:]]*$' "test/.log-$NAME.txt" | tail -1 | cut -c1-110)"
  else
    printf '%-4s %3ss\n' "$R" "$T"
  fi
  printf '%s\t%s\t%s\n' "$NAME" "$R" "$T" >> "$OUT"
  [ "$R" = FAIL ] && tail -15 "test/.log-$NAME.txt"
  return 0
}
skip() {
  printf '%-22s %-4s %3s   %s\n' "$1" "SKIP" "-" "$2"
  printf '%s\tSKIP\t0\n' "$1" >> "$OUT"
}
# A browser test with no browser is skipped by name rather than left out of the summary: a run that says «20 ok»
# and lists twenty tests is telling the truth about a suite of twenty-five only if it says which five it did not
# run. (There are always estimates now — the given ones or the invented — so nothing is skipped for want of one.)
browser_run() { if [ "$PW" = 1 ]; then run "$@"; else skip "$1" "playwright o'rnatilmagan: npm i -D playwright && npx playwright install chromium"; fi; }
# The Windows launcher's test runs on Linux only (GNU tools, /proc, the Linux PocketBase): elsewhere it is skipped
# with the reason, not run into a failure that points at nothing (releases are made on Linux, server/release.sh).
pwsh_run() {
  if [ "$(uname -s)" != Linux ]; then skip "$1" "faqat Linux'da ishlaydi (relizlar Linux'da qilinadi)"
  elif [ -n "$PWSH" ] && [ -x "$PWSH" ]; then run "$@"
  else skip "$1" "pwsh (PowerShell) o'rnatilmagan"; fi
}

echo "test                   sonuc  vaqt"
echo "-----------------------------------"
# First, before anything is built: the privacy check compares dist/ with a fresh build of src. Run after the
# suite had rebuilt dist/ it compared a build with itself and could never fail — in CI, a commit whose dist/ was
# not built from its src went through green. (Changed src locally? «node build.mjs» before the suite.)
run refs-privacy     node test/refs-privacy.cjs
# built once for every test: test/server.mjs skips its own build when this is set — and only when the build
# worked, so that a failed one leaves each test to build (and fail) by itself rather than run on the last build
if node build.mjs --serve >/dev/null; then TEST_BUILT=1; export TEST_BUILT; fi
run build            node build.mjs
run normalize        node test/normalize.cjs
run num              node test/num.cjs
run xlsx-guard       node test/xlsx-guard.cjs
run pb-err           node test/pb-err.cjs
run ui-language      node test/ui-language.cjs
run smeta-form4a     node test/smeta-form4a.cjs
run smeta-header     node test/smeta-header.cjs
run compare          node test/compare.cjs
run export-formulas  node test/export-formulas.cjs
run worker-parity    node test/worker-parity.cjs
run uzex             node test/uzex.cjs
run sections         node test/sections.cjs
run regions          node test/regions.cjs
run refs             node test/refs.cjs
# The reference-price tables change only with measurement (CLAUDE.md). The measurement needs the private kit
# (REFS_KIT: the owner's package and the goldens, never in the repository); without it the stamp of the last
# measurement must still match the code — a change that was never measured is a failure, not a skip.
if [ -n "$REFS_KIT" ]; then
  run refs-parity    node test/refs-parity.cjs
elif PARITY=$(node test/refs-parity.cjs --check-stamp 2>&1); then
  skip refs-parity "$PARITY"
else
  printf '%-22s %-12s %s\n' refs-parity "NOT MEASURED" "$PARITY"
  printf 'refs-parity\tFAIL\t0\n' >> "$OUT"
fi
if [ -n "$REFS_KIT" ] && [ "$SYN" = 0 ]; then run refs-measure node test/refs-measure.cjs "$S1"; else skip refs-measure "REFS_KIT yoki smeta berilmagan"; fi
run pipeline         node test/pipeline.cjs "$S1" "$S2" --out test/out.xlsx
# «Похожие ресурсы» is measured on real estimates only, against the private baseline (REFS_KIT) when there is one;
# with invented estimates the stamp of the last measurement must still match the similarity code — a change that
# was never measured is a failure, not a skip (CLAUDE.md), the same as the reference prices.
# With the kit and no estimates given, every recorded set found on this machine is measured all the same.
if [ "$SYN" = 0 ]; then
  if [ -n "$HINT2" ]; then run hints node test/hints.cjs "$S1" "$HINT2"; else run hints node test/hints.cjs "$S1"; fi
elif [ -n "$REFS_KIT" ]; then
  run hints node test/hints.cjs --recorded
elif HINTSAYS=$(node test/hints.cjs --check-stamp 2>&1); then
  skip hints "$HINTSAYS (o'lchov faqat haqiqiy smetada)"
else
  printf '%-22s %-12s %s\n' hints "NOT MEASURED" "$HINTSAYS"
  printf 'hints\tFAIL\t0\n' >> "$OUT"
fi
run registry-parse   node test/registry.cjs
run backup-prune     node test/backup-prune.cjs
run deploy-target    sh test/deploy-target.sh
run release-script   sh test/release-script.sh
run pb-smoke         sh test/pb-smoke.sh
run server-helper    node test/server-helper.mjs
run laptop-backup    sh test/laptop-backup.sh
run install          node test/install.mjs
run registry-import  sh test/registry-import.sh
run admin-api        sh test/admin-api.sh
run dedupe           node test/dedupe.mjs
run mail-otp         node test/mail-otp.mjs
run match-keys       node test/match-keys.mjs
run corrections-bulk node test/corrections-bulk.mjs
run refs-api         node test/refs-api.mjs
run uzex-api         node test/uzex-api.mjs
run ownership        node test/ownership.mjs
run disable-user     node test/disable-user.mjs
browser_run browser      node test/browser.mjs "$S1" "$S2"
browser_run price-book   node test/price-book.mjs
browser_run layout-1366  node test/layout-1366.mjs
browser_run version-notice node test/version-notice.mjs
browser_run server-down  node test/server-down.mjs
browser_run e2e-auth     node test/e2e-auth.mjs
browser_run laptop       node test/laptop.mjs
pwsh_run  laptop-windows sh test/laptop-windows.sh
browser_run e2e-admin    node test/e2e-admin.mjs
browser_run e2e-refs     node test/e2e-refs.mjs
browser_run e2e-uzex     node test/e2e-uzex.mjs
browser_run e2e-compare  node test/e2e-compare.mjs
browser_run e2e-compare-keep node test/e2e-compare-keep.mjs
browser_run upload-order node test/upload-order.mjs
browser_run upload-fail  node test/upload-fail.mjs
browser_run two-tabs     node test/two-tabs.mjs
browser_run close-tab    node test/close-tab.mjs
browser_run state-size   node test/state-size.mjs
browser_run e2e-workspace node test/e2e-workspace.mjs "$S1" "$S2"
browser_run e2e-hints    node test/e2e-hints.mjs "$S1"
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
