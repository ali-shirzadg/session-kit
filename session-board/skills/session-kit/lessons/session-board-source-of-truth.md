---
name: session-board-source-of-truth
description: "The session board is the source of truth for status; keep it current, short lines, grouped by topic"
metadata:
  type: feedback
---

Use the session board as the source of truth: always current, short lines, grouped by topic.

**Why:** a board grouped by state ("Running now", "Waiting on you", "Done") grows into long notes and goes stale between turns, still showing shipped work as pending.

**How to apply:**
- Update the board file (`/board path` shows where it is) whenever a status changes, in the same turn, not only at the end.
- Group sections by topic (a release, Production, Partners, Decisions, Housekeeping), not by state; the item `state` carries run/you/todo/date/watch/done.
- One short line per item; a note only when a link, number or command is needed.
- Drop finished history beyond today; never drop open items when shortening.
- The Inbox section is filled by the plugin: each ask typed while a turn runs is distilled into one line there. Read it first when picking work up, and move a line to its topic (or remove it) once handled.

Related: [[session-panel-means-mod]], [[inbox-auto-answer]].
