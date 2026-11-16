# Changelog

## 0.1.1 (2026-11-16)

- `idle-compact` waits 45 idle minutes, not 15, before the board update and compaction. Every message takes its duration from one constant.
- Inbox capture distils each message with `haiku` instead of `sonnet`: cheaper for a one-line rewrite.

## 0.1.0 (2026-11-03)

First public release.

- `session-board` plugin: the board pane (`/board`), Inbox capture of asks typed while a turn runs, `/board check` for the Monitor section, `/board path`, and the `session-kit` skill with its guide and lessons.
- The board now lives in the plugin data folder (`<config dir>/plugins/data/session-board-session-kit/board.json`), so it survives plugin updates. A board kept inside the plugin folder by earlier copies is moved there once, on the first session start.
- Times are written in the machine's local time zone.
- `idle-compact` plugin: board update and then compaction after 15 idle minutes, the self-compacting `idle-compact:worker` subagent type, and the brief in place of waking a large idle subagent.
- `tools/usage-watch.sh` works with both BSD (macOS) and GNU (Linux) `date`.
- `install.sh --statusline` is now opt-in and never edits settings.
- Both plugins carry an icon and link to this repository.
