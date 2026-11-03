#!/usr/bin/env bash
# Optional extra: copies the kit's statusline into your Claude config folder.
# The two plugins install with /plugin (see README.md); a plugin cannot set the
# main status line, so this one part is a copied script.
#
#   ./install.sh --statusline
#
# What it does:
#   - copies statusline/statusline.sh to <config dir>/session-kit/statusline.sh
#     (<config dir> is $CLAUDE_CONFIG_DIR, else ~/.claude); an older copy there
#     is moved aside as statusline.sh.bak-<stamp>, never deleted;
#   - prints the settings line to add. It never edits settings.json and never
#     touches a status line you already have.
# The copy does not update with the plugins: run this again after pulling.
set -euo pipefail

if [ "${1:-}" != "--statusline" ]; then
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

REPO=$(cd "$(dirname "$0")" && pwd)
CONFIG=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
DEST="$CONFIG/session-kit/statusline.sh"

command -v jq >/dev/null 2>&1 || echo "warn  jq is not installed; the status line needs it and shows 'Claude (jq missing)' without it"

mkdir -p "$(dirname "$DEST")"
if [ -e "$DEST" ] && ! cmp -s "$REPO/statusline/statusline.sh" "$DEST"; then
  stamp=$(date +%Y%m%d-%H%M%S)
  mv "$DEST" "$DEST.bak-$stamp"
  echo "moved $DEST -> $DEST.bak-$stamp"
fi
cp "$REPO/statusline/statusline.sh" "$DEST"
chmod +x "$DEST"
echo "copied $DEST"

cat <<SNIPPET

To use it, set this in $CONFIG/settings.json (replacing any "statusLine" you have,
if you want this one instead):

  "statusLine": { "type": "command", "command": "$DEST" }

It also writes \$TMPDIR/claude-usage.txt, which the session-board plugin's
tools/usage-watch.sh reads.
SNIPPET
