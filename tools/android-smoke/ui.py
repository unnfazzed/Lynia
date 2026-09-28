#!/usr/bin/env python3
"""On-screen elements for smoke.sh, read through uiautomator: no test framework on the device.

  ui.py texts                        print every visible text / content-desc, one per line
  ui.py has LABEL                    exit 0 if an element's text or content-desc is exactly LABEL
  ui.py wait LABEL [SECONDS]         poll until LABEL shows (default 30 s)
  ui.py tap LABEL [SECONDS]          wait for LABEL, then tap its centre
  ui.py tap --class CLASS [SECONDS]  the same for the first element of a widget class
  ui.py inside LABEL [SECONDS]       exit 0 if the control holding LABEL sits wholly inside the
                                     screen; a button cut off by the bottom edge touches it
"""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

BOUNDS = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


def adb(*args):
    return subprocess.run(["adb", *args], capture_output=True, text=True, timeout=60)


def parse(out):
    start, end = out.find("<?xml"), out.rfind("</hierarchy>")
    if start == -1 or end == -1:
        return None
    try:
        return ET.fromstring(out[start:end + len("</hierarchy>")])
    except ET.ParseError:
        return None


def dump():
    # uiautomator refuses while the UI thread is busy ("could not get idle state"), so retry briefly.
    for _ in range(3):
        root = parse(adb("exec-out", "uiautomator", "dump", "/dev/tty").stdout)
        if root is None:
            adb("shell", "uiautomator", "dump", "/sdcard/window.xml")
            root = parse(adb("exec-out", "cat", "/sdcard/window.xml").stdout)
        if root is not None:
            return root
        time.sleep(1)
    return None


def bounds(node):
    m = BOUNDS.match(node.get("bounds", ""))
    return tuple(map(int, m.groups())) if m else None


def find_node(root, label, cls):
    for node in root.iter("node"):
        if cls is not None:
            if node.get("class") != cls:
                continue
        elif label not in (node.get("text"), node.get("content-desc")):
            continue
        box = bounds(node)
        if box and box[2] > box[0] and box[3] > box[1]:
            return node
    return None


def find(root, label, cls):
    node = find_node(root, label, cls)
    if node is None:
        return None
    x1, y1, x2, y2 = bounds(node)
    return (x1 + x2) // 2, (y1 + y2) // 2


def inside(root, label):
    """The label's clickable control (its text alone can sit on screen while the button runs off it)."""
    node = find_node(root, label, None)
    if node is None:
        return False
    parents = {child: parent for parent in root.iter() for child in parent}
    control = node
    while control.get("clickable") != "true" and control in parents:
        control = parents[control]
    if control.get("clickable") != "true":
        control = node
    screen = bounds(next(root.iter("node")))
    box = bounds(control)
    print(f"{label}: control {box} on screen {screen}")
    return screen[1] < box[1] and box[3] < screen[3]


def wait(label, cls, seconds):
    deadline = time.time() + seconds
    while True:
        root = dump()
        hit = find(root, label, cls) if root is not None else None
        if hit is not None or time.time() >= deadline:
            return hit
        time.sleep(1)


def main(argv):
    cmd, rest = argv[0], argv[1:]
    if cmd == "texts":
        root = dump()
        if root is None:
            return 1
        for node in root.iter("node"):
            for key in ("text", "content-desc"):
                value = (node.get(key) or "").strip()
                if value:
                    print(value)
        return 0
    label = cls = None
    if rest[:1] == ["--class"]:
        cls, rest = rest[1], rest[2:]
    else:
        label, rest = rest[0], rest[1:]
    if cmd == "has":
        root = dump()
        return 0 if root is not None and find(root, label, cls) is not None else 1
    hit = wait(label, cls, float(rest[0]) if rest else 30.0)
    if cmd == "inside":
        root = dump() if hit is not None else None
        return 0 if root is not None and inside(root, label) else 1
    if hit is None:
        print(f"not on screen: {label or cls}", file=sys.stderr)
        return 1
    if cmd == "tap":
        adb("shell", "input", "tap", str(hit[0]), str(hit[1]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
