---
name: parallel-agents-workflow
description: "Running several edits at once: cheaper-model subagents, one git worktree each, integrate on a branch, the person merges"
metadata:
  type: feedback
---

When several edits run at once:

- The main session orchestrates. Implementation goes to subagents on a mid-size model, and mechanical lookups to a small one, to save tokens.
- Each parallel agent gets its own git worktree, never the shared checkout.
- Agents' branches are merged into an integration branch (for example `dev`), which reaches `main` in batches through one pull request. The person merges to `main`.
- People also message agents directly, so an agent report citing feedback the orchestrator never relayed is expected, not a fault.

**Why:** two agents sharing one checkout break each other's checks (a type error in one agent's half-finished file fails the other's type check), and no commit can be verified on its own.

**How to apply:** spawn with `isolation: "worktree"`, branch from the integration branch, give each agent its own dev-server port, and have it commit on its own branch without pushing; merge after review. Where agents share one local database, only one at a time may write migrations. Related: [[clear-idle-subagents]], [[delete-merged-worktrees]].
