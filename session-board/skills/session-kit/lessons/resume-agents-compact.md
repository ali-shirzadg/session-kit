---
name: resume-agents-compact
description: Never resume many large-context paused agents at once; restart them from a compact handoff instead
metadata:
  type: feedback
---

Resuming seven paused agents at once with SendMessage, after a usage-limit pause, made each one re-read its whole transcript (some over 100k tokens). The 5-hour usage jumped by about 20 points in one burst.

**Why:** resuming re-sends the agent's full prefix, uncached after a long pause, so N large agents at once means N full context re-reads.

**How to apply:**
- After a pause longer than the cache life (a usage limit, hours idle), don't resume a big agent with SendMessage. Read what it left in its worktree (`git log`, `git status`, a progress note) and spawn a fresh agent with a short handoff: the goal, what's done (SHAs, files), what's left, and the rules.
- Have agents keep a short progress note in their worktree (for example `.agent-progress.md`, not committed), updated at each commit, so a handoff needs no transcript.
- For long tasks, use the `idle-compact:worker` agent type (it compacts itself at 200k tokens), or split the work so no agent grows past ~100k.
- Never restart more than 2–3 agents at once.
- SendMessage is fine for a small agent paused briefly (minutes, still cached). The `idle-compact` plugin refuses to wake a large idle agent and answers with its brief instead.

Related: [[parallel-agents-workflow]], [[clear-idle-subagents]].
