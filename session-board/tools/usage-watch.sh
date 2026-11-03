#!/usr/bin/env bash
# Exits (and so wakes the session that started it in the background) when the
# 5-hour plan usage reaches the mark, or rises more than 10 points within
# 2 minutes. Start it again after acting.
#
#   usage-watch.sh [mark]   (default 65)
#
# Reads "$TMPDIR/claude-usage.txt", which statusline/statusline.sh writes on
# every status line update: "<epoch> <5h %> <5h reset epoch> <7d %> <7d reset epoch>".
MARK=${1:-65}
f="${TMPDIR:-/tmp}/claude-usage.txt"
hist=()

# Formats an epoch as HH:MM in local time: BSD/macOS date first, then GNU date.
clock() { date -r "$1" +%H:%M 2>/dev/null || date -d "@$1" +%H:%M 2>/dev/null || printf '%s' "$1"; }

while :; do
  if [ -r "$f" ] && read -r _ p r _ < "$f" && [ "$p" -eq "$p" ] 2>/dev/null; then
    if [ "$p" -ge "$MARK" ]; then
      echo "MARK 5h at $p% (mark $MARK, resets $(clock "$r"))"
      exit 0
    fi
    hist+=("$p")
    [ "${#hist[@]}" -gt 4 ] && hist=("${hist[@]:1}")
    if [ $((p - hist[0])) -gt 10 ]; then
      echo "FAST 5h rose ${hist[0]}% -> $p% in 2 min"
      exit 0
    fi
  fi
  sleep 30
done
