---
name: session-kit
description: Set up the session kit for the current session and project — fill the session board (the pane beside the chat, with Inbox capture of asks typed mid-turn), check idle-compact, start the 5-hour usage watch, and offer the subagent and usage lessons as memories. Use when the user says "session kit", "set up the board", "fill the board", or after a session was reopened and the board needs a fresh start.
---

# Session kit

This skill ships in the `session-board` plugin. Its files sit beside it; paths below are relative to this skill's base directory:

- `guide.md`: board rules, section layout, subagent and usage lessons, working rules. **Read it now and follow it.** It is the authority; this skill is only the entry point.
- `lessons/`: the same lessons as one memory file each.
- `../../tools/board-set.py`, `../../tools/usage-watch.sh`, `../../tools/view.py`: the plugin's helper scripts.

## Set it up

1. **Board.** Run `/board path` to learn where the board file is (the plugin data folder, `~/.claude/plugins/data/session-board-session-kit/board.json` unless `CLAUDE_CONFIG_DIR` is set). `/board` opens the pane. If `/board` is an unknown command, the `session-board` plugin is not installed or mods are off: tell the user to install it (`/plugin install session-board@session-kit`) and stop.
2. **Fill the board** for this project: rename or replace the empty sections to fit the work (see the section rules in `guide.md`), and keep `Inbox (your asks, captured)` first with its title exact (the capture hook matches it). Re-read the file before writing and keep it valid JSON. Optionally set `"check"` to a read-only command line for `/board check` (see Monitor in `guide.md`).
3. **Idle compaction.** If the `idle-compact` plugin is installed, `/idle-compact` shows its state. It is optional.
4. **Usage watch.** Only when `$TMPDIR/claude-usage.txt` exists (the kit's statusline writes it; see the repository README). Check none runs already: `ps -Ao command | grep "[u]sage-watch.sh"`. Then start `../../tools/usage-watch.sh 65` with Bash `run_in_background`. Start it again each time it fires. Without the usage file, skip this step and say so.
5. **Lessons.** Offer to save the rules in `guide.md` as memories for this project (one file per rule from `lessons/`, linked from `MEMORY.md`). Save them only if the user agrees.

## Durable files

A background session's job tmp folder (`$CLAUDE_JOB_DIR/tmp`) is deleted when the session closes. Keep anything that must outlive the session (plans, research, scripts, PR texts) in a durable folder such as the repository or a notes folder, and put its path on the board.

## Finish

Report in a few lines: the board path, which plugins are active, and the usage-watch mark (or why it was skipped).
