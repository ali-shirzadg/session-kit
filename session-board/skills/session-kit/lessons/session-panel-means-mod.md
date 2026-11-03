---
name: session-panel-means-mod
description: "A request for a session sidebar or panel means a Claude Code mod pane beside the chat, not a web page"
metadata:
  type: feedback
---

When the person asks for a sidebar, panel or status view "for this session" (all the subjects of the session, what should be done and what is coming up), they mean a pane beside the chat drawn by a Claude Code mod, not a published web page or document.

**Why:** a web page is a separate place to look and goes stale; a pane beside the chat updates while work happens.

**How to apply:** use the `session-board` plugin (`/board`). Its pane polls a data file, so it updates mid-turn; keep that file current as work changes. Reports meant for other people can still be web pages or documents when asked for. Where mods do not load (an older Claude Code, or mods turned off), run `tools/view.py` from the session-board plugin in a second terminal tab: it draws the same file.
