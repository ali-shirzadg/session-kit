# Lessons

Lessons from long Claude Code sessions with many subagents. Each file is one lesson in Claude memory format (frontmatter, then **Why** and **How to apply**), so it can be copied into a project's memory folder (`~/.claude/projects/<project>/memory/`, plus one line in its `MEMORY.md`). Keep the idea and adapt the commands to your toolchain.

`../guide.md` holds the short current version of all of them; when a lesson and the guide disagree, the guide wins.

| Lesson | In one line |
| --- | --- |
| [session-board-source-of-truth](session-board-source-of-truth.md) | Board updated on every status change; topical sections; short lines |
| [session-panel-means-mod](session-panel-means-mod.md) | "A panel for the session" means a mod pane beside the chat, not a web page |
| [inbox-auto-answer](inbox-auto-answer.md) | After each task, handle the board Inbox unprompted |
| [idle-tidy-compaction](idle-tidy-compaction.md) | 15 min idle: update the board, compact if ≥ 10 % |
| [watch-five-hour-limit](watch-five-hour-limit.md) | Usage watch at 65 %; the cleanup sequence at the mark |
| [resume-agents-compact](resume-agents-compact.md) | Never mass-resume big agents; fresh agent from a short handoff |
| [clear-idle-subagents](clear-idle-subagents.md) | Stop agents once their result is read |
| [separate-tasks-to-agents](separate-tasks-to-agents.md) | New independent task mid-session → its own subagent |
| [parallel-agents-workflow](parallel-agents-workflow.md) | One worktree per agent; integrate on a branch; the person merges |
| [delete-merged-worktrees](delete-merged-worktrees.md) | After merge remove the worktree and its local containers/volumes |
| [finish-once-started](finish-once-started.md) | Don't stop to ask "should I carry on?" |
