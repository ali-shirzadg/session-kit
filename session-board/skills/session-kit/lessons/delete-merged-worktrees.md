---
name: delete-merged-worktrees
description: When a branch is merged, remove its worktree and the local resources it started (database containers, volumes)
metadata:
  type: feedback
---

When an agent's branch is merged, delete its worktree and everything local that the worktree started.

**Why:** a toolchain that gives each checkout its own local database (a Docker Postgres per worktree, for example) leaves those containers and volumes running after the worktree is gone. A few dozen of them slow a laptop to a crawl. Merged worktrees also confuse which code runs on which port.

**How to apply:** after a merge, or at the latest when listing worktrees:
1. Find the containers and volumes the worktree's toolchain created (by name or label), stop and remove them one at a time, then remove their volumes.
2. `git worktree remove <path>` (no `--force`) when it is clean, then `git branch -d <branch>` and `git worktree prune`.
3. Also remove containers whose project folder no longer exists.

Keep: dirty worktrees, fresh branches with no commits yet, unmerged branches, the main checkout's own databases, and any shared daemon or dev server. Related: [[parallel-agents-workflow]], [[clear-idle-subagents]].
