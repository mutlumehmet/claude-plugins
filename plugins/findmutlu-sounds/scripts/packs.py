#!/usr/bin/env python3
"""Writes FILE_PACKS in hooks/register.js from sounds/<pack>/pack.json.

A file pack is a folder under sounds/ with its clips, a CREDITS.md naming the source and license
of every clip, and a pack.json: {"label": "...", "<moment>": ["clip.m4a", ...], ...} for the
moments ordered, needsYou, longDone, subagent, failed, pushed and compacted.

  python3 scripts/packs.py          rewrite the block
  python3 scripts/packs.py --check  fail when the block is out of date (CI)
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULE = ROOT / "hooks" / "register.js"
MOMENTS = ["ordered", "needsYou", "longDone", "subagent", "failed", "pushed", "compacted"]
START = "// FILE_PACKS_START"
END = "// FILE_PACKS_END"


def build():
    packs = {}
    for manifest in sorted((ROOT / "sounds").glob("*/pack.json")):
        folder = manifest.parent
        data = json.loads(manifest.read_text())
        if not (folder / "CREDITS.md").exists():
            sys.exit(f"{folder.name}: CREDITS.md missing")
        pack = {"label": data["label"]}
        for moment in MOMENTS:
            clips = data.get(moment, [])
            for clip in clips:
                if not (folder / clip).exists():
                    sys.exit(f"{folder.name}: {clip} missing")
            pack[moment] = clips
        packs[folder.name] = pack
    body = json.dumps(packs, indent=2, ensure_ascii=True)
    return "const FILE_PACKS = " + body + "\n"


def main():
    text = MODULE.read_text()
    head, rest = text.split(START, 1)
    first_line, rest = rest.split("\n", 1)
    _, tail = rest.split(END, 1)
    new = head + START + first_line + "\n" + build() + END + tail
    if "--check" in sys.argv:
        if new != text:
            sys.exit("FILE_PACKS is out of date: run python3 scripts/packs.py")
        return
    MODULE.write_text(new)


main()
