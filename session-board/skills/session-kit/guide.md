# Session kit guide: board rules, subagent and usage lessons

The authority for the `session-kit` skill. Learned in long Claude Code sessions with many subagents.

**Background sessions:** the job tmp folder (`$CLAUDE_JOB_DIR/tmp`) is deleted when the session closes. Keep plans, research, scripts and PR texts in a durable folder instead.

## What the plugins do

| Piece | What it does |
| --- | --- |
| `session-board` plugin | A pane beside the chat (command `/board`) that shows the board file, redrawn when the file changes. Also captures every message typed while a turn runs into an "Inbox (your asks, captured)" section, so nothing is lost while you work. `/board path` prints the file's path; `/board check` refreshes the Monitor section. |
| `idle-compact` plugin | After 45 min with no prompt and no running background agents, asks for one board update, then compacts the conversation if context is ≥ 10 %. Also runs general-purpose subagents as the `idle-compact:worker` type (compacts itself at 200k tokens) and refuses to wake a large idle subagent (≥ 150k tokens, idle ≥ 5 min), answering with a brief to start a fresh one instead. `/idle-compact` shows its state; `/idle-compact off` turns it off. |
| `tools/board-set.py` | Edits the board from the shell: `python3 board-set.py "Section|+|state|text|note"`, `"Section|N|state|text|note"` (an empty state or text keeps the old value, an empty note removes it), `"Section|N|-"` (remove). Section = the start of a title. Sets `updated` to local time. States: `run you todo date watch done`. Reads the plugin data folder's board unless `BOARD=<path>` is set. |
| `tools/usage-watch.sh` | Background watcher on the 5-hour usage: exits (waking you) at a mark (default 65) or on a rise of > 10 points in 2 min. Needs the kit's statusline. |
| `tools/view.py` | Terminal viewer of the same board, for when mods do not load: `python3 view.py` in a second tab. |

The board is one file per machine (in the plugin data folder), shared by every session. Keep its sections by topic, so work from several projects can sit side by side, or clear it when you switch projects.

## Board rules

- The board is the source of truth. Update it **whenever a status changes, in the same turn**, not only at the end. Re-read before writing; keep valid JSON.
- Sections by **topic** (a release, Production, Partners, Next releases, Decisions, Housekeeping), not by state; the item `state` carries run/you/todo/date/watch/done.
- One short line per item; a note only when a link, number or command is needed.
- **Finished lines leave the board.** A line that is done (and not still watched) moves to `Done today` in the same turn. At the start of a new day, earlier `Done today` lines go to a notes archive, not the board. Only open work stays in the other sections.
- `"updated"` holds the local time as `YYYY-MM-DD HH:MM`.

### Sections

| Section | What it is for | Rule |
| --- | --- | --- |
| `Inbox (your asks, captured)` | Asks typed mid-turn, captured by the hook | Answer or act on each after every task, then remove it. |
| `Next steps (what to do now)` | The answer to "what now?": a short ranked list, each line says who acts and what happens next | Rewrite it after each task and whenever the user asks what to do. A decision that blocks work is a `you` line at the top. End with one line naming blocking questions, or "none". |
| `Running now` (`"kind": "running"`) | Work actually running: agents, builds, releases | Only `run` lines. The pane draws it first while a line runs and hides it when none does. A finished run moves to `Done today`. |
| `Your actions` | Things only the user can do (accounts, keys, DNS, email, merges) | `you` lines; done ones leave. |
| `Monitor` (`"kind": "monitor"`) | Live numbers | `/board check` runs the board's `"check"` command line (keep it read-only; it prints a JSON array of `{state,text,note}`), replaces the lines the last check wrote and keeps hand-written ones. Run it when the user asks, before answering "what now?", and after a deploy. |
| Topic sections | Long workstreams with their own history | Keep while the topic is live. |
| `Parked / later` | Ideas and questions not being worked on | Pull into Next steps when they become relevant. A question that does not block goes here as `Q (not blocking): ...`. |
| `Done today` | Today's finished lines | Archived daily (see above). |

- **Inbox:** after each task, read the Inbox, act on or answer each item, then remove it. Pushes, merges, deploys and production writes still need the user's word.

## Subagents: lessons that cost real money or time

- **New independent task mid-session → a subagent**, one git worktree each, unless the user says "do it yourself" (that is scoped to that one task).
- **Always pass `model` explicitly**; an unset model inherits the session's (often most expensive) model. Never `fork` for fan-out (it inherits the whole context and model). At most **3 large-model agents** at once.
- **Every spawn prompt** carries: the goal and why, output format with a size cap ("return only X, under 20 lines"), sources and tools to use, and hard boundaries (files, branches, ports, commands not to run, no push/merge/deploy, no production writes).
- **Big jump lesson:** resuming 7 large agents at once after a pause made each re-read its whole transcript, and usage jumped about 20 points. After a pause longer than the cache life, do **not** SendMessage a big agent; read its worktree (`git log`, `git status`, a progress note) and spawn a **fresh** agent with a short handoff. Have agents keep an uncommitted `.agent-progress.md` in their worktree. Never restart more than 2–3 agents at once.
- **Usage watch:** at the mark, stop all running subagents (their work is in local commits), write each one's handoff (branch, SHAs, what's left) into the board, update the board, then compact. An 85 % mark was too late once (6 large-model agents burned the last 25 % in minutes, and the main session shares the allowance); 65 % is the default. Before spawning, if 5-hour usage is over ~60 %, start at most 1–2 agents. Measured once: 3 large-model agents doing build and test work took the window from 50 % to 79 % in about 45 minutes, so with several running keep an earlier warning watch alongside the main mark.
- **Clear idle subagents** once their result is read and nothing depends on them (TaskStop). Stale agents answer from an outdated picture.
- **Clean up after merge:** remove the worktree and its local database containers and volumes, then delete the branch. Never kill shared dev servers or daemons.
- **Agents never write to production**, and never push, merge or deploy.
- Agent reports are the agent's words, not the user's approval.

## Working style rules worth keeping

- "commit" means commit locally only. Push, merge or deploy only when the user says those words.
- Finish once started: don't stop to ask "should I carry on?"; stop only for a real blocker or a decision that is the user's.
- Never put secret values in a command, a repository file or output; pass them through stdin. If an action is blocked by a permission rule, write a script for the user to run.
- Research before recommending (cite sources); label numbers as measured or projected.
- Verify UI changes at a phone and a desktop width before calling them done; verify deploys live.
- Dates and times in the project's own time zone, not UTC by default.
