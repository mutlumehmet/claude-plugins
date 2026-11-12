#!/usr/bin/env python3
"""Start a fresh Claude Code session that takes over from this one, in a new Terminal.app tab.

A handover starts a NEW session (never a fork): it gets an empty context and reads the handover
note as its first prompt. It runs in the given folder and, unless --account says otherwise, in the
same account as this session (the same CLAUDE_CONFIG_DIR). The same script starts a new lane.

Usage: successor.py --name "<Lane 4 #4 · page access>" --prompt "<first prompt>" [--cwd <folder>] [--dry-run]
                    [--account <id>] [--reports-to orchestrator|parent|independent|admiral] [--fleet <id>]

--account takes an id from `accounts_file:` in ~/.config/orca-strator/config.yaml (the same lookup
as orca-peers), so nobody sets CLAUDE_CONFIG_DIR by hand. --reports-to adds a `reports-to:` line to
the prompt for join-lane; with `parent` it names this session, with its current address. Without
these flags the command is what it always was. --fleet adds `fleet:<id>` to that line, for a project
that runs several fleets (see fleets.py): the lane records it and answers only its own fleet's
orchestrator. An orchestrator or the Admiral uses this same script to start a lane, a checker or a
new fleet's orchestrator.

--name is `<base> #<n> · <label>` (see names.py); the label is optional, so older names still
work, but a label longer than three words or carrying an id is refused before anything opens.

Outside macOS Terminal.app (or with --dry-run) it does not open anything: it prints the command
and copies it to the clipboard, for the person to paste in a new terminal tab.
"""

import argparse
import glob
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the plugin's folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python3 -I leaves it out
import names  # noqa: E402
import reporting  # noqa: E402

CONFIG = Path("~/.config/orca-strator/config.yaml").expanduser()


def known_accounts():
    """{id: real config dir}, the same lookup as orca-peers: accounts_file, else the folders."""
    found = {}
    reg = None
    try:
        for line in CONFIG.read_text().splitlines():
            m = re.match(r"\s*accounts_file\s*:\s*(.*?)\s*$", line)
            if m and not line.lstrip().startswith("#"):
                reg = m.group(1).strip("'\"")
    except OSError:
        pass
    if reg:
        try:
            data = json.loads(Path(reg).expanduser().read_text())
            for ident, a in (data.get("accounts") or {}).items():
                if isinstance(a, dict) and a.get("configDir"):
                    found[ident] = os.path.realpath(os.path.expanduser(a["configDir"]))
        except (OSError, ValueError) as e:
            print(f"Could not read accounts_file {reg} ({e}); looking for config dirs instead.", file=sys.stderr)
    if not found:
        home = Path.home()
        found["default"] = os.path.realpath(home / ".claude")
        for d in sorted(glob.glob(str(home / ".claude-*"))):
            if os.path.isdir(os.path.join(d, "sessions")):
                found[os.path.basename(d)[len(".claude-"):]] = os.path.realpath(d)
    return {k: v for k, v in found.items() if os.path.isdir(v)}


def account_env(account):
    """The shell prefix that puts the new session on this account. ~/.claude is the default account
    only with the variable unset (Claude Code keeps a different login for it when it is set)."""
    known = known_accounts()
    if account not in known:
        print(f"Unknown account: {account}. Known: {', '.join(sorted(known)) or 'none'}.", file=sys.stderr)
        return None
    if known[account] == os.path.realpath(Path.home() / ".claude"):
        return "unset CLAUDE_CONFIG_DIR && "
    return f"export CLAUDE_CONFIG_DIR={shlex.quote(known[account])} && "


def reports_to_line(kind, fleet=None):
    """The line join-lane reads at the end of the prompt, or None when it cannot be made."""
    tail = f" fleet:{fleet}" if fleet else ""
    if kind != "parent":
        return f"reports-to: {kind}{tail}"
    rec = reporting.this_session()
    me = reporting.identity(rec) if rec else None
    if not me or not me["address"]:
        print("Cannot use --reports-to parent: this session's own address was not found. "
              "Run it from inside the parent session.", file=sys.stderr)
        return None
    name = me["name"].replace('"', "'")
    return f'reports-to: parent "{name}" {me["address"]} session:{me["sessionId"]}{tail}'


def command(name, prompt, cwd, account_prefix=None):
    cfg = os.environ.get("CLAUDE_CONFIG_DIR")
    env = f"CLAUDE_CONFIG_DIR={shlex.quote(cfg)} " if cfg and account_prefix is None else ""
    dev = os.environ.get("CLAUDE_CODE_PLUGIN_DIRS")  # plugins loaded from folders while developing
    if dev:
        env += f"CLAUDE_CODE_PLUGIN_DIRS={shlex.quote(dev)} "
    # `command claude` skips any shell function or alias named claude, so the account stays this one
    return f"cd {shlex.quote(cwd)} && {account_prefix or ''}{env}command claude -n {shlex.quote(name)} {shlex.quote(prompt)}"


def tab_line(line):
    """The line typed into a new Terminal tab: the session, then `exit 0` so the tab's shell ends
    (and Terminal closes the window) when the session closes. A failed `cd` stops the chain before
    `exit`, so the error stays on screen. The clipboard copy keeps the plain line."""
    head, sep, rest = line.partition(" && ")
    return f"{head} && {{ {rest} ; exit 0; }}" if sep else line


def open_tab(line):
    line = tab_line(line)
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
    ap.add_argument("--account")
    ap.add_argument("--reports-to", choices=reporting.KINDS)
    ap.add_argument("--fleet")
    a = ap.parse_args()
    problem = names.label_problem(names.parse(a.name)[2])
    if problem:
        print(f"Not started: {problem}. Name it like `Lane 38 #4 {names.DOT} page access`.", file=sys.stderr)
        return 2
    prefix = None
    if a.account:
        prefix = account_env(a.account)
        if prefix is None:
            return 2
    prompt = a.prompt
    if a.fleet and not re.match(r"^[a-z][a-z0-9-]{0,23}$", a.fleet):
        print(f"Not started: fleet id '{a.fleet}' must be lowercase letters, digits and dashes.", file=sys.stderr)
        return 2
    if a.reports_to:
        extra = reports_to_line(a.reports_to, a.fleet)
        if extra is None:
            return 2
        prompt = f"{prompt} {extra}"
    elif a.fleet:
        prompt = f"{prompt} fleet:{a.fleet}"
    line = command(a.name, prompt, os.path.abspath(os.path.expanduser(a.cwd)), prefix)
    if not a.dry_run and os.environ.get("TERM_PROGRAM") == "Apple_Terminal" and open_tab(line):
        print(f"Opened a new Terminal window for {a.name}.")
        return 0
    subprocess.run(["pbcopy"], input=line, text=True)
    print("Could not open a tab here. Paste this in a new terminal tab (it is on the clipboard):")
    print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
