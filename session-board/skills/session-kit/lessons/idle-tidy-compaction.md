---
name: idle-tidy-compaction
description: After 45 idle minutes, stop finished subagents, update the session board, then compact if context is above 10%
metadata:
  type: feedback
---

When the session sits idle for 45 minutes, tidy it: stop finished subagents, update the session board, then compact the conversation if its context is at 10% or more.

**Why:** long sessions accrete context and idle agents. The board must hold the state that compaction would otherwise blur, so it is updated first.

**How to apply:** install the `idle-compact` plugin. After 45 minutes with no prompt and no background agent at work, it submits one turn asking for a board update, then calls `$.session.compact()` when the context is at 10% or more. It fires once per idle stretch; the next prompt or turn arms it again. `/idle-compact off` turns it off. Related: [[clear-idle-subagents]], [[session-board-source-of-truth]], [[session-panel-means-mod]].
