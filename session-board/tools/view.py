"""Terminal view of the session board, redrawn when the file changes.

Run it in a second terminal tab: python3 view.py [board.json]
Without an argument it reads $BOARD when set, else the session-board plugin's
data folder: $CLAUDE_CONFIG_DIR (or ~/.claude) /plugins/data/session-board-session-kit/board.json.
"""

import json
import os
import shutil
import sys
import textwrap
import time

DATA_ID = "session-board-session-kit"


def board_path() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    if os.environ.get("BOARD"):
        return os.environ["BOARD"]
    config = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
    return os.path.join(config.rstrip("/"), "plugins", "data", DATA_ID, "board.json")


PATH = board_path()
MARKS = {
    "run": ("▶", "\033[32m"),
    "you": ("●", "\033[33m"),
    "todo": ("○", "\033[0m"),
    "date": ("◇", "\033[36m"),
    "watch": ("~", "\033[90m"),
    "done": ("✓", "\033[90m"),
}
BOLD, DIM, ORANGE, RESET = "\033[1m", "\033[2m", "\033[38;5;173m", "\033[0m"


def render() -> str:
    width = max(40, shutil.get_terminal_size().columns - 4)
    try:
        with open(PATH) as f:
            board = json.load(f)
    except (OSError, ValueError) as error:
        return f"{PATH}: {error}"
    out = [f"{BOLD}Session board{RESET}", f"{DIM}Updated {board.get('updated', '')}{RESET}"]
    sections = board.get("sections", [])
    # Like the pane: a running section first while a line runs, hidden otherwise.
    live = lambda s: any(i.get("state") == "run" for i in s.get("items", []))
    sections = [s for s in sections if s.get("kind") == "running" and live(s)] + [
        s for s in sections if s.get("kind") != "running"
    ]
    for section in sections:
        items = section.get("items", [])
        out.append("")
        out.append(f"{BOLD}{ORANGE}{section.get('title', '')}{RESET} {DIM}{len(items)}{RESET}")
        for item in items:
            glyph, color = MARKS.get(item.get("state"), MARKS["todo"])
            lines = textwrap.wrap(item.get("text", ""), width) or [""]
            out.append(f"{color}{glyph}{RESET} {lines[0]}")
            out.extend(f"  {line}" for line in lines[1:])
            if item.get("note"):
                out.extend(f"  {DIM}{line}{RESET}" for line in textwrap.wrap(item["note"], width))
    out.append("")
    out.append(f"{DIM}▶ running ● needs you ○ to do ◇ dated ~ watching ✓ done{RESET}")
    return "\n".join(out)


def main() -> None:
    last = None
    try:
        while True:
            stamp = os.stat(PATH).st_mtime if os.path.exists(PATH) else None
            size = shutil.get_terminal_size()
            if (stamp, size) != last:
                last = (stamp, size)
                sys.stdout.write("\033[2J\033[H" + render() + "\n")
                sys.stdout.flush()
            time.sleep(3)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
