"""board-set.py: edits the session board from the shell. Each argument is one change:

  "Section|+|state|text|note"   add a line (note optional)
  "Section|N|state|text|note"   replace line N (an empty state/text keeps it, an empty note removes it)
  "Section|N|-"                 remove line N

Section is the start of a section title. States: run you todo date watch done.
"updated" is set to the current local time (the machine's time zone).

The board file is $BOARD when set, else the session-board plugin's data folder:
$CLAUDE_CONFIG_DIR (or ~/.claude) /plugins/data/session-board-session-kit/board.json.
"""

import json
import os
import sys
from datetime import datetime

DATA_ID = "session-board-session-kit"
STATES = {"run", "you", "todo", "date", "watch", "done"}


def board_path() -> str:
    if os.environ.get("BOARD"):
        return os.environ["BOARD"]
    config = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
    return os.path.join(config.rstrip("/"), "plugins", "data", DATA_ID, "board.json")


def main(changes: list[str]) -> None:
    path = board_path()
    if not os.path.exists(path):
        sys.exit(f"no board at {path}: start a session with the session-board plugin, or set BOARD")
    with open(path) as f:
        board = json.load(f)
    for arg in changes:
        part = arg.split("|")
        section = next((s for s in board["sections"] if s["title"].startswith(part[0])), None)
        if section is None:
            sys.exit(f"no section starts with {part[0]!r}")
        items = section["items"]
        if part[1] == "+":
            item = {"state": part[2], "text": part[3]}
            if len(part) > 4 and part[4]:
                item["note"] = part[4]
            if item["state"] not in STATES:
                sys.exit(f"unknown state {item['state']!r}")
            items.append(item)
        elif part[2] == "-":
            items.pop(int(part[1]))
        else:
            item = items[int(part[1])]
            if part[2]:
                if part[2] not in STATES:
                    sys.exit(f"unknown state {part[2]!r}")
                item["state"] = part[2]
            if len(part) > 3 and part[3]:
                item["text"] = part[3]
            if len(part) > 4:
                if part[4]:
                    item["note"] = part[4]
                else:
                    item.pop("note", None)
    board["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    text = json.dumps(board, indent=2, ensure_ascii=False)
    json.loads(text)
    with open(path, "w") as f:
        f.write(text + "\n")
    print("ok", board["updated"])


if __name__ == "__main__":
    main(sys.argv[1:])
