#!/usr/bin/env python3
"""Fleet session names: `<base> #<n> · <label>`, for example `Lane 38 #4 · page access`.

The base is the role and its id (`Lane 38`, `Checker A`), `#<n>` counts handovers, and the label
says in at most three plain words what the lane works on. The number and the label are optional,
so names from before labels (`Lane 4 #3`, `Lane 1`) still parse.

Usage: names.py next "<name>" [--label "<new label>"]   the successor's name
       names.py slug "<name>"                         the handoff note's file name part
       names.py base "<name>"                         `Lane 38`, for matching a lane by id
       names.py check "<name>"                        exit 1 with the reason if the label breaks the rule

A handover keeps the label: `Lane 38 #4 · page access` becomes `Lane 38 #5 · page access`.
"""

import argparse
import re
import sys

sys.dont_write_bytecode = True

DOT = "·"  # the middle dot between the number and the label
MAX_WORDS = 3

_NAME = re.compile(
    r"^\s*(?P<base>[^#·]*?)\s*"
    r"(?:#\s*(?P<n>\d+)\s*)?"
    r"(?:·\s*(?P<label>.*?))?\s*$"
)


def parse(name):
    """(base, number or None, label or None). Never fails: an odd name is all base."""
    m = _NAME.match(name or "")
    if not m:
        return (name or "").strip(), None, None
    n = int(m.group("n")) if m.group("n") else None
    label = (m.group("label") or "").strip() or None
    return m.group("base").strip(), n, label


def build(base, n=None, label=None):
    out = base
    if n is not None:
        out += f" #{n}"
    if label:
        out += f" {DOT} {label}"
    return out


def next_name(name, label=None):
    """The successor's name: the number raised by one (a name without one gets #2), same label
    unless a new one is given."""
    base, n, old = parse(name)
    return build(base, (n or 1) + 1, label if label else old)


def slug(name):
    """`Lane 4 #4 · page access` -> `lane-4-4`. The label stays out, so note names stay stable."""
    base, n, _ = parse(name)
    text = build(base, n).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def label_problem(label):
    """Why a label breaks the rule, or None. At most three words, plain English, no ids."""
    if not label:
        return None
    words = label.split()
    if len(words) > MAX_WORDS:
        return f"label '{label}' has {len(words)} words; at most {MAX_WORDS}"
    if any(c in label for c in "§#"):
        return f"label '{label}' carries a section or issue number; say what the work is instead"
    if any(re.search(r"\d", w) for w in words):
        return f"label '{label}' carries a number or id; say what the work is instead"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["next", "slug", "base", "check"])
    ap.add_argument("name")
    ap.add_argument("--label")
    a = ap.parse_args()
    if a.action == "next":
        problem = label_problem(a.label)
        if problem:
            print(problem, file=sys.stderr)
            return 1
        print(next_name(a.name, a.label))
    elif a.action == "slug":
        print(slug(a.name))
    elif a.action == "base":
        print(parse(a.name)[0])
    else:
        problem = label_problem(parse(a.name)[2])
        if problem:
            print(problem, file=sys.stderr)
            return 1
        print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
