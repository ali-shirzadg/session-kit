---
name: separate-tasks-to-agents
description: "A new, separate task added mid-session goes to a subagent; \"do it yourself\" applies only to the task it was said about"
metadata:
  type: feedback
---

When the person says "do it yourself" about one task and later adds unrelated tasks, the later ones still go to subagents.

**Why:** the main session should stay the orchestrator for independent tasks. A "do it yourself" instruction is scoped to the task it was given for, not a session-wide rule.

**How to apply:**
- When a new independent task arrives mid-session, spawn a subagent for it (one worktree each, an explicit cheaper model, never push), unless the person says to do that task directly.
- Keep doing directly only the task the person explicitly asked you to do yourself.

Related: [[parallel-agents-workflow]], [[clear-idle-subagents]].
