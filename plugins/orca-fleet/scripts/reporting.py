#!/usr/bin/env python3
"""A lane's reporting line: who it reports to, saved where orca-peers can show it.

Usage: reporting.py orchestrator|parent|independent [--name <title>] [--address uds:<socket>] [--session <id>]
       reporting.py --self     print this session's own name, address and sessionId as JSON

It finds this session from its own process ancestors and the pid records at
`<config dir>/sessions/<pid>.json`, and writes one file:
`~/.config/orca-strator/reporting/<sessionId>.json`. Nothing is written to a config dir.
"""

import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

KINDS = ("orchestrator", "parent", "independent")
REPORTING_DIR = Path("~/.config/orca-strator/reporting").expanduser()


def ancestors():
    pid = os.getppid()
    for _ in range(12):
        if pid <= 1:
            return
        yield pid
        try:
            out = subprocess.run(["ps", "-p", str(pid), "-o", "ppid="],
                                 capture_output=True, text=True, timeout=5).stdout.strip()
            pid = int(out)
        except (ValueError, OSError, subprocess.SubprocessError):
            return


def config_dirs():
    env = os.environ.get("CLAUDE_CONFIG_DIR")
    dirs = [env] if env else []
    home = str(Path.home())
    return dirs + [os.path.join(home, ".claude")] + sorted(glob.glob(os.path.join(home, ".claude-*")))


def this_session():
    """The pid record of the Claude Code session this script runs under, or None."""
    for pid in ancestors():
        for d in config_dirs():
            try:
                rec = json.loads(Path(d, "sessions", f"{pid}.json").read_text())
            except (OSError, ValueError):
                continue
            if isinstance(rec, dict) and rec.get("pid") == pid and rec.get("sessionId"):
                return rec
    return None


def identity(rec):
    sock = rec.get("messagingSocketPath")
    return {
        "name": rec.get("name") or Path(rec.get("cwd") or "untitled").name,
        "address": f"uds:{sock}" if sock else None,
        "sessionId": rec["sessionId"],
    }


def record(rec, line):
    """Write the line atomically, so peers never reads half a file."""
    REPORTING_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTING_DIR / f"{os.path.basename(rec['sessionId'])}.json"
    fd, tmp = tempfile.mkstemp(dir=REPORTING_DIR)
    with os.fdopen(fd, "w") as f:
        json.dump(line, f)
    os.replace(tmp, path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", nargs="?", choices=KINDS)
    ap.add_argument("--name")
    ap.add_argument("--address")
    ap.add_argument("--session")
    ap.add_argument("--self", action="store_true", dest="whoami")
    a = ap.parse_args()
    if not a.whoami and not a.kind:
        ap.error(f"say one of {', '.join(KINDS)}, or --self")
    rec = this_session()
    if not rec:
        print("Could not find this session's pid record (run this from inside a Claude Code session).",
              file=sys.stderr)
        return 1
    if a.whoami:
        print(json.dumps(identity(rec)))
        return 0
    line = {"kind": a.kind, "updatedAt": int(time.time())}
    line.update({k: v for k, v in (("name", a.name), ("address", a.address), ("session", a.session)) if v})
    record(rec, line)
    print(f"Recorded: reports to {a.kind}{' ' + a.name if a.name else ''}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
