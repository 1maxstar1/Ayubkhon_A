#!/bin/sh
# A release, in one command.
#
#   sh server/release.sh <X.Y.Z> "<note for releases.txt>" --row <file> [--dry]
#
#   <X.Y.Z>   the new version: greater than the one in package.json, and never used before
#   <note>    one line, plain ASCII — what server/releases.txt says next to the version
#   --row     a file with the text of the «Nima» cell for docs/versiyalar.md (what changed, for the owner)
#   --dry     everything up to the commits, then puts package.json and dist/ back
#
# The six steps used to be done by hand, in order, from memory: raise the version, build, run the tests, commit
# and push, then — in a commit of its own — name that commit in server/releases.txt and add a row to
# docs/versiyalar.md. Fourteen releases went out right, and only because each was done carefully: nothing stopped
# a release with a red suite, a version used twice, or a releases.txt line naming the wrong commit — and that
# line is what the Windows laptop installs by itself.
#
# Refused, with nothing changed: a version that is not greater or was used; a working tree with changes; a
# branch behind its remote; a suite that is not green; a reference-price measurement that was not committed;
# (with REFS_KIT) anything of the owner's data in what is about to be committed.
#
# Environment:
#   RELEASE_REGISTRY, RELEASE_SMETA1, RELEASE_SMETA2   real files for the suite (optional; invented ones otherwise)
#   REFS_KIT          the private kit: the reference-price measurement and the privacy check of the commit
#   RELEASE_TRAILER   lines to end both commit messages with
#   RELEASE_SUITE     a command to run instead of the suite — for the test of this script only
set -e
cd "$(dirname "$0")/.."

say() { printf '%s\n' "$*"; }
die() { say "release: $*" >&2; exit 1; }

VER="$1"; NOTE="$2"
[ $# -ge 2 ] || die "usage: sh server/release.sh <X.Y.Z> \"<note>\" --row <file> [--dry]"
shift 2
ROW=""; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --row) ROW="$2"; shift 2 ;;
    --dry) DRY=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

# ------------------------------------------------------------------ what is asked for
printf '%s' "$VER" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "the version must look like 2.9.5 (got «$VER»)"
[ -n "$NOTE" ] || die "the note for releases.txt is empty"
[ "$(printf '%s' "$NOTE" | wc -l)" -eq 0 ] || die "the note must be one line"
if printf '%s' "$NOTE" | LC_ALL=C grep -q '[^ -~]'; then die "the note must be plain ASCII (releases.txt is read by the Windows launcher)"; fi
[ -n "$ROW" ] && [ -s "$ROW" ] || die "--row <file> is needed: the text of the row for docs/versiyalar.md"
if grep -q '|' "$ROW"; then die "the row text must not contain «|» (it is one cell of a table)"; fi
ROWTEXT=$(tr '\n' ' ' < "$ROW" | sed 's/  */ /g; s/^ //; s/ $//')

CUR=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")
node -e "
  const a = process.argv[1].split('.').map(Number), b = process.argv[2].split('.').map(Number);
  const gt = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
  process.exit(gt ? 0 : 1);
" "$VER" "$CUR" || die "v$VER is not greater than the current v$CUR — a version number is never used twice"
if grep -q "^v$VER " server/releases.txt; then die "v$VER is already in server/releases.txt"; fi
if grep -q "^| \*\*v$VER\*\* " docs/versiyalar.md; then die "v$VER already has a row in docs/versiyalar.md"; fi

# ------------------------------------------------------------------ where it is made from
BR=$(git rev-parse --abbrev-ref HEAD)
[ "$BR" != HEAD ] || die "not on a branch"
[ -z "$(git status --porcelain)" ] || die "the working tree has changes — commit them or put them away first:
$(git status --short | head -10)"
git fetch -q origin "$BR" || die "cannot reach origin to see whether the branch is up to date"
git merge-base --is-ancestor "origin/$BR" HEAD || die "the branch is behind origin/$BR — bring it up to date first"

restore() { git checkout -q -- package.json dist 2>/dev/null || true; git checkout -q -- test/refs-parity.stamp 2>/dev/null || true; }

# ------------------------------------------------------------------ the release itself
say "release v$VER (from v$CUR, on $BR)"
sed "s/\"version\": \"$CUR\"/\"version\": \"$VER\"/" package.json > package.json.new && mv package.json.new package.json
grep -q "\"version\": \"$VER\"" package.json || { restore; die "package.json did not take the version"; }
node build.mjs >/dev/null || { restore; die "the build failed"; }
grep -q "v$VER" dist/index.html && grep -q "v$VER" dist/smeta-taqqoslash.html || { restore; die "the built pages do not carry v$VER"; }

say "  the suite …"
if [ -n "$RELEASE_SUITE" ]; then
  sh -c "$RELEASE_SUITE" || { restore; die "the suite is not green — nothing is released"; }
else
  sh test/all.sh "${RELEASE_REGISTRY:-}" "${RELEASE_SMETA1:-}" "${RELEASE_SMETA2:-}" || { restore; die "the suite is not green — nothing is released (test/all-results.txt, test/.log-<name>.txt)"; }
fi
# the measurement writes its stamp anew each time; what counts is that the committed one matches the code
git checkout -q -- test/refs-parity.stamp 2>/dev/null || true
if [ -z "$RELEASE_SUITE" ]; then
  node test/refs-parity.cjs --check-stamp >/dev/null 2>&1 || { restore; die "the reference-price code differs from its committed measurement (test/refs-parity.stamp) — measure and commit that first"; }
fi
OTHER=$(git status --porcelain | grep -v '^ M package.json$' | grep -v '^ M dist/' || true)
[ -z "$OTHER" ] || { restore; die "the build or the suite changed files a release does not carry:
$OTHER"; }

MSG=$(mktemp)
{ printf 'v%s: %s\n' "$VER" "$NOTE"; [ -n "$RELEASE_TRAILER" ] && printf '\n%s\n' "$RELEASE_TRAILER"; } > "$MSG"
git add package.json dist
if [ -n "$REFS_KIT" ]; then
  node test/refs-privacy.cjs --staged --msg "$MSG" >/dev/null 2>&1 || { git reset -q; restore; rm -f "$MSG"; die "the privacy check found the owner's data in the commit — nothing is released"; }
fi

if [ "$DRY" = 1 ]; then
  git reset -q; restore; rm -f "$MSG"
  say "  --dry: v$VER builds, the suite is green, nothing was committed"
  exit 0
fi

push() {
  for wait in 0 2 4 8 16; do
    sleep "$wait"
    if git push -q -u origin "$BR"; then return 0; fi
  done
  return 1
}

git commit -q -F "$MSG"
HASH=$(git rev-parse HEAD)
push || die "the release commit $HASH is made but not pushed. Push it («git push»), then — in a commit of its own —
add the line «v$VER $HASH $NOTE» to server/releases.txt and a row to docs/versiyalar.md"

# ------------------------------------------------------------------ and, in a commit of its own, its listing
printf 'v%s %s %s\n' "$VER" "$HASH" "$NOTE" >> server/releases.txt
node -e "
  const fs = require('fs'), [ver, hash, text] = process.argv.slice(1);
  const lines = fs.readFileSync('docs/versiyalar.md', 'utf8').split('\n');
  let at = -1;
  lines.forEach((l, i) => { if (/^\| \*\*v\d+\.\d+/.test(l)) at = i; });
  if (at < 0) process.exit(1);
  lines.splice(at + 1, 0, '| **v' + ver + '** | ' + text + ' | \`' + hash + '\` |');
  fs.writeFileSync('docs/versiyalar.md', lines.join('\n'));
" "$VER" "$HASH" "$ROWTEXT" || die "docs/versiyalar.md has no table of versions to add the row to (the release commit $HASH is pushed)"
{ printf 'List v%s as a release the Windows laptop installs by itself\n' "$VER"; [ -n "$RELEASE_TRAILER" ] && printf '\n%s\n' "$RELEASE_TRAILER"; } > "$MSG"
git add server/releases.txt docs/versiyalar.md
if [ -n "$REFS_KIT" ]; then
  node test/refs-privacy.cjs --staged --msg "$MSG" >/dev/null 2>&1 || { rm -f "$MSG"; die "the privacy check found the owner's data in the row for docs/versiyalar.md — reword it and commit the listing by hand (the release commit $HASH is pushed)"; }
fi
git commit -q -F "$MSG"
rm -f "$MSG"
push || die "the listing is committed but not pushed — «git push» finishes the release"

say "released v$VER = $HASH"
say "  Windows:  C:\\Smeta\\server\\laptop.cmd update      (or by itself)"
say "  Mac:      https://github.com/1maxstar1/Ayubkhon_A/archive/$HASH.zip   (see README, «Yangilash»)"
