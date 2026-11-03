# session-kit

Two Claude Code plugins for long sessions with many subagents:

- **session-board** puts a live board in a pane beside the chat. The board shows what is running now, what is next, what waits on you and what is coming up. While Claude is busy with a turn, anything you type is distilled into one line in the board's Inbox, so an ask sent mid-turn is not lost. The plugin also ships the `session-kit` skill, which fills the board for your project and holds the working rules and lessons below.
- **idle-compact** keeps the conversation small. After 15 idle minutes it asks Claude to bring the board up to date, then compacts the conversation. General-purpose subagents run as a worker type that compacts itself at 200,000 tokens. A large subagent that has gone idle is not woken by a message, which would make it re-read its whole transcript; Claude gets a brief to start a fresh agent from instead.

There is also an optional status line, a copied script, that shows context and plan usage. A small watcher reads it and warns before the 5-hour usage limit runs out.

The two plugins work independently. Install either one, or both.

## Requirements

- Claude Code 2.1.287 or newer. Mods (plugins with a hooks module) are on by default from that version.
- macOS or Linux.
- `python3` (3.9+) for the optional helper scripts.
- `jq` for the optional status line.

## Install

In Claude Code, add this repository as a marketplace, then install the plugins you want.

```text
/plugin marketplace add ali-shirzadg/session-kit
/plugin install session-board@session-kit
/plugin install idle-compact@session-kit
```

On Claude Code 2.1.275 or newer, one line per plugin also works:

```text
/plugin install session-board --marketplace ali-shirzadg/session-kit
```

Then type `/board` to open the pane, and `/session-kit` (or ask "set up the session kit") to have Claude fill the board for your project.

### Optional: the status line and usage watch

A plugin cannot set the main status line, so this part is a script you copy. From a clone of this repository:

```sh
./install.sh --statusline
```

This copies `statusline/statusline.sh` to `~/.claude/session-kit/statusline.sh` (or under `$CLAUDE_CONFIG_DIR`). It then prints the `"statusLine"` setting to add. It never edits your settings and never replaces a status line you already have. The copy does not update with the plugins, so run the script again after pulling.

The status line shows the repository, branch, model, context use, cost and 5-hour and 7-day plan usage. On every update it also writes `$TMPDIR/claude-usage.txt`. `session-board/tools/usage-watch.sh 65`, run in the background, reads that file. It exits, which wakes the session, when the 5-hour usage reaches 65 % or jumps more than 10 points within 2 minutes.

## What each part does

| Part | Commands | What it does |
| --- | --- | --- |
| session-board | `/board`, `/board path`, `/board check` | Draws the board file in a pane and redraws it within 3 seconds of any change. `/board path` prints the file's location. `/board check` runs the board's `"check"` command line and puts what it prints in the Monitor section. |
| session-board: Inbox | none | Sorts each message you type while a turn runs into one line under "Inbox (your asks, captured)". |
| session-board: `session-kit` skill | `/session-kit` | Fills the board for the project, starts the usage watch when the status line is installed, and offers the lessons as project memories. |
| session-board: `tools/` | shell | `board-set.py` edits the board from the shell. `view.py` draws the board in a terminal tab where mods do not load. `usage-watch.sh` is the usage watcher. |
| idle-compact | `/idle-compact [on\|off\|agents]` | Runs the idle board update and compaction. Swaps general-purpose subagents for the capped worker. `agents` lists subagents with their estimated size and whether a message would wake them. |

### Where the board lives

The board is one JSON file per machine, shared by every session, in the plugin data folder that Claude Code keeps for the plugin:

```text
~/.claude/plugins/data/session-board-session-kit/board.json
```

If `CLAUDE_CONFIG_DIR` is set, the file sits under that folder instead. This is the same folder as `${CLAUDE_PLUGIN_DATA}` for the plugin installed from this marketplace. It survives plugin updates.

The first session start seeds the file from `session-board/data/board.template.json`. Earlier copies of this kit kept the board inside the plugin folder at `data/board.json`. If such a board exists, it is copied to the new place once, and the old file is left where it was.

Times on the board are written in your machine's local time zone.

## What runs, what is sent, what is fetched

Neither plugin opens a network connection of its own. Everything below runs on your machine or goes through Claude Code's own model access.

**session-board**

- **Model call (Inbox capture).** A message you type while a turn is already running qualifies when it is at least 12 characters, not a slash command and not a bare "ok" or "continue". For each one, its first 4,000 characters go to Claude through Claude Code (model `sonnet`, low effort, 20-second timeout), with instructions to rewrite it as one to-do line. The answer is written to the board. Each capture uses some of your plan usage. Messages typed while Claude is idle are not sent.
- **Process (`/board check`).** Only when you type `/board check`, the plugin runs the board's `"check"` field with `bash -c`, with a 2-minute timeout. Its output is written to the Monitor section. The command is whatever you or Claude put in the board file, so keep it read-only. With no `"check"` field, nothing runs.
- **Files.**
  - Reads and writes the board file named above.
  - Reads the template, and the old in-plugin board once for the move.
  - Checks the board file's modification time every 3 seconds.
- **Environment.** Reads `CLAUDE_CONFIG_DIR` and `HOME` to find the board.

**idle-compact**

- **Prompt and compaction.** After 15 minutes with no prompt, no turn and no background agent at work, and with context at 10 % or more, it sends one prompt into your session asking for a board update. That turn uses plan usage like any other. It then asks Claude Code to compact the conversation.
- **Subagents.**
  - It registers the `idle-compact:worker` agent type and runs plain general-purpose subagents as that type.
  - Before a `SendMessage` to an idle subagent, it reads that subagent's transcript locally to estimate its size; no model call is made.
  - Above 150,000 tokens and 5 idle minutes, the message is refused, and Claude gets the subagent's task and last report to start a fresh agent from. Starting the message with `[wake]` sends it anyway.
- **Environment.** Reads `CLAUDE_CONFIG_DIR` and `HOME` to name the board file in its prompt.

**Status line and scripts (optional, run only if you install or start them)**

- `statusline.sh`:
  - reads the JSON Claude Code passes it;
  - runs `git` in the session's folder;
  - writes `$TMPDIR/claude-usage.txt` and a small cache under `$TMPDIR/claude-statusline-cache/`.
- `usage-watch.sh` reads `$TMPDIR/claude-usage.txt` every 30 seconds.
- `board-set.py` and `view.py` read, and `board-set.py` writes, the board file.

## Uninstall

```text
/plugin uninstall session-board@session-kit
/plugin uninstall idle-compact@session-kit
/plugin marketplace remove session-kit
```

Uninstalling session-board for the last time deletes its data folder, including the board. Copy `board.json` first if you want to keep it (`/board path` shows where it is). If you installed the status line, remove the `"statusLine"` setting and the `~/.claude/session-kit/` folder.

## The lessons

`session-board/skills/session-kit/guide.md` holds the board rules and the lessons from running many subagents:

- give each new task its own subagent and worktree;
- always name the model;
- never resume many large agents at once;
- watch the 5-hour usage and clean up before it runs out.

`session-board/skills/session-kit/lessons/` holds the same lessons, one per file, in Claude memory format.

## Development

```sh
claude plugin validate ./session-board
claude plugin validate ./idle-compact
claude plugin validate --strict .        # the marketplace
claude plugin test ./session-board
claude plugin test ./idle-compact
```

To work on a plugin with hot reload, start Claude Code with `--plugin-dir ./session-board` (or `./idle-compact`). For type checking, each plugin's `tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which is not in the repository (git ignores it). Copy or generate the mod types file there before running `tsc -p ./session-board`.

The two plugins are separate entries in `.claude-plugin/marketplace.json`. A directory that lists plugins one by one needs one submission for each.

## License

MIT. See [LICENSE](LICENSE).
