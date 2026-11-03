---
name: watch-five-hour-limit
description: Watch the 5-hour plan usage (the statusline writes $TMPDIR/claude-usage.txt) and run the cleanup before it hits the limit
metadata:
  type: feedback
---

Watch the 5-hour plan usage and clean up before it runs out.

**Why:** an agent cut off by the limit mid-task loses its working state, and resuming it later re-reads its whole transcript in one burst (see [[resume-agents-compact]]). An 85% mark proved too late once: six large-model agents burned the last 25% in minutes, and the main session shares the same allowance, so it could not clean up either. Measured once: three large-model agents doing build and test work took the 5-hour window from 50% to 79% in about 45 minutes.

**How to apply:**
- The kit's statusline writes `<epoch> <5h%> <5h reset epoch> <7d%> <7d reset epoch>` to `$TMPDIR/claude-usage.txt` on every redraw. Read it before spawning or resuming agents.
- Keep `usage-watch.sh 65` (in the session-board plugin's `tools/`) running in the background: it exits at 65%, or on a rise of more than 10 points in 2 minutes. Start it again every time it fires and whenever agents are running. With several large-model agents at work, an early warning at a lower mark alongside is fine.
- Before spawning: if 5-hour usage is over ~60%, start at most 1–2 agents, or wait for the reset. Never run more than 3 large-model agents at once.
- At the mark, run the cleanup: stop all running subagents (their work is in local commits), write each one's handoff (branch, SHAs, what's left) from `git log`/`git status` into the board, update the board, then compact.
- After the reset, restart from the handoffs, 2–3 at a time, never by resuming the old transcripts.
