#!/bin/sh
# The first argument of the deploy scripts — the server's address — and what
# happens when it is pasted from the docs, copied out of an example, or left
# out. Runs against a throwaway copy of server/deploy with a made-up HOME, so
# nothing here touches the real deploy/.target or the real shell history.
#   sh test/deploy-target.sh
cd "$(dirname "$0")/.."
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
cp -R server/deploy "$T/deploy"
rm -f "$T/deploy/.target"
mkdir -p "$T/home/.ssh"
FAIL=0
pass() { echo "ok   $1"; }
fail() { echo "FAIL $1"; FAIL=$((FAIL + 1)); }
says() { if echo "$1" | grep -q "$2"; then pass "$3"; else fail "$3 — got: $(echo "$1" | head -3 | tr '\n' '|')"; fi; }

echo '-- a pasted placeholder --'
O=$(sh "$T/deploy/push.sh" root@SERVER_IP 2>&1) && fail "push.sh root@SERVER_IP must stop" || pass "push.sh root@SERVER_IP stops before building"
says "$O" "o'rnini bosuvchi" 'and says it is a placeholder'
says "$O" "find-server" 'and where the real one is found'
if echo "$O" | grep -q built; then fail 'nothing was built first'; else pass 'nothing was built first'; fi
O=$(sh "$T/deploy/pull-backup.sh" root@IP 2>&1) && fail "pull-backup.sh root@IP must stop" || pass "pull-backup.sh root@IP stops too"
O=$(sh "$T/deploy/rollback.sh" root@SERVER_IP v1.0 2>&1) && fail "rollback.sh root@SERVER_IP must stop" || pass "rollback.sh root@SERVER_IP stops too"

echo '-- an address out of an example --'
O=$(sh "$T/deploy/push.sh" root@203.0.113.17 2>&1) && fail "203.0.113.17 must stop" || pass "the documentation range is refused"
says "$O" "RFC 5737" 'and named for what it is'

echo '-- no address at all --'
O=$(sh "$T/deploy/push.sh" 2>&1) && fail "no address must stop" || pass "with nothing remembered, no argument stops"
says "$O" "berilmagan" 'and says the address is missing'

echo '-- finding the address on this computer --'
printf ': 1725000000:0;sh server/deploy/push.sh root@SERVER_IP\n: 1725000100:0;sh server/deploy/push.sh root@10.20.30.40\n: 1725000200:0;ssh root@10.20.30.41\n' > "$T/home/.zsh_history"
printf 'github.com ssh-ed25519 AAAA\n10.20.30.40 ssh-ed25519 AAAA\n|1|hashedhost|hash ssh-rsa AAAA\n[10.20.30.42]:2222 ssh-rsa AAAA\n' > "$T/home/.ssh/known_hosts"
O=$(HOME="$T/home" sh "$T/deploy/find-server.sh" 2>&1)
says "$O" "1)  root@10.20.30.41" 'the most recent address in the history is first'
says "$O" "2)  root@10.20.30.40" 'the one the last push used is second'
says "$O" "3)  root@10.20.30.42" 'a known host on another port is read without its port'
if echo "$O" | grep -q "SERVER_IP"; then fail 'the placeholder from the history is left out'; else pass 'the placeholder from the history is left out'; fi
if echo "$O" | grep -q "github"; then fail 'github is not a server of ours'; else pass 'github is not a server of ours'; fi
N=$(echo "$O" | grep -c "root@10.20.30.40"); if [ "$N" = 1 ]; then pass 'an address in both places is listed once'; else fail "an address in both places is listed once ($N)"; fi

echo '-- remembering it --'
O=$(HOME="$T/home" NO_SSH_CHECK=1 sh "$T/deploy/find-server.sh" 2 2>&1)
says "$O" "eslab qolindi: root@10.20.30.40" 'choosing by number remembers that address'
if [ "$(cat "$T/deploy/.target")" = "root@10.20.30.40" ]; then pass 'in deploy/.target'; else fail 'in deploy/.target'; fi
O=$(cd / && sh -c '. "$(dirname "$0")/target.sh"; echo "T=$TARGET"' "$T/deploy/probe.sh" 2>&1)
says "$O" "T=root@10.20.30.40" 'a script run without an argument then gets it'
O=$(cd / && TARGET=root@10.20.30.41 sh -c '. "$(dirname "$0")/target.sh"; echo "T=$TARGET"' "$T/deploy/probe.sh" 2>&1)
says "$O" "T=root@10.20.30.41" 'and an argument still wins over the remembered one'
O=$(HOME="$T/home" NO_SSH_CHECK=1 sh "$T/deploy/find-server.sh" root@SERVER_IP 2>&1) && fail "a placeholder must not be remembered" || pass 'a placeholder cannot be remembered either'
if [ "$(cat "$T/deploy/.target")" = "root@10.20.30.40" ]; then pass 'the good one is still there'; else fail 'the good one is still there'; fi
O=$(HOME="$T/home" NO_SSH_CHECK=1 sh "$T/deploy/find-server.sh" 9 2>&1) && fail "a number off the list must stop" || pass 'a number off the list stops'

echo '-- nothing to find --'
rm -f "$T/home/.zsh_history" "$T/home/.ssh/known_hosts"
O=$(HOME="$T/home" sh "$T/deploy/find-server.sh" 2>&1) && fail "must stop when nothing is found" || pass 'with nothing on the computer it stops'
says "$O" "brauzer" 'and points at the browser address bar'

echo
if [ "$FAIL" = 0 ]; then echo "deploy-target OK"; else echo "FAILED ($FAIL)"; fi
[ "$FAIL" = 0 ]
