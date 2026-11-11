#!/bin/sh
# The release script (server/release.sh), in a throwaway copy of the repository with a throwaway «origin».
#
# A release is two commits whose order and content the Windows laptop depends on: the release commit carries the
# version and the built pages; a later commit names that very commit in server/releases.txt. Held here: the
# script makes exactly that, pushes both, and refuses — changing nothing — a version that is not new, a tree
# with changes, a suite that is not green, and a note the launcher could not read.
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
cp server/release.sh "$T/work/server/release.sh"
git init -q --bare "$T/origin.git"
cd "$T/work"
git init -q . && git checkout -q -b release-test
git config user.email test@example.com; git config user.name Test
BR=release-test
git add -A; git commit -q -m "the repository under test"
git remote add origin "$T/origin.git"
git push -q -u origin "$BR" 2>/dev/null || { echo "FAIL cannot set up the throwaway origin"; exit 1; }
CUR=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")
NEXT=$(node -e "const v=process.argv[1].split('.').map(Number); process.stdout.write(v[0]+'.'+v[1]+'.'+(v[2]+1))" "$CUR")
printf '%s\n%s\n' '**Sinov relizi.** Ikki qatorli matn,' 'bitta katakka yoziladi.' > "$T/row.md"
HEAD0=$(git rev-parse HEAD)
unchanged() { [ "$(git rev-parse HEAD)" = "$HEAD0" ] && [ -z "$(git status --porcelain)" ]; }
# Without the private kit: the privacy check of a commit reads the history it is added to, and this repository
# has a history of one commit made a moment ago. That check has a test of its own (test/refs-privacy.cjs).
run() { REFS_KIT= RELEASE_SUITE="${SUITE:-true}" sh server/release.sh "$@" >"$T/out.txt" 2>&1; }

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
SUITE=false run "$NEXT" "red suite" --row "$T/row.md"; R=$?
[ $R != 0 ] && grep -q "suite is not green" "$T/out.txt" && unchanged; check $? "a suite that is not green: nothing is released, package.json and dist are put back"
run "$NEXT" "dry run" --row "$T/row.md" --dry; R=$?
[ $R = 0 ] && grep -q "nothing was committed" "$T/out.txt" && unchanged; check $? "--dry goes through every check and commits nothing"

# ---- a release
run "$NEXT" "test release: nothing of substance" --row "$T/row.md"; R=$?
check $R "a release goes through ($(tail -3 "$T/out.txt" | head -1 | cut -c1-60))"
N=$(git rev-list --count "$HEAD0"..HEAD)
[ "$N" = 2 ]; check $? "it is two commits ($N)"
REL=$(git rev-parse HEAD~1)
git show --stat --format= HEAD~1 | grep -q "package.json" && git show --stat --format= HEAD~1 | grep -q "dist/index.html" \
  && ! git show --stat --format= HEAD~1 | grep -q "releases.txt"; check $? "the first carries the version and the built pages, and not the listing"
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

# ---- the same version again
run "$NEXT" "again" --row "$T/row.md"; R=$?
[ $R != 0 ] && [ "$(git rev-list --count "$HEAD0"..HEAD)" = 2 ]; check $? "the version just released cannot be released again"

if [ "$FAIL" = 0 ]; then echo "release-script OK"; else echo "FAILED ($FAIL)"; cat "$T/out.txt" | tail -5; fi
[ "$FAIL" = 0 ]
