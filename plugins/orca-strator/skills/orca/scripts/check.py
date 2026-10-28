#!/usr/bin/env python3
"""Orca Strator setup check: what is ready, what is missing, and the current settings. Reads only.

Usage: check.py [--json] [--set key=value ...]

  --set auto_move=true|false   write a setting to ~/.config/orca-strator/config.yaml
  --set warn_percent=50..99
  --set accounts_file=<path>

Prints one JSON object with --json, else a short report. Never reads login tokens.
"""

import json
import os
import re
import sys
from pathlib import Path

HOME = Path.home()
CONFIG = HOME / ".config/orca-strator/config.yaml"
PARTS = ("orca-peers", "orca-quota", "orca-move", "orca-fleet")
SETTABLE = {"auto_move": r"^(true|false)$", "warn_percent": r"^(5\d|[6-9]\d)$", "accounts_file": r"^\S+$"}


def read_config():
    out = {}
    try:
        for line in CONFIG.read_text().splitlines():
            m = re.match(r"\s*([A-Za-z_]+)\s*:\s*(.*?)\s*$", line)
            if m and not line.lstrip().startswith("#"):
                out[m.group(1)] = m.group(2).strip("'\"")
    except OSError:
        pass
    return out


def write_setting(key, value):
    if key not in SETTABLE or not re.match(SETTABLE[key], value):
        raise SystemExit(f"Not a setting I can write: {key}={value}")
    lines = CONFIG.read_text().splitlines() if CONFIG.exists() else ["# Orca Strator settings, read by every orca plugin"]
    done = False
    for i, line in enumerate(lines):
        if re.match(rf"\s*{key}\s*:", line):
            lines[i] = f"{key}: {value}"
            done = True
    if not done:
        lines.append(f"{key}: {value}")
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text("\n".join(lines) + "\n")


def installed(cfg_dir):
    try:
        data = json.loads(Path(cfg_dir, "plugins", "installed_plugins.json").read_text())
    except (OSError, ValueError):
        return {}
    out = {}
    for key, entries in (data.get("plugins") or {}).items():
        name = key.split("@")[0]
        if name in PARTS + ("orca-strator",):
            e = entries[0] if isinstance(entries, list) and entries else entries
            out[name] = (e or {}).get("version", "?")
    return out


def accounts(cfg):
    reg = cfg.get("accounts_file")
    if not reg:
        return None
    try:
        data = json.loads(Path(reg).expanduser().read_text())
    except (OSError, ValueError):
        return None
    out = []
    for ident, a in (data.get("accounts") or {}).items():
        d = os.path.expanduser(a.get("configDir", ""))
        out.append({"id": ident, "configDir": d, "twinOf": a.get("twinOf"), "exists": os.path.isdir(d)})
    return out


def project_config(start):
    p = Path(start).resolve()
    for d in [p, *p.parents]:
        f = d / ".claude" / "orca-strator.json"
        if f.exists():
            try:
                return {"path": str(f), **json.loads(f.read_text())}
            except ValueError:
                return {"path": str(f), "error": "not valid JSON"}
    return None


def main():
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--set" and i + 1 < len(args):
            k, _, v = args[i + 1].partition("=")
            write_setting(k.strip(), v.strip())
    cfg = read_config()
    me = os.path.realpath(os.path.expanduser(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude"))
    accs = accounts(cfg)
    here = installed(me)
    report = {
        "account_dir": me,
        "installed_here": here,
        "missing_here": [p for p in PARTS if p not in here],
        "config_file": str(CONFIG) if CONFIG.exists() else None,
        "accounts_file": cfg.get("accounts_file"),
        "accounts": accs,
        "twins": [a["id"] for a in (accs or []) if a.get("twinOf")],
        "auto_move": cfg.get("auto_move", "false"),
        "warn_percent": cfg.get("warn_percent", "90"),
        "project_config": project_config(os.getcwd()),
        "terminal": os.environ.get("TERM_PROGRAM", ""),
    }
    if "--json" in args:
        print(json.dumps(report, indent=2))
        return 0
    ok = lambda b: "ready" if b else "missing"
    print(f"Plugins in this account: {ok(not report['missing_here'])} {('(missing: ' + ', '.join(report['missing_here']) + ')') if report['missing_here'] else ''}")
    print(f"Accounts file: {report['accounts_file'] or 'not set (accounts are named after their folders)'}")
    print(f"Twins: {', '.join(report['twins']) or 'none'}")
    print(f"Auto move: {report['auto_move']}   Warn at: {report['warn_percent']}%")
    pc = report["project_config"]
    print(f"Project fleet config: {pc['path'] if pc else 'none in this folder'}")
    print(f"Terminal: {report['terminal'] or 'unknown'}{'' if report['terminal'] == 'Apple_Terminal' else ' (automatic moves and handovers need Terminal.app; you will paste a line instead)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
