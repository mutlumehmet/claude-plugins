#!/usr/bin/env python3
"""Fleet session names: `<base> #<n> · <label>`, for example `Lane 38 #4 · page access`.

In a project with several fleets the base carries the fleet, so a name says whose session it is:
`Lane v1 38 #5 · page access`, `Orchestrator agentic #1`, `Admiral #2`. Checkers serve every fleet
and keep `Checker A #17 · demo checks`. Lane numbers stay unique across the project.

The base is the role and its id (`Lane 38`, `Checker A`), `#<n>` counts handovers, and the label
says in at most three plain words what the lane works on. The number and the label are optional,
so names from before labels (`Lane 4 #3`, `Lane 1`) still parse.

Usage: names.py next "<name>" [--label "<new label>"] [--fleet <id>]   the successor's name
       names.py lane <fleet> <N> [--label "<label>"]   a new lane's name: `Lane <fleet> <N> · <label>`
       names.py orchestrator <fleet>                  a new orchestrator's name: `Orchestrator <fleet> #1`
       names.py fleet "<name>"                        the fleet a name carries, or nothing
       names.py number "<name>"                       a lane's number (`38`), for matching a lane
       names.py slug "<name>"                         the handoff note's file name part
       names.py base "<name>"                         `Lane 38`, for matching a lane by id
       names.py check "<name>"                        exit 1 with the reason if the label breaks the rule

A handover keeps the label: `Lane 38 #4 · page access` becomes `Lane 38 #5 · page access`.
With `--fleet`, an older name moves to the fleet pattern at its handover: `Lane 38 #4` becomes
`Lane v1 38 #5`, and `sprint 26 orchestrator` becomes `Orchestrator v1 #27`.
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


_LANE = re.compile(r"^Lane\s+(?:(?P<fleet>[a-z][a-z0-9-]*)\s+)?(?P<num>\d+)$")
_ORCH = re.compile(r"^Orchestrator\s+(?P<fleet>[a-z][a-z0-9-]*)$")


def lane_name(fleet, num, label=None):
    return build(f"Lane {fleet} {num}", None, label)


def orchestrator_name(fleet, n=1):
    return build(f"Orchestrator {fleet}", n)


def fleet_of(name):
    """The fleet a lane or orchestrator name carries, else None."""
    base = parse(name)[0]
    m = _LANE.match(base) or _ORCH.match(base)
    return m.group("fleet") if m and m.group("fleet") else None


def lane_number(name):
    m = _LANE.match(parse(name)[0])
    return m.group("num") if m else None


def next_name(name, label=None, fleet=None):
    """The successor's name: the number raised by one (a name without one gets #2), same label
    unless a new one is given. With a fleet, an older name moves to the fleet pattern."""
    base, n, old = parse(name)
    if fleet:
        lane = _LANE.match(base)
        if lane:
            base = f"Lane {fleet} {lane.group('num')}"
        elif "orchestrator" in base.lower():
            if n is None:  # `sprint 26 orchestrator`: carry its number on
                digits = re.findall(r"\d+", base)
                n = int(digits[-1]) if digits else None
            base = f"Orchestrator {fleet}"
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
    ap.add_argument("action", choices=["next", "slug", "base", "check", "lane", "orchestrator", "fleet", "number"])
    ap.add_argument("name")
    ap.add_argument("num", nargs="?")
    ap.add_argument("--label")
    ap.add_argument("--fleet")
    a = ap.parse_args()
    if a.action in ("next", "lane"):
        problem = label_problem(a.label)
        if problem:
            print(problem, file=sys.stderr)
            return 1
    if a.action == "next":
        print(next_name(a.name, a.label, a.fleet))
    elif a.action == "lane":
        if not a.num or not a.num.isdigit():
            print("usage: names.py lane <fleet> <N> [--label ...]", file=sys.stderr)
            return 2
        print(lane_name(a.name, a.num, a.label))
    elif a.action == "orchestrator":
        print(orchestrator_name(a.name))
    elif a.action == "fleet":
        print(fleet_of(a.name) or "")
    elif a.action == "number":
        print(lane_number(a.name) or "")
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
