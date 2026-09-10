#!/bin/sh
# Finds the server's address on this computer and remembers it, so the deploy
# scripts can be run without typing it.
#   sh server/deploy/find-server.sh                 lists what it found
#   sh server/deploy/find-server.sh 1               remembers the first one
#   sh server/deploy/find-server.sh root@1.2.3.4    remembers that one
#
# Where it looks: the shell history — the push.sh that worked last time is in
# there with the real address; ~/.ssh/known_hosts — every server this machine
# has connected to; ~/.ssh/config. Newest first, each address once. Whatever
# is chosen is tried with ssh before it is remembered, so a wrong address is
# refused here, in a few seconds, and not by push.sh after it has built.
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
FILE="$DIR/.target"
PICK="$1"
TAB=$(printf '\t')

candidates() {
  {
    for h in "$HOME/.zsh_history" "$HOME/.bash_history"; do
      [ -f "$h" ] || continue
      # zsh writes «: 1699999999:0;command»; only the root@… after a deploy
      # script or ssh/scp is wanted, and the most recent one first.
      # An underscore is no part of a hostname, but «root@SERVER_IP» must be
      # read whole to be recognised for what it is, not cut down to a plausible
      # «root@SERVER».
      grep -aoE '(deploy/[a-z-]+\.sh|ssh|scp) +[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+' "$h" 2>/dev/null \
        | awk '{ a[NR] = $NF } END { for (i = NR; i > 0; i--) print a[i] }' \
        | sed "s|\$|${TAB}$(basename "$h")|"
    done
    if [ -f "$HOME/.ssh/known_hosts" ]; then
      grep -v '^|' "$HOME/.ssh/known_hosts" | awk '{ print $1 }' | tr ',' '\n' \
        | sed 's/^\[//; s/\]:[0-9]*$//' | grep -E '^[A-Za-z0-9.-]+$' \
        | sed "s|^|root@|; s|\$|${TAB}~/.ssh/known_hosts|"
    fi
    if [ -f "$HOME/.ssh/config" ]; then
      awk -v t="$TAB" 'tolower($1) == "host" && $2 !~ /[*?]/ { print "root@" $2 t "~/.ssh/config" }' "$HOME/.ssh/config"
    fi
  } | grep -vE "@([^${TAB}]*_|IP${TAB}|203\.0\.113\.|198\.51\.100\.|192\.0\.2\.|127\.0\.0\.1${TAB}|localhost${TAB}|github\.com${TAB}|gitlab\.com${TAB}|bitbucket\.org${TAB})" \
    | awk -F"$TAB" '!seen[$1]++' || true
}

remember() {
  T="$1"
  if [ "$NO_SSH_CHECK" != 1 ]; then
    echo "tekshirilmoqda: ssh $T …"
    if ! ssh -o ConnectTimeout=8 "$T" 'echo "  ulanish bor: $(hostname)"'; then
      echo "ulanib bo'lmadi — manzil noto'g'ri, server o'chiq yoki bu kompyuterga kirish yo'q. Eslab qolinmadi."
      exit 1
    fi
  fi
  printf '%s\n' "$T" > "$FILE"
  echo "eslab qolindi: $T"
  echo
  echo "Endi bu ikki buyruq argumentsiz ishlaydi:"
  echo "    sh server/deploy/pull-backup.sh"
  echo "    sh server/deploy/push.sh"
}

LIST=$(candidates)
case "$PICK" in
  '')
    if [ -f "$FILE" ]; then echo "hozir eslab qolingan: $(cat "$FILE")"; echo; fi
    if [ -z "$LIST" ]; then
      echo "Bu kompyuterda server manzili topilmadi."
      echo
      echo "Uni brauzerdan oling: dastur ochiladigan sahifaning manzil qatorida"
      echo "http:// dan keyin turgan raqamlar (yoki domen) — shu serverning manzili."
      echo "Keyin shu buyruqni yozing, raqamlarni o'z ko'zingiz bilan ko'rganingizdek:"
      echo "    sh server/deploy/find-server.sh root@RAQAMLAR"
      exit 1
    fi
    echo "topildi:"
    n=0
    echo "$LIST" | while IFS="$TAB" read -r a src; do
      n=$((n + 1)); printf '  %d)  %-30s %s\n' "$n" "$a" "$src"
    done
    echo
    echo "Birini tanlang — raqami bilan. Birinchisi uchun:"
    echo "    sh server/deploy/find-server.sh 1" ;;
  [0-9]*)
    T=$(echo "$LIST" | sed -n "${PICK}p" | cut -f1)
    if [ -z "$T" ]; then echo "bunday raqam ro'yxatda yo'q — avval argumentsiz ishga tushiring"; exit 1; fi
    remember "$T" ;;
  *@*)
    TARGET="$PICK"
    . "$DIR/target.sh"
    remember "$TARGET" ;;
  *)
    echo "usage: sh server/deploy/find-server.sh [N | root@IP]"; exit 1 ;;
esac
