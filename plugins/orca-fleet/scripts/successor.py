#!/usr/bin/env python3
"""Start a fresh Claude Code session that takes over from this one, in a new Terminal.app tab.

A handover starts a NEW session (never a fork): it gets an empty context and reads the handover
note as its first prompt. It runs in the same account as this session (the same CLAUDE_CONFIG_DIR)
and in the given folder.

Usage: successor.py --name "<Lane 4 #4>" --prompt "<first prompt>" [--cwd <folder>] [--dry-run]

Outside macOS Terminal.app (or with --dry-run) it does not open anything: it prints the command
and copies it to the clipboard, for the person to paste in a new terminal tab.
"""

import argparse
import os
import shlex
import subprocess
import sys


def command(name, prompt, cwd):
    cfg = os.environ.get("CLAUDE_CONFIG_DIR")
    env = f"CLAUDE_CONFIG_DIR={shlex.quote(cfg)} " if cfg else ""
    dev = os.environ.get("CLAUDE_CODE_PLUGIN_DIRS")  # plugins loaded from folders while developing
    if dev:
        env += f"CLAUDE_CODE_PLUGIN_DIRS={shlex.quote(dev)} "
    # `command claude` skips any shell function or alias named claude, so the account stays this one
    return f"cd {shlex.quote(cwd)} && {env}command claude -n {shlex.quote(name)} {shlex.quote(prompt)}"


def open_tab(line):
    esc = line.replace("\\", "\\\\").replace('"', '\\"')
    r = subprocess.run(["osascript", "-e", f'tell application "Terminal" to do script "{esc}"'],
                       capture_output=True, text=True, timeout=20)
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--cwd", default=os.getcwd())
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    line = command(a.name, a.prompt, os.path.abspath(os.path.expanduser(a.cwd)))
    if not a.dry_run and os.environ.get("TERM_PROGRAM") == "Apple_Terminal" and open_tab(line):
        print(f"Opened a new Terminal window for {a.name}.")
        return 0
    subprocess.run(["pbcopy"], input=line, text=True)
    print("Could not open a tab here. Paste this in a new terminal tab (it is on the clipboard):")
    print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
