---
name: clear-idle-subagents
description: Stop finished subagents once their results are taken; do not leave idle agents listed
metadata:
  type: feedback
---

Stop a subagent as soon as its work is reviewed and nothing further depends on it. After a long orchestration session, a dozen idle agents can sit in the agent list.

**Why:** idle agents clutter the list the person watches, and people sometimes message agents directly, so a stale agent can answer from an outdated picture (for example, an agent whose work was already replaced by a newer one).

**How to apply:** after reading an agent's report and sending any follow-up, stop it (TaskStop with its name). Keep only agents that are running, or that the person is still giving feedback to. Related: [[parallel-agents-workflow]], [[delete-merged-worktrees]].
