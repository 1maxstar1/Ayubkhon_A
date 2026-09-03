# Sourced by the other scripts: picks the binary name for this platform.
PB=./pocketbase
[ -x ./pocketbase.exe ] && PB=./pocketbase.exe
[ -x "$PB" ] || { ./get-pocketbase.sh; [ -x ./pocketbase.exe ] && PB=./pocketbase.exe; }
