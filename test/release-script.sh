#!/bin/sh
# The release script (server/release.sh), in a throwaway copy of the repository with a throwaway «origin».
#
# A release is two commits whose order and content the Windows laptop depends on: the release commit carries the
# version and the built pages; a later commit names that very commit in server/releases.txt. Held here: the
# script makes exactly that, pushes both, and refuses — changing nothing — a version that is not new, a tree
# with changes, a suite that is not green (by its exit code or by its results), a suite that skipped or did not
# run a test a release may not go without, a note the launcher could not read, and a commit the privacy check
# refuses — saying whether that is the owner's data or something else; stopped half-way (a signal, a failing
# commit hook) it puts everything back; a measurement just made, or left by an earlier run, goes into the release;
# a branch not yet on origin is no obstacle, and is not mistaken for another branch ending in the same name; a --row
# path is read from where the script was started, and one not there is said to be not found; results naming a test
# the script does not know refuse the release; origin moving on during the release refuses the push with «drop the
# release commit», never «rebase it».
#
# The suite is stood in for by a command that writes test/all-results.txt the way test/all.sh does.
#
#   sh test/release-script.sh
cd "$(dirname "$0")/.."
ROOT=$(pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
FAIL=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; FAIL=$((FAIL + 1)); }
check() { if [ "$1" = 0 ]; then ok "$2"; else bad "$2"; fi; }

# The copy: the files committed here now, as a repository of its own with one commit — not a clone, because
# this checkout may be a shallow one (CI's is), and a shallow history cannot be pushed to a new «origin».
mkdir "$T/work"
git archive HEAD | tar -x -C "$T/work" || { echo "FAIL cannot copy the repository"; exit 1; }
# the script under test and what it reads, as they are in this working tree
cp server/release.sh "$T/work/server/release.sh"
cp test/all.sh "$T/work/test/all.sh"
for f in test/refs-parity.stamp test/hints.stamp; do [ -f "$f" ] && cp "$f" "$T/work/$f"; done
git init -q --bare "$T/origin.git"
cd "$T/work"
git init -q . && git checkout -q -b release-test
git config user.email test@example.com; git config user.name Test
git config core.hooksPath .git/hooks          # this repository's hooks, whatever the machine's own git config says
BR=release-test
git add -A; git commit -q -m "the repository under test"
git remote add origin "$T/origin.git"
git push -q -u origin "$BR" 2>/dev/null || { echo "FAIL cannot set up the throwaway origin"; exit 1; }
CUR=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")
NEXT=$(node -e "const v=process.argv[1].split('.').map(Number); process.stdout.write(v[0]+'.'+v[1]+'.'+(v[2]+1))" "$CUR")
printf '%s\r\n%s\r\n' '**Sinov relizi.** Ikki qatorli matn,' 'bitta katakka yoziladi.' > "$T/row.md"   # saved on Windows: CRLF
HEAD0=$(git rev-parse HEAD)
unchanged() { [ "$(git rev-parse HEAD)" = "$HEAD0" ] && [ -z "$(git status --porcelain)" ]; }
# what a green suite leaves: every test test/all.sh lists OK, but the skips a release may go without
REQ=$(sh server/release.sh --list-tests | grep -v -x -e hints -e refs-measure | tr '\n' ' ')
results() {   # results <name>=<OK|SKIP|FAIL> … — the command a suite stand-in runs: every required test OK unless named
  R_LINES=""
  for t in $REQ hints refs-measure; do
    R_ST=OK; case "$t" in hints|refs-measure) R_ST=SKIP ;; esac
    for kv in "$@"; do [ "${kv%%=*}" = "$t" ] && R_ST="${kv#*=}"; done
    R_LINES="$R_LINES$t\\t$R_ST\\t1\\n"
  done
  printf "printf '%s' > test/all-results.txt" "$R_LINES"
}
GREEN=$(results)
# Run the script with `suite` standing in for test/all.sh. The suite is an argument, not a variable set in front
# of the call: in front of a shell function such a variable outlives the call in some shells (macOS /bin/sh,
# bash 3.2 in POSIX mode) and every later run would have inherited it. Without the private kit: the privacy
# check of a commit reads the history it is added to, and this repository has one commit made a moment ago —
# that check has a test of its own (test/refs-privacy.cjs).
run_with() {
  RW_SUITE="$1"; shift
  # nothing of the calling environment reaches the run under test but what is named here
  env -u RELEASE_TRAILER -u RELEASE_PRIVACY -u RELEASE_REGISTRY -u RELEASE_SMETA1 -u RELEASE_SMETA2 \
    REFS_KIT= RELEASE_SUITE="$RW_SUITE" sh server/release.sh "$@" >"$T/out.txt" 2>&1
}
privacy_with() { RP_CMD="$1"; shift; env RELEASE_PRIVACY="$RP_CMD" REFS_KIT= RELEASE_SUITE="$GREEN" sh server/release.sh "$@" >"$T/out.txt" 2>&1; }
run() { run_with "$GREEN" "$@"; }

# ---- refused, nothing changed
run "$CUR" "same version" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "not greater" "$T/out.txt" && unchanged; check $? "the current version again is refused, nothing changed"
run 0.0.1 "an older version" --row "$T/row.md"; R=$?
[ $R != 0 ] && unchanged; check $? "an older version is refused"
run "$NEXT" "no row" ; R=$?
[ $R != 0 ] && grep -q -- "--row" "$T/out.txt" && unchanged; check $? "without the row for docs/versiyalar.md it is refused"
run "$NEXT" "narx yo‘qolmaydi" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "ASCII" "$T/out.txt" && unchanged; check $? "a note that is not plain ASCII is refused"
echo x > stray.txt
run "$NEXT" "dirty tree" --row "$T/row.md"; R=$?
rm -f stray.txt
[ $R != 0 ] && grep -q "working tree has changes" "$T/out.txt" && unchanged; check $? "a working tree with changes is refused"
run_with "$GREEN; false" "$NEXT" "red suite" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "suite is not green" "$T/out.txt" && unchanged; check $? "a suite that is not green: nothing is released, package.json and dist are put back"
run_with "$(results laptop-windows=SKIP)" "$NEXT" "no powershell" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "skipped tests a release may not go without: laptop-windows" "$T/out.txt" && grep -q "runs on Linux with PowerShell" "$T/out.txt" && unchanged
check $? "a suite that skipped the Windows launcher test is refused, though it says «0 fail», and says where releases are made"
run_with "$(results browser=SKIP e2e-workspace=SKIP)" "$NEXT" "no browser" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "may not go without: browser e2e-workspace" "$T/out.txt" && unchanged
check $? "so is one that skipped the browser tests"
export RELEASE_ALLOW_SKIP=laptop-windows       # what an earlier version of the script took as leave to skip
run_with "$(results laptop-windows=SKIP)" "$NEXT" "no way round" --row "$T/row.md"; R=$?
unset RELEASE_ALLOW_SKIP
[ $R != 0 ] && unchanged; check $? "and there is no way round it"
run_with "$(results pipeline=FAIL)" "$NEXT" "a failure the exit code missed" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "the suite has failures: pipeline" "$T/out.txt" && unchanged; check $? "a FAIL in the results refuses the release, whatever the suite's exit code"
run_with "$(results) && grep -v '^e2e-workspace' test/all-results.txt > test/.r && mv test/.r test/all-results.txt" "$NEXT" "a test gone" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "did not run tests a release may not go without: e2e-workspace" "$T/out.txt" && unchanged
check $? "a test missing from the results (renamed, dropped) refuses it too — any test the suite lists"
[ "$(echo "$REQ" | wc -w)" -gt 40 ]; check $? "the tests a release needs are every test test/all.sh runs ($(echo "$REQ" | wc -w) of them), not a hand-kept list"
run_with 'true' "$NEXT" "no results" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "left no test/all-results.txt" "$T/out.txt" && unchanged; check $? "a suite that leaves no results is not taken for a green one"
run_with 'kill -TERM $PPID; sleep 2' "$NEXT" "stopped" --row "$T/row.md"; R=$?
[ $R = 143 ] && grep -q "stopped — package.json and dist/ are put back" "$T/out.txt" && ! grep -q "left no" "$T/out.txt" && unchanged
check $? "stopped half-way by a signal, it puts package.json and dist back (exit $R)"
printf '#!/bin/sh\necho "hook says no" >&2\nexit 1\n' > .git/hooks/pre-commit; chmod +x .git/hooks/pre-commit
run "$NEXT" "hook" --row "$T/row.md"; R=$?
rm -f .git/hooks/pre-commit
[ $R != 0 ] && unchanged && [ -z "$(git diff --cached --name-only)" ]; check $? "a commit refused by a hook leaves nothing changed and nothing staged"
# the privacy check: the owner's data, something else it refuses, and the check unable to run — each said for what it is
privacy_with 'echo "HIT  real-price  docs/x.md:3"; echo "HIT  vendor-changed  src/vendor/a.js"; echo "FAILED: 2 hits"; exit 1' "$NEXT" "data" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "found the owner's data in the release commit .*(1 of 2 hits)" "$T/out.txt" && grep -q "real-price" "$T/out.txt" && unchanged
check $? "a commit with the owner's data in it is refused, and the data lines are named"
privacy_with 'echo "HIT  dist-not-a-fresh-build  dist/index.html"; echo "  dist/ is not a build of this src: run «node build.mjs» (and commit dist/)"; echo "FAILED: 1 hits"; exit 1' "$NEXT" "stale dist" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "though not for the owner's data" "$T/out.txt" && grep -q "node build.mjs" "$T/out.txt" && ! grep -q "found the owner's data" "$T/out.txt" && unchanged
check $? "a stale dist/ is refused as what it is, not as a leak, with the remedy"
privacy_with 'echo "REFS_KIT/pkg has no package (/kit/pkg)" >&2; exit 2' "$NEXT" "no package" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "could not run (exit 2) on the release commit" "$T/out.txt" && grep -q "has no package" "$T/out.txt" && unchanged
check $? "a privacy check that cannot run says so, and why"
run "$NEXT" "dry run" --row "$T/row.md" --dry; R=$?
[ $R = 0 ] && grep -q "nothing was committed" "$T/out.txt" && unchanged; check $? "--dry goes through every check and commits nothing"
git push -q origin "$BR:refs/heads/feature/not-on-origin" 2>/dev/null     # another branch ending in the same name
git checkout -q -b not-on-origin
run "$NEXT" "a new branch" --row "$T/row.md" --dry; R=$?
git checkout -q "$BR"; git branch -q -D not-on-origin
[ $R = 0 ] && grep -q "not on origin yet: the release pushes it" "$T/out.txt"
check $? "a branch not yet on origin is not «cannot reach origin», though origin has feature/<the same name>"
git remote set-url origin "$T/nowhere.git"
run "$NEXT" "no origin" --row "$T/row.md" --dry; R=$?
git remote set-url origin "$T/origin.git"
[ $R != 0 ] && grep -q "cannot reach origin" "$T/out.txt" && grep -Eqi "nowhere.git|not appear to be a git repository|does not exist" "$T/out.txt" && unchanged
check $? "an origin that does not answer is said as such, with git's own reason"

# the stand-ins are for this test only: with an origin that is not on this machine they are refused, nothing changed
git remote set-url origin https://example.invalid/somewhere.git
run "$NEXT" "a stand-in in a real release" --row "$T/row.md" --dry; R=$?
git remote set-url origin "$T/origin.git"
[ $R != 0 ] && grep -q "for the test of this script only" "$T/out.txt" && unchanged; check $? "a stand-in suite is refused when origin is a real remote"
REFS_KIT= sh server/release.sh "$NEXT" "no row file" --row >"$T/out.txt" 2>&1; R=$?
[ $R != 0 ] && grep -q -- "--row needs a file" "$T/out.txt" && unchanged; check $? "--row without its file is said in words"
# a path given from another directory is read where it was given, and a missing one is said as such
( cd "$T" && env -u RELEASE_TRAILER REFS_KIT= RELEASE_SUITE="$GREEN" sh work/server/release.sh "$NEXT" "row from elsewhere" --row row.md --dry ) >"$T/out.txt" 2>&1; R=$?
[ $R = 0 ] && unchanged; check $? "--row given relative to the directory the script was started from is found there"
run "$NEXT" "missing row" --row "$T/no-such-row.md"; R=$?
[ $R != 0 ] && grep -q "no-such-row.md not found" "$T/out.txt" && unchanged; check $? "a --row file that is not there is said to be not found"
# results naming a test the release script does not know: its reading of test/all.sh is out of date
run_with "$GREEN; printf 'mystery\\tOK\\t1\\n' >> test/all-results.txt" "$NEXT" "unknown test" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "does not know: mystery" "$T/out.txt" && unchanged; check $? "a test in the results the release script does not know refuses the release"
# origin moves on while the suite runs: the release push is refused, and the advice is to drop the release commit, not
# to rebase it (releases.txt must name the commit as it is on origin)
AHEAD="$GREEN; git clone -q -b $BR '$T/origin.git' '$T/other' && cd '$T/other' && git -c user.email=a@b -c user.name=A commit -q --allow-empty -m ahead && git push -q origin HEAD:$BR"
run_with "$AHEAD" "$NEXT" "origin ahead" --row "$T/row.md"; R=$?
grep -q "Do not rebase it" "$T/out.txt" && grep -q "git reset -q HEAD~1 && git checkout -- package.json dist" "$T/out.txt" && ! grep -q "Finish by hand" "$T/out.txt"
G=$?; [ $R != 0 ] && [ $G = 0 ] && ! grep -q "^v$NEXT " server/releases.txt; check $? "origin ahead at the release push: refused, with «drop the release commit» (its measurements kept) and no contrary «git push» advice, no listing written"
git reset -q --hard "$HEAD0"; git push -q -f origin "$HEAD0:refs/heads/$BR" 2>/dev/null; rm -rf "$T/other"
unchanged; check $? "(the throwaway repository is put back)"

# ---- a release, with a measurement its suite made and one an earlier run left in the tree
printf '{"code": "left-by-a-dry-run"}\n' > test/hints.stamp
MEASURED="$GREEN; printf '{\"code\": \"0123456789abcdef\", \"result\": \"identical\"}\n' > test/refs-parity.stamp"
run_with "$MEASURED" "$NEXT" "test release: nothing of substance" --row "$T/row.md"; R=$?
check $R "a release goes through ($(tail -3 "$T/out.txt" | head -1 | cut -c1-60))"
N=$(git rev-list --count "$HEAD0"..HEAD)
[ "$N" = 2 ]; check $? "it is two commits ($N)"
REL=$(git rev-parse HEAD~1)
git show --stat --format= HEAD~1 | grep -q "package.json" && git show --stat --format= HEAD~1 | grep -q "dist/index.html" \
  && ! git show --stat --format= HEAD~1 | grep -q "releases.txt"; check $? "the first carries the version and the built pages, and not the listing"
git show --stat --format= HEAD~1 | grep -q "refs-parity.stamp" && git show HEAD~1:test/refs-parity.stamp | grep -q 0123456789abcdef
check $? "and the measurement the suite made — kept, not put back to the old stamp"
git show HEAD~1:test/hints.stamp 2>/dev/null | grep -q left-by-a-dry-run && git log -1 --format=%B HEAD~1 | grep -q "measurements it carries"
check $? "and the one an earlier run left, the commit message naming both"
git show HEAD~1:package.json | grep -q "\"version\": \"$NEXT\"" && git show HEAD~1:dist/index.html | grep -q "v$NEXT"; check $? "package.json and the pages of that commit say v$NEXT"
LAST=$(tail -1 server/releases.txt)
[ "$LAST" = "v$NEXT $REL test release: nothing of substance" ]; check $? "the second adds the line to releases.txt, naming the first by its full hash"
git show --stat --format= HEAD | grep -q "releases.txt" && git show --stat --format= HEAD | grep -q "versiyalar.md" \
  && ! git show --stat --format= HEAD | grep -q "dist/"; check $? "and touches only the listing and the table of versions"
grep -q "^| \*\*v$NEXT\*\* | \*\*Sinov relizi.\*\* Ikki qatorli matn, bitta katakka yoziladi. | \`$REL\` |$" docs/versiyalar.md; check $? "the row is in docs/versiyalar.md, one line, with the commit"
PREV=$(grep -n "^| \*\*v$CUR\*\* " docs/versiyalar.md | cut -d: -f1); NEW=$(grep -n "^| \*\*v$NEXT\*\* " docs/versiyalar.md | cut -d: -f1)
[ -n "$PREV" ] && [ "$NEW" = $((PREV + 1)) ]; check $? "right under the row of the version before it"
[ "$(git --git-dir="$T/origin.git" rev-parse "$BR")" = "$(git rev-parse HEAD)" ]; check $? "both commits are pushed"
[ -z "$(git status --porcelain)" ]; check $? "and the working tree is clean"

grep -q "$(printf '\r')" docs/versiyalar.md; [ $? != 0 ]; check $? "a row saved with CRLF lands as one clean line"

# ---- the same version again
run "$NEXT" "again" --row "$T/row.md"; R=$?
[ $R != 0 ] && [ "$(git rev-list --count "$HEAD0"..HEAD)" = 2 ]; check $? "the version just released cannot be released again"

# ---- refused after the release commit is pushed: what is left is said as it is, and nothing is said twice
NEXT2=$(node -e "const v=process.argv[1].split('.').map(Number); process.stdout.write(v[0]+'.'+v[1]+'.'+(v[2]+1))" "$NEXT")
printf '#!/bin/sh\ngit diff --cached --name-only | grep -q releases.txt && { echo "hook: not the listing" >&2; exit 1; }\nexit 0\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
run "$NEXT2" "listing refused" --row "$T/row.md"; R=$?
rm -f .git/hooks/pre-commit
[ $R != 0 ] && grep -q "is pushed; server/releases.txt and docs/versiyalar.md are written (and staged)" "$T/out.txt" \
  && ! grep -q "Finish by hand" "$T/out.txt" && [ "$(grep -c "^v$NEXT2 " server/releases.txt)" = 1 ] \
  && [ "$(git --git-dir="$T/origin.git" rev-parse "$BR")" = "$(git rev-parse HEAD)" ]
check $? "a listing commit refused after the release is pushed: says it is written and staged, the line is there once, and no «add the line» advice"
git reset -q --hard HEAD

if [ "$FAIL" = 0 ]; then echo "release-script OK"; else echo "FAILED ($FAIL)"; tail -5 "$T/out.txt"; fi
[ "$FAIL" = 0 ]
