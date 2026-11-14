#!/bin/sh
# A release, in one command.
#
#   sh server/release.sh <X.Y.Z> "<note for releases.txt>" --row <file> [--dry]
#
#   <X.Y.Z>   the new version: greater than the one in package.json, and never used before
#   <note>    one line, plain ASCII — what server/releases.txt says next to the version
#   --row     a file with the text of the «Nima» cell for docs/versiyalar.md (what changed, for the owner)
#   --dry     everything up to the commits, then puts package.json and dist/ back
#   --unlisted   the release is made and pushed, its row is added to docs/versiyalar.md, but server/releases.txt is
#             left alone: the Windows laptop does not install it by itself. For a version the owner is to try first
#             (docs/ai-reja.md); afterwards:
#   sh server/release.sh --list <X.Y.Z>     adds that release's line to server/releases.txt (its commit is read
#             from its row in docs/versiyalar.md, its note from the release commit), in a commit of its own, and pushes
#
# The six steps used to be done by hand, in order, from memory: raise the version, build, run the tests, commit
# and push, then — in a commit of its own — name that commit in server/releases.txt and add a row to
# docs/versiyalar.md. Fourteen releases went out right, and only because each was done carefully: nothing stopped
# a release with a red suite, a version used twice, or a releases.txt line naming the wrong commit — and that
# line is what the Windows laptop installs by itself.
#
# Refused, with nothing changed: a version that is not greater or was used; a working tree with changes; a
# branch behind its remote; a suite that is not green; a suite that skipped, or did not run, a test a release may
# not go without (every test test/all.sh lists must be OK, or one of SKIP_OK; there is no way around this: the
# Windows laptop installs what is listed by itself); code that differs from its measurement (the reference prices,
# the similarity); a machine that is not Linux, or one without PowerShell or playwright; a branch other than the one
# the Windows laptop reads server/releases.txt from; (with REFS_KIT) anything of the owner's data in what is about to be
# committed. Stopped half-way — Ctrl-C, a failing commit hook — package.json and dist/ are put back.
#
# Releases are made on Linux with PowerShell (PWSH=<path to pwsh>): test/laptop-windows.sh runs the Windows
# launcher under pwsh against the Linux PocketBase binary, with GNU tools and /proc, and does not run on a Mac.
#
# A measurement the suite has just made — test/refs-parity.stamp, test/hints.stamp: written by a measurement that
# passed (or, for the similarity, a recording a person accepted) — goes into the release commit, never back to the
# old stamp (CLAUDE.md). So does one left in the tree by an earlier run (a --dry run, a refused release): it is the
# only change the tree may have.
#
# Environment:
#   RELEASE_REGISTRY, RELEASE_SMETA1, RELEASE_SMETA2   real files for the suite (optional; invented ones otherwise)
#   REFS_KIT          the private kit: the measurements, and the privacy check of the commit
#   PWSH              PowerShell, for the Windows launcher's test
#   RELEASE_TRAILER   lines to end both commit messages with
#   RELEASE_SUITE     for the test of this script only: a command run instead of the suite; it writes
#                     test/all-results.txt the way the suite does
#   RELEASE_PRIVACY   for the test of this script only: a command run instead of the privacy check
#   Both are refused unless origin is a repository on this machine (as in test/release-script.sh): in a real
#   release they would put a stand-in in the place of the suite or of the privacy check.
#
#   sh server/release.sh --list-tests     the tests a release needs: every name test/all.sh runs
set -e
FROM=$(pwd)                       # where the paths given (--row, RELEASE_*) were written from
cd "$(dirname "$0")/.."

say() { printf '%s\n' "$*"; }
die() { say "release: $*" >&2; exit 1; }

# Every name test/all.sh gives a test: what a release needs from the results.
listed_tests() {
  grep -oE '(^|[;&|{(]|then|else)[[:space:]]*(run|browser_run|pwsh_run|skip)[[:space:]]+[a-z][a-z0-9-]*' test/all.sh |
    awk '{ print $NF }' | sort -u
}
if [ "${1:-}" = --list-tests ]; then listed_tests; exit 0; fi

# The branch the Windows laptop reads server/releases.txt from (server/laptop.ps1, server/install-windows.ps1): a
# release listed on any other is never installed.
RELEASE_BRANCH=claude/excel-price-validation-5ehbvb

# ------------------------------------------------------------------ --list: a release made with --unlisted, now tried
if [ "${1:-}" = --list ]; then
  VER="${2:-}"
  printf '%s' "$VER" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "usage: sh server/release.sh --list <X.Y.Z>"
  if grep -q "^v$VER " server/releases.txt; then die "v$VER is already in server/releases.txt"; fi
  HASH=$(sed -n "s/^| \*\*v$VER\*\* | .* | \`\([0-9a-f]\{40\}\)\` |\$/\1/p" docs/versiyalar.md | head -1)
  [ -n "$HASH" ] || die "docs/versiyalar.md has no row for v$VER naming its commit — only a release this script made can be listed"
  git cat-file -e "$HASH^{commit}" 2>/dev/null || die "the release commit $HASH of v$VER is not in this checkout"
  git show "$HASH:package.json" | grep -q "\"version\": \"$VER\"" || die "the commit $HASH does not carry v$VER in package.json"
  git merge-base --is-ancestor "$HASH" HEAD || die "the release commit $HASH is not in this branch"
  NOTE=$(git log -1 --format=%s "$HASH" | sed -n "s/^v$VER: //p")
  [ -n "$NOTE" ] || die "the release commit $HASH has no «v$VER: <note>» subject to take the note from"
  if printf '%s' "$NOTE" | LC_ALL=C grep -q '[^ -~]'; then die "the note of $HASH is not plain ASCII (releases.txt is read by the Windows launcher)"; fi
  BR=$(git rev-parse --abbrev-ref HEAD)
  case "$(git remote get-url origin 2>/dev/null)" in
    /*|file://*) ;;                  # the test of this script: a throwaway origin on this machine
    *) [ "$BR" = "$RELEASE_BRANCH" ] || die "releases are listed on $RELEASE_BRANCH — the branch the Windows laptop reads server/releases.txt from (on $BR)" ;;
  esac
  [ -z "$(git status --porcelain)" ] || die "the working tree has changes — commit them or put them away first"
  REMOTE=$(git ls-remote origin "refs/heads/$BR" | awk 'NR == 1 { print $1 }')
  [ -n "$REMOTE" ] || die "cannot read $BR from origin"
  git cat-file -e "$REMOTE^{commit}" 2>/dev/null || git fetch -q origin "$BR" || die "cannot fetch $BR from origin"
  git merge-base --is-ancestor "$REMOTE" HEAD || die "the branch is behind origin/$BR — bring it up to date first"
  git merge-base --is-ancestor "$HASH" "$REMOTE" || die "the release commit $HASH is not on origin — push it first"
  printf 'v%s %s %s\n' "$VER" "$HASH" "$NOTE" >> server/releases.txt
  LMSG=$(mktemp)
  { printf 'List v%s as a release the Windows laptop installs by itself\n' "$VER"; if [ -n "${RELEASE_TRAILER:-}" ]; then printf '\n%s\n' "$RELEASE_TRAILER"; fi; } > "$LMSG"
  git add server/releases.txt
  git commit -q -F "$LMSG" || { rm -f "$LMSG"; git reset -q -- server/releases.txt; git checkout -q -- server/releases.txt; die "the listing commit was refused — nothing is listed"; }
  rm -f "$LMSG"
  OKPUSH=0
  for wait in 0 2 4 8 16; do sleep "$wait"; if git push -q -u origin "$BR"; then OKPUSH=1; break; fi; done
  [ "$OKPUSH" = 1 ] || die "the listing of v$VER is committed but could not be pushed — «git push» finishes it"
  say "listed v$VER = $HASH: the Windows laptop installs it by itself from now on"
  exit 0
fi

VER="${1:-}"; NOTE="${2:-}"
[ $# -ge 2 ] || die "usage: sh server/release.sh <X.Y.Z> \"<note>\" --row <file> [--dry] [--unlisted]   |   --list <X.Y.Z>"
shift 2
ROW=""; DRY=0; UNLISTED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --row) [ $# -ge 2 ] || die "--row needs a file: the text of the row for docs/versiyalar.md"; ROW="$2"; shift 2 ;;
    --dry) DRY=1; shift ;;
    --unlisted) UNLISTED=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

# ------------------------------------------------------------------ what is asked for
printf '%s' "$VER" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "the version must look like 2.9.5 (got «$VER»)"
[ -n "$NOTE" ] || die "the note for releases.txt is empty"
[ "$(printf '%s' "$NOTE" | wc -l)" -eq 0 ] || die "the note must be one line"
if printf '%s' "$NOTE" | LC_ALL=C grep -q '[^ -~]'; then die "the note must be plain ASCII (releases.txt is read by the Windows launcher)"; fi
[ -n "$ROW" ] || die "--row <file> is needed: the text of the row for docs/versiyalar.md"
# a path is read where it was written, not from the repository the script moved to
at_from() { case "$1" in ''|/*) printf '%s' "$1" ;; *) printf '%s/%s' "$FROM" "$1" ;; esac; }
ROW=$(at_from "$ROW")
[ -f "$ROW" ] || die "--row: $ROW not found"
[ -s "$ROW" ] || die "--row: $ROW is empty — it is the text of the row for docs/versiyalar.md"
for v in RELEASE_REGISTRY RELEASE_SMETA1 RELEASE_SMETA2; do
  eval "p=\${$v:-}"
  [ -n "$p" ] || continue
  p=$(at_from "$p")
  [ -f "$p" ] || die "$v: $p not found"
  eval "$v=\$p"
done
if grep -q '|' "$ROW"; then die "the row text must not contain «|» (it is one cell of a table)"; fi
ROWTEXT=$(tr '\r\n' '  ' < "$ROW" | sed 's/  */ /g; s/^ //; s/ $//')

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
# The stand-ins are for the test of this script: honoured only when origin is a repository on this machine.
STANDIN=""
if [ -n "${RELEASE_SUITE:-}${RELEASE_PRIVACY:-}" ]; then
  case "$(git remote get-url origin 2>/dev/null)" in
    /*|file://*) STANDIN=1 ;;
    *) die "RELEASE_SUITE / RELEASE_PRIVACY are for the test of this script only (test/release-script.sh) — unset them for a release" ;;
  esac
fi
# What a release cannot go without, said now rather than after the suite: test/laptop-windows.sh runs on Linux only
# and needs PowerShell; the browser tests need playwright. And the branch: the Windows laptop reads
# server/releases.txt from this one branch (server/laptop.ps1, server/install-windows.ps1) — a release listed on any
# other is never installed (RELEASE_BRANCH, above).
if [ -z "$STANDIN" ]; then
  [ "$(uname -s)" = Linux ] || die "releases are made on Linux with PowerShell (PWSH=<path to pwsh>): the Windows launcher's test does not run on $(uname -s)"
  P=${PWSH:-$(command -v pwsh 2>/dev/null || true)}
  [ -n "$P" ] && [ -x "$P" ] || die "PowerShell is not found (PWSH=<path to pwsh>): the Windows launcher's test cannot run, and a release cannot go without it"
  node -e "require.resolve('playwright')" 2>/dev/null || die "playwright is not installed (npm i && npx playwright install chromium): the browser tests cannot run, and a release cannot go without them"
  [ "$BR" = "$RELEASE_BRANCH" ] || die "releases are made on $RELEASE_BRANCH — the branch the Windows laptop reads server/releases.txt from (on $BR)"
fi

STAMPS="test/refs-parity.stamp test/hints.stamp"
DIRTY=$(git status --porcelain | grep -v -e '^ M test/refs-parity.stamp$' -e '^ M test/hints.stamp$' -e '^?? test/hints.stamp$' || true)
[ -z "$DIRTY" ] || die "the working tree has changes — commit them or put them away first:
$(git status --short | head -10)"
# A branch that is not on origin yet is up to date by definition: the release pushes it. «Cannot reach» is said
# only when origin does not answer (ls-remote: 2 = it answered, and has no such branch). The ref is named in full:
# «--heads origin X» would also match refs/heads/feature/X.
LSERR=$(mktemp)
if REMOTE=$(git ls-remote --exit-code origin "refs/heads/$BR" 2>"$LSERR"); then
  rm -f "$LSERR"
  # the commit origin has, as ls-remote just said — not origin/$BR (a clone fetching only some branches does not
  # update it) nor FETCH_HEAD (not written when fetch.writeFetchHead is off)
  REMOTE=$(printf '%s\n' "$REMOTE" | awk 'NR == 1 { print $1 }')
  git cat-file -e "$REMOTE^{commit}" 2>/dev/null || git fetch -q origin "$BR" || die "cannot fetch $BR from origin to see whether the branch is up to date"
  git cat-file -e "$REMOTE^{commit}" 2>/dev/null || die "origin's $BR ($REMOTE) is not here after fetching it — whether the branch is up to date cannot be told"
  git merge-base --is-ancestor "$REMOTE" HEAD || die "the branch is behind origin/$BR — bring it up to date first"
else
  RC=$?
  WHY=$(head -3 "$LSERR"); rm -f "$LSERR"
  [ "$RC" = 2 ] || die "cannot reach origin to see whether the branch is up to date${WHY:+:
$WHY}"
  say "  $BR is not on origin yet: the release pushes it"
fi

# ------------------------------------------------------------------ from here on, stopping puts things back
# Tests a release may go without: what only the owner's files or kit can run. Anything else skipped — the
# Windows launcher without PowerShell, every browser test without playwright — refuses the release: the Windows
# laptop installs what is listed by itself.
SKIP_OK="hints refs-measure refs-parity e2e-fullregistry smeta-corpus"
# and every other test test/all.sh lists must be in the results as OK: a test missing from them (renamed, dropped,
# never reached) refuses the release as surely as a skipped one
REQUIRED=$(listed_tests | tr '\n' ' ')
[ "$(printf '%s\n' $REQUIRED | wc -l)" -ge 20 ] || die "reading the tests test/all.sh runs found only: $REQUIRED — the release script's reading of test/all.sh is out of date"
STAGE=checking
MSG=$(mktemp)
PRIV=$(mktemp)
HEAD0=$(git rev-parse HEAD)
stamps_changed() { for f in $STAMPS; do [ -n "$(git status --porcelain -- "$f" 2>/dev/null)" ] && echo "$f"; done; return 0; }
cleanup() {
  CODE=$?
  trap '' INT TERM HUP            # a second Ctrl-C must not cut the putting back short
  # a signal between «git commit» and the line after it: the commit is there, whatever STAGE says
  if [ "$STAGE" = committing ]; then
    if [ "$(git rev-parse HEAD)" != "$HEAD0" ]; then HASH=$(git rev-parse HEAD); STAGE=committed; else STAGE=changed; fi
  fi
  if [ "$STAGE" = listing ]; then
    if [ "$(git rev-parse HEAD)" != "$HASH" ]; then STAGE=listed; else STAGE=written; fi
  fi
  if [ "$STAGE" = changed ]; then
    git reset -q -- package.json dist $STAMPS 2>/dev/null || true
    git checkout -q -- package.json dist 2>/dev/null || true
    git clean -fdq -- dist 2>/dev/null || true          # pages the build added
    rm -f package.json.new
    if [ "$DRY" != 1 ] || [ "$CODE" != 0 ]; then say "release: stopped — package.json and dist/ are put back" >&2; fi
    # a stamp left in the tree stays: the next release carries it if it still names the code then (--check-stamp)
    for f in $(stamps_changed); do say "release: $f is changed in the tree and stays — a later release carries it if it still matches the code" >&2; done
  elif [ "$CODE" != 0 ]; then
    if [ "$UNLISTED" = 1 ]; then say "release: (--unlisted: server/releases.txt is not to be written — below, «the listing» is the row of docs/versiyalar.md alone)" >&2; fi
    case "$STAGE" in
      committed) if [ "$PUSHWHY" = behind ]; then
                   # a rebase would give the release commit another hash than the one releases.txt is to name
                   say "release: origin has commits this branch does not, and the release commit $HASH is not pushed. Do not rebase it:" >&2
                   say "  drop it, keeping the measurements it carries — «git reset -q HEAD~1 && git checkout -- package.json dist &&" >&2
                   say "  git clean -fdq -- dist» — bring the branch up to date, and release again" >&2
                 else
                   say "release: stopped after the release commit $HASH was made, before it was pushed${PUSHWHY:+ (origin refused it, see above)}. Finish by hand:" >&2
                   say "  «git push»; then, in a commit of its own, add «v$VER $HASH $NOTE» to server/releases.txt and the row to docs/versiyalar.md" >&2
                 fi ;;
      pushed)    say "release: the release commit $HASH is pushed; its listing is not written. Add, in a commit of its own," >&2
                 say "  «v$VER $HASH $NOTE» to server/releases.txt and the row to docs/versiyalar.md" >&2 ;;
      writing)   say "release: the release commit $HASH is pushed; its listing was being written, and is not committed:" >&2
                 say "  server/releases.txt $( [ "$LINEDONE" = 1 ] && echo "has" || echo "does not have") «v$VER $HASH $NOTE»;" >&2
                 say "  docs/versiyalar.md $( [ "$ROWDONE" = 1 ] && echo "has" || echo "does not have") the row. Finish both, commit them on their own, push" >&2 ;;
      written)   say "release: the release commit $HASH is pushed; server/releases.txt and docs/versiyalar.md are written (and staged)" >&2
                 say "  but not committed — check them, commit them on their own, and push" >&2 ;;
      listed)    if [ "$PUSHWHY" = behind ]; then
                   say "release: both commits are made and the release commit $HASH is on origin; origin has moved on since, so the" >&2
                   say "  listing is not pushed — «git pull --rebase && git push» finishes the release (a rebase of the listing keeps $HASH)" >&2
                 else
                   say "release: both commits are made; the listing is not pushed${PUSHWHY:+ (origin refused it, see above)} — «git push» finishes the release" >&2
                 fi ;;
    esac
  fi
  rm -f "$MSG" "$PRIV" "${PUSHERR:-}"
  exit "$CODE"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# The privacy check of what is staged, in its own words. Each kind of hit is told for what it is: the owner's data
# (a price, a name, a document of the reference package), or something else the check refuses (dist/ not built
# from src, a vendor file changed, a fixture number not declared, the build failing) — not a leak, and named as
# such. Exit 2 is the check unable to run (a kit without a package, a history cut short). $1 says what is being
# committed and what is already done.
DATA_KINDS="source-id issuer-or-plant document-name record-name real-price fixture-price-is-real tracked-data-file hex12"
privacy() {
  if [ -n "$STANDIN" ] && [ -n "${RELEASE_PRIVACY:-}" ]; then
    if sh -c "$RELEASE_PRIVACY" >"$PRIV" 2>&1; then return 0; else RC=$?; fi
  elif [ -n "$REFS_KIT" ]; then
    if node test/refs-privacy.cjs --staged --msg "$MSG" >"$PRIV" 2>&1; then return 0; else RC=$?; fi
  else
    return 0
  fi
  N=$(grep -c '^HIT ' "$PRIV" || true)
  if [ "$RC" = 1 ] && [ "$N" -gt 0 ]; then
    DATA=$(grep '^HIT ' "$PRIV" | awk -v k=" $DATA_KINDS " 'index(k, " " $2 " ") > 0' || true)
    if [ -n "$DATA" ]; then
      say "release: the privacy check found the owner's data in $1 — nothing more is committed ($(printf '%s\n' "$DATA" | wc -l | tr -d ' ') of $N hits):" >&2
      printf '%s\n' "$DATA" | head -20 >&2
    else
      say "release: the privacy check refuses $1, though not for the owner's data ($N hits) — nothing more is committed:" >&2
      grep '^HIT ' "$PRIV" | head -20 >&2
      grep '^  ' "$PRIV" >&2 || true
    fi
  else
    say "release: the privacy check could not run (exit $RC) on $1 — nothing more is committed:" >&2
    grep -v '^[[:space:]]*at ' "$PRIV" | head -5 >&2
  fi
  exit 1
}

# ------------------------------------------------------------------ the release itself
say "release v$VER (from v$CUR, on $BR)"
[ -n "$REFS_KIT" ] || say "  without REFS_KIT: the reference-price measurement and the privacy check of the commit for the owner's data do not run"
STAGE=changed
sed "s/\"version\": \"$CUR\"/\"version\": \"$VER\"/" package.json > package.json.new && mv package.json.new package.json
grep -q "\"version\": \"$VER\"" package.json || die "package.json did not take the version"
node build.mjs >/dev/null || die "the build failed"
grep -q "v$VER" dist/index.html && grep -q "v$VER" dist/smeta-taqqoslash.html || die "the built pages do not carry v$VER"

say "  the suite …"
rm -f test/all-results.txt
if [ -n "$STANDIN" ] && [ -n "${RELEASE_SUITE:-}" ]; then
  say "  (the suite stood in for by RELEASE_SUITE: the test of this script)"
  sh -c "$RELEASE_SUITE" || die "the suite is not green — nothing is released"
else
  sh test/all.sh "${RELEASE_REGISTRY:-}" "${RELEASE_SMETA1:-}" "${RELEASE_SMETA2:-}" || die "the suite is not green — nothing is released (test/all-results.txt, test/.log-<name>.txt)"
fi
[ -s test/all-results.txt ] || die "the suite left no test/all-results.txt — whether it ran cannot be told"
FAILED=$(awk -F'\t' '$2 == "FAIL" { print $1 }' test/all-results.txt | tr '\n' ' ')
[ -z "$FAILED" ] || die "the suite has failures: $FAILED"
SKIPPED=$(awk -F'\t' '$2 == "SKIP" { print $1 }' test/all-results.txt)
MISSED=""
for t in $SKIPPED; do
  case " $SKIP_OK " in *" $t "*) continue ;; esac
  MISSED="$MISSED $t"
done
[ -z "$MISSED" ] || die "the suite skipped tests a release may not go without:$MISSED
  (laptop-windows runs on Linux with PowerShell — PWSH=<path to pwsh>; releases are made there. The browser tests
  need playwright — npm i && npx playwright install chromium)"
ABSENT=""
for t in $REQUIRED; do
  case " $SKIP_OK " in *" $t "*) OKAS='OK SKIP' ;; *) OKAS='OK' ;; esac
  awk -F'\t' -v t="$t" -v ok=" $OKAS " '$1 == t && index(ok, " " $2 " ") { f = 1 } END { exit !f }' test/all-results.txt || ABSENT="$ABSENT $t"
done
[ -z "$ABSENT" ] || die "the suite did not run tests a release may not go without:$ABSENT"
UNKNOWN=""
for t in $(awk -F'\t' 'NF >= 2 { print $1 }' test/all-results.txt); do
  case " $REQUIRED " in *" $t "*) ;; *) UNKNOWN="$UNKNOWN $t" ;; esac
done
[ -z "$UNKNOWN" ] || die "the suite ran tests the release script does not know:$UNKNOWN — its reading of test/all.sh (listed_tests) is out of date"
if [ -z "$STANDIN" ]; then
  node test/refs-parity.cjs --check-stamp >/dev/null 2>&1 || die "the reference-price code differs from its measurement (test/refs-parity.stamp) — run the suite with REFS_KIT"
  node test/hints.cjs --check-stamp >/dev/null 2>&1 || die "the similarity code differs from its measurement (test/hints.stamp) — run the suite with real estimates and REFS_KIT"
fi
OTHER=$(git status --porcelain | grep -v -e '^ M package.json$' -e '^[ ?][MD?] dist/' -e '^ M test/refs-parity.stamp$' \
  -e '^ M test/hints.stamp$' -e '^?? test/hints.stamp$' || true)
[ -z "$OTHER" ] || die "the build or the suite changed files a release does not carry:
$OTHER"

CHANGED_STAMPS=$(stamps_changed | tr '\n' ' ')
{ printf 'v%s: %s\n' "$VER" "$NOTE"
  if [ -n "$CHANGED_STAMPS" ]; then printf '\nThe measurements it carries: %s\n' "$CHANGED_STAMPS"; fi
  if [ -n "${RELEASE_TRAILER:-}" ]; then printf '\n%s\n' "$RELEASE_TRAILER"; fi; } > "$MSG"
git add -A package.json dist $CHANGED_STAMPS
privacy "the release commit"

if [ "$DRY" = 1 ]; then
  say "  --dry: v$VER builds, the suite is green, nothing was committed"
  exit 0
fi

PUSHERR=$(mktemp)
PUSHWHY=""
# $1: what is pushed — «release» (a commit releases.txt is about to name) or «listing»
push() {
  for wait in 0 2 4 8 16; do
    sleep "$wait"
    if git push -q -u origin "$BR" 2>"$PUSHERR"; then return 0; fi
    cat "$PUSHERR" >&2
    # refused for a reason that waiting does not change
    if grep -qiE 'non-fast-forward|fetch first|\[(remote )?rejected\]|declined|denied|protected branch|(HTTP|error:|returned error:) ?403|403 Forbidden|Authentication failed|could not read Username' "$PUSHERR"; then
      if grep -qiE 'non-fast-forward|fetch first' "$PUSHERR"; then PUSHWHY=behind; else PUSHWHY=refused; fi
      return 1
    fi
  done
  return 1
}

STAGE=committing
git commit -q -F "$MSG"
HASH=$(git rev-parse HEAD)
STAGE=committed
push release || { say "release: the release commit $HASH is made but could not be pushed" >&2; exit 1; }   # cleanup says what is left
STAGE=pushed

# ------------------------------------------------------------------ and, in a commit of its own, its listing
STAGE=writing
LINEDONE=0; ROWDONE=0
# --unlisted: the Windows laptop installs what releases.txt names, by itself — a version the owner is to try first is
# not named there yet («--list» names it later, by the commit its row in docs/versiyalar.md keeps)
if [ "$UNLISTED" != 1 ]; then printf 'v%s %s %s\n' "$VER" "$HASH" "$NOTE" >> server/releases.txt; fi
LINEDONE=1
node -e "
  const fs = require('fs'), [ver, hash, text] = process.argv.slice(1);
  const lines = fs.readFileSync('docs/versiyalar.md', 'utf8').split('\n');
  let at = -1;
  lines.forEach((l, i) => { if (/^\| \*\*v\d+\.\d+/.test(l)) at = i; });
  if (at < 0) process.exit(1);
  lines.splice(at + 1, 0, '| **v' + ver + '** | ' + text + ' | \`' + hash + '\` |');
  fs.writeFileSync('docs/versiyalar.md', lines.join('\n'));
" "$VER" "$HASH" "$ROWTEXT" || die "docs/versiyalar.md has no table of versions to add the row to (the release commit $HASH is pushed)"
ROWDONE=1
if [ "$UNLISTED" = 1 ]; then
  { printf 'Record v%s in docs/versiyalar.md (not listed yet: the owner tries it first)\n' "$VER"; if [ -n "${RELEASE_TRAILER:-}" ]; then printf '\n%s\n' "$RELEASE_TRAILER"; fi; } > "$MSG"
  git add docs/versiyalar.md
else
  { printf 'List v%s as a release the Windows laptop installs by itself\n' "$VER"; if [ -n "${RELEASE_TRAILER:-}" ]; then printf '\n%s\n' "$RELEASE_TRAILER"; fi; } > "$MSG"
  git add server/releases.txt docs/versiyalar.md
fi
STAGE=written
privacy "the row for docs/versiyalar.md (the release commit $HASH is pushed; reword the row and commit the listing by hand)"
STAGE=listing
git commit -q -F "$MSG" || { STAGE=written; say "release: the listing commit was refused (see above)" >&2; exit 1; }   # cleanup says what is left
STAGE=listed
push listing || { say "release: the listing commit could not be pushed" >&2; exit 1; }                       # cleanup says what is left
STAGE=done

say "released v$VER = $HASH"
if [ "$UNLISTED" = 1 ]; then
  say "  not listed: the Windows laptop does not install it by itself. Once it is tried:  sh server/release.sh --list $VER"
  say "  Mac:      cd ~/Smeta && sh server/laptop.sh update"
  exit 0
fi
say "  Windows:  C:\\Smeta\\server\\laptop.cmd update      (or by itself)"
say "  Mac:      https://github.com/1maxstar1/Ayubkhon_A/archive/$HASH.zip   (see README, «Yangilash»)"
