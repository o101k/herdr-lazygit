#!/usr/bin/env python3
"""Build the Lazygit layout from a Herdr main layout (stdlib only).

usage: make-layout.py <main.json> <out.json>

Patches a copy of the given layout:
  - Herdr's own `tabs` block stays exactly as it is (no size), in a row with a Lazygit button
    block beside it, so Herdr's tab bar keeps updating with Herdr.
  - The right panel's stack gets a `lazygit` page: a 30 px bar (mod lazygit-panel) over a
    hidden terminal block that the controller fills.
  - The panel column is at least 520 px wide.
Run it again after a Herdr update to pick up Herdr's latest main layout.
"""
import json
import sys


def find(node, id_):
    if node.get("id") == id_:
        return node
    for child in node.get("children", []):
        found = find(child, id_)
        if found is not None:
            return found
    return None


def find_parent(node, id_):
    for child in node.get("children", []):
        if child.get("id") == id_:
            return node
        found = find_parent(child, id_)
        if found is not None:
            return found
    return None


def die(message):
    print(f"make-layout: {message}", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        die("usage: make-layout.py <main.json> <out.json>")
    src, out = sys.argv[1], sys.argv[2]
    try:
        with open(src, encoding="utf-8") as f:
            root = json.load(f)
    except (OSError, ValueError) as e:
        die(f"cannot read {src}: {e}")

    for id_ in ("tabs", "panel", "panel-body"):
        if find(root, id_) is None:
            die(f"{src} has no '{id_}' node, so it can't be patched")
    if find(root, "lazygit") is not None:
        die(f"{src} already has a 'lazygit' node")

    # a. the tab bar: Herdr's tabs block (minus its size) beside a Lazygit button block
    parent = find_parent(root, "tabs")
    if parent is None:
        die("the 'tabs' node has no parent to hold a tab-bar row")
    index = next(i for i, c in enumerate(parent["children"]) if c.get("id") == "tabs")
    tabs = parent["children"][index]
    row = {"id": "tab-bar", "type": "row"}
    if "size" in tabs:
        row["size"] = tabs.pop("size")
    row["resizable"] = False
    row["children"] = [
        tabs,
        {"id": "lazygit-button", "type": "block", "size": {"px": 92}, "window_drag": True,
         "content": {"mod": "lazygit-button"}},
    ]
    parent["children"][index] = row

    # c. the panel column is at least 520 px wide
    panel = find(root, "panel")
    size = panel.get("size")
    if not isinstance(size, dict) or "px" not in size:
        panel["size"] = {"px": 520}
    else:
        size["px"] = max(size["px"], 520)

    # b. the Lazygit page in the panel's stack
    body = find(root, "panel-body")
    if body.get("type") != "stack":
        die("'panel-body' is not a stack")
    body.setdefault("children", []).append({
        "id": "lazygit", "type": "column", "children": [
            {"id": "lazygit-bar", "type": "block", "size": {"px": 30}, "content": {"mod": "lazygit-panel"}},
            {"id": "lazygit-term", "type": "block", "hidden": True, "content": {"terminal": "none"}},
        ]})

    with open(out, "w", encoding="utf-8") as f:
        f.write(json.dumps(root, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
