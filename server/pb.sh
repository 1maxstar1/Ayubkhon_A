# Sourced by the other scripts: picks the binary name for this platform and
# downloads it when missing. Only `if` statements here — this file is sourced
# under `set -e`, where a failing `[ … ] && …` as the last command would abort.
PB=./pocketbase
if [ -x ./pocketbase.exe ]; then PB=./pocketbase.exe; fi
if [ ! -x "$PB" ]; then
  ./get-pocketbase.sh
  if [ -x ./pocketbase.exe ]; then PB=./pocketbase.exe; fi
fi
