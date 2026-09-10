#!/bin/sh
# Puts the server back on an earlier release, without touching the data.
#   sh server/deploy/rollback.sh root@SERVER_IP v1.0
#   sh server/deploy/rollback.sh root@SERVER_IP           (lists the releases)
#
# What it does, in order:
#   1. makes a fresh backup on the server, so this step itself is undoable;
#   2. builds the chosen release in a throwaway copy of the repository, so
#      your working files are left exactly as they are;
#   3. replaces the pages and the hooks on the server and restarts it.
#
# What it deliberately does NOT do: change the database. Columns an older
# release does not know about are simply ignored by it, and dropping them
# would be the one step that could not be undone.
set -e
# Once the address is remembered (deploy/.target) the first argument may be
# left out, and then a bare word is the version.
case "$1" in *@*|'') TARGET="$1"; TAG="$2" ;; *) TARGET=""; TAG="$1" ;; esac
if [ -n "$TARGET" ] || [ -f "$(dirname "$0")/.target" ]; then . "$(dirname "$0")/target.sh"; fi
cd "$(dirname "$0")/../.."

if [ -z "$TARGET" ]; then
  echo "usage: sh server/deploy/rollback.sh root@IP <versiya>"
  echo
  echo "mavjud versiyalar:"
  git tag -n1 | sed 's/^/  /'
  echo "(ro'yxat bo'sh bo'lsa — docs/versiyalar.md dagi commit raqamini bering)"
  exit 1
fi
if [ -z "$TAG" ]; then
  echo "Qaysi versiyaga qaytamiz? Mavjudlari:"
  git tag -n1 | sed 's/^/  /'
  echo
  echo "  sh server/deploy/rollback.sh $TARGET v1.0"
  exit 1
fi
# a tag, a branch or a plain commit hash — all three work here, because the
# tags live only on the machine that made them until somebody pushes them
git rev-parse -q --verify "$TAG^{commit}" >/dev/null || {
  echo "«$TAG» topilmadi. Mavjud teglar:"; git tag -n1 | sed 's/^/  /'
  echo "Versiya raqamlari va commit'lari: docs/versiyalar.md"; exit 1; }
command -v node >/dev/null || { echo "node kerak (brew install node)"; exit 1; }

echo "--- 1/3  serverda zaxira nusxa"
ssh "$TARGET" 'cd /opt/taqqoslash/server && . ./.env && \
  if [ -n "$PB_DOMAIN" ]; then B="https://$PB_DOMAIN"; R="-k --resolve $PB_DOMAIN:443:127.0.0.1"; else B="http://127.0.0.1:80"; R=""; fi && \
  T=$(curl -sS $R -X POST "$B/api/collections/_superusers/auth-with-password" -H "content-type: application/json" \
     -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASS\"}" | sed -n "s/.*\"token\":\"\([^\"]*\)\".*/\1/p") && \
  [ -n "$T" ] || { echo "superuser auth failed"; exit 1; } && \
  curl -sS $R -o /dev/null -w "zaxira: HTTP %{http_code}\n" -X POST "$B/api/backups" -H "Authorization: $T" -H "content-type: application/json" -d "{}"'

echo "--- 2/3  «$TAG» yig'ilmoqda (ishchi fayllaringizga tegilmaydi)"
WORK=$(mktemp -d)
trap 'git worktree remove --force "$WORK" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
git worktree add --detach --quiet "$WORK" "$TAG"
( cd "$WORK" && node build.mjs --serve >/dev/null )
[ -f "$WORK/server/pb_public/index.html" ] || { echo "yig'ish natija bermadi"; exit 1; }

echo "--- 3/3  serverga yuklanmoqda"
tar czf - -C "$WORK" server/pb_public server/pb_hooks \
  | ssh "$TARGET" 'tar xzf - -C /opt/taqqoslash && systemctl restart pocketbase && sleep 2 && \
      if systemctl is-active --quiet pocketbase; then echo "xizmat ishlayapti"; else echo "XIZMAT ISHGA TUSHMADI — journalctl -u pocketbase -n 50"; exit 1; fi'

echo
echo "Server endi $TAG da. Brauzerni yangilang (Ctrl+Shift+R) va sarlavhadagi"
echo "versiya raqamini tekshiring."
echo "Orqaga qaytish:  sh server/deploy/push.sh $TARGET"
