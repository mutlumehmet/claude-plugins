#!/usr/bin/env python3
"""List every live Claude Code session in every account on this machine, with its message address.

Claude Code's own peer list (ListAgents) shows only the sessions of the account it runs in, but
SendMessage to a `uds:<socket>` address works across accounts. Each running session leaves a pid
record at `<config dir>/sessions/<pid>.json` (name, folder, state, socket). This reads those, read
only, for every config dir it knows, and drops records whose process is gone or was reused.

The record format is not documented by Claude Code, so every field is optional here and unknown
fields are ignored. Nothing is ever written to a config dir.

Usage: peers.py [--json] [filter words...]

Context use: for each session, the last reply's input tokens (plus cache reads and writes) in its
transcript, out of the model's context window: `context_window:` in the config when set, else 1M
when the account's settings.json model ends in [1m] or the session already went past 200k, else
200k. At 70% the row says "prepare handover", at 85% "hand over".

Accounts, first match wins:
  1. `accounts_file:` in ~/.config/orca-strator/config.yaml, a JSON file shaped
     {"accounts": {"<id>": {"configDir": "~/.claude", "label": "..."}}}
  2. otherwise every ~/.claude and ~/.claude-<name> dir that has a sessions/ folder, plus
     $CLAUDE_CONFIG_DIR. The id is "default" for ~/.claude and <name> for the others.
"""

import glob
import json
import mmap
import os
import re
import subprocess
import sys
from pathlib import Path

CONFIG = Path("~/.config/orca-strator/config.yaml").expanduser()
TITLE_KEYS = (b'"customTitle":"', b'"aiTitle":"')
PREPARE, HANDOVER = 70, 85
SMALL, LARGE = 200_000, 1_000_000


def read_config():
    """Flat `key: value` lines only, so no YAML library is needed."""
    out = {}
    try:
        for line in CONFIG.read_text().splitlines():
            m = re.match(r"\s*([A-Za-z_]+)\s*:\s*(.*?)\s*$", line)
            if m and not line.lstrip().startswith("#"):
                out[m.group(1)] = m.group(2).strip("'\"")
    except OSError:
        pass
    return out


def accounts():
    """Return [(id, real config dir path)], one per distinct dir."""
    found, seen = [], set()

    def add(ident, d):
        real = os.path.realpath(os.path.expanduser(d))
        if real not in seen and os.path.isdir(real):
            seen.add(real)
            found.append((ident, real))

    reg = read_config().get("accounts_file")
    if reg:
        try:
            data = json.loads(Path(reg).expanduser().read_text())
            for ident, a in (data.get("accounts") or {}).items():
                if isinstance(a, dict) and a.get("configDir"):
                    add(ident, a["configDir"])
        except (OSError, ValueError) as e:
            print(f"Could not read accounts_file {reg} ({e}); looking for config dirs instead.", file=sys.stderr)
    if not found:
        home = Path.home()
        if (home / ".claude").is_dir():
            add("default", str(home / ".claude"))
        for d in sorted(glob.glob(str(home / ".claude-*"))):
            if os.path.isdir(os.path.join(d, "sessions")):
                add(os.path.basename(d)[len(".claude-"):], d)
        env = os.environ.get("CLAUDE_CONFIG_DIR")
        if env:
            add(Path(env).name.lstrip(".") or "env", env)
    return found


def proc_info(pid):
    """(start time text, command) of a live pid, or None."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return None
    except PermissionError:
        pass
    try:
        out = subprocess.run(["ps", "-p", str(pid), "-o", "lstart=,comm="],
                             capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    if not out:
        return None
    # lstart is a fixed 24 character date ("Mon Oct 26 15:32:43 2026")
    return out[:24].strip(), out[24:].strip()


def is_live(rec):
    pid = rec.get("pid")
    if not isinstance(pid, int):
        return False
    info = proc_info(pid)
    if not info:
        return False
    start, comm = info
    if rec.get("procStart") and " ".join(rec["procStart"].split()) != " ".join(start.split()):
        return False  # the pid was reused by a newer process
    return "claude" in comm.lower() or bool(rec.get("procStart"))


def last_value(path, key):
    """The last JSON string value after `key` in a transcript, without loading it."""
    try:
        with open(path, "rb") as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as m:
            i = m.rfind(key)
            if i < 0:
                return None
            start = i + len(key)
            end = m.find(b'"', start)
            while end > 0 and m[end - 1:end] == b"\\":
                end = m.find(b'"', end + 1)
            return json.loads(b'"' + m[start:end] + b'"') if end > 0 else None
    except (OSError, ValueError):
        return None


def last_usage(path):
    """The usage of the last assistant reply, read backwards from the end of the transcript."""
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            end = f.tell()
            tail = b""
            while end > 0:
                start = max(0, end - 262144)
                f.seek(start)
                tail = f.read(end - start) + tail
                end = start
                lines = tail.split(b"\n")
                tail = lines[0] if start else b""
                for line in reversed(lines[1:] if start else lines):
                    if b'"type":"assistant"' not in line or b'"usage"' not in line:
                        continue
                    try:
                        u = (json.loads(line).get("message") or {}).get("usage")
                    except ValueError:
                        continue
                    if u:
                        return u
                if len(tail) > 64 * 1024 * 1024:
                    break
    except OSError:
        pass
    return None


def account_model(cfg):
    try:
        return str(json.loads(Path(cfg, "settings.json").read_text()).get("model") or "")
    except (OSError, ValueError):
        return ""


def context_of(path, cfg, configured):
    """{used, window, percent, flag} or None when the transcript has no reply yet."""
    u = last_usage(path) if path else None
    if not u:
        return None
    used = sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
    if configured:
        window = configured
    elif account_model(cfg).endswith("[1m]") or used > SMALL:
        window = LARGE
    else:
        window = SMALL
    pct = round(used * 100 / window)
    flag = "hand over" if pct >= HANDOVER else "prepare handover" if pct >= PREPARE else None
    return {"used": used, "window": window, "percent": pct, "flag": flag}


def transcript(cfg, sid):
    if not sid:
        return None
    hits = glob.glob(os.path.join(cfg, "projects", "*", f"{sid}.jsonl"))
    return os.path.realpath(hits[0]) if hits else None


def first_prompt(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for _, line in zip(range(400), f):
                if '"type":"user"' not in line:
                    continue
                try:
                    msg = json.loads(line).get("message") or {}
                except ValueError:
                    continue
                content = msg.get("content")
                if isinstance(content, list):
                    content = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
                text = " ".join(str(content or "").split())
                if text and not text.startswith("<"):
                    return text[:60]
    except OSError:
        pass
    return None


def title_for(cfg, rec, path):
    if path:
        custom = last_value(path, TITLE_KEYS[0])
        if custom:
            return custom
    # A name the user set wins; a derived one ("<folder>-9f") is only a last resort.
    if rec.get("name") and rec.get("nameSource") == "user":
        return rec["name"]
    if path:
        found = last_value(path, TITLE_KEYS[1]) or first_prompt(path)
        if found:
            return found
    return rec.get("name") or "untitled"


def my_pids():
    """This process's ancestors, to mark the session that asked."""
    pids, pid = set(), os.getppid()
    for _ in range(12):
        if pid <= 1:
            break
        pids.add(pid)
        try:
            out = subprocess.run(["ps", "-p", str(pid), "-o", "ppid="], capture_output=True, text=True, timeout=5).stdout.strip()
            pid = int(out)
        except (ValueError, OSError, subprocess.SubprocessError):
            break
    return pids


def main():
    args = sys.argv[1:]
    as_json = "--json" in args
    words = " ".join(a for a in args if a != "--json").lower().split()
    mine = my_pids()
    try:
        configured = int(read_config().get("context_window") or 0)
    except ValueError:
        configured = 0
    rows = []
    for ident, cfg in accounts():
        for f in glob.glob(os.path.join(cfg, "sessions", "*.json")):
            try:
                rec = json.loads(Path(f).read_text())
            except (OSError, ValueError):
                continue
            if not isinstance(rec, dict) or not is_live(rec):
                continue
            sock = rec.get("messagingSocketPath")
            path = transcript(cfg, rec.get("sessionId"))
            row = {
                "account": ident,
                "project": Path(rec.get("cwd") or "?").name,
                "cwd": rec.get("cwd"),
                "title": title_for(cfg, rec, path),
                "state": rec.get("status") or "",
                "address": f"uds:{sock}" if sock and os.path.exists(sock) else None,
                "sessionId": rec.get("sessionId"),
                "pid": rec.get("pid"),
                "self": rec.get("pid") in mine,
                "context": context_of(path, cfg, configured),
            }
            hay = f"{row['title']} {row['project']} {ident}".lower()
            if words and not all(w in hay for w in words):
                continue
            rows.append(row)
    rows.sort(key=lambda r: (r["account"], r["project"], r["title"]))
    if as_json:
        print(json.dumps(rows, indent=2))
        return 0
    if not rows:
        print("No live session matches." if words else "No live Claude Code session found.")
        return 0
    for r in rows:
        c = r["context"]
        ctx = f"{c['percent']}%" if c else "·"
        flag = f"  {c['flag'].upper()}" if c and c["flag"] else ""
        print(f"{r['account']:<9} {r['project'][:22]:<22} {r['title'][:48]:<48} {r['state']:<8} {ctx:>4}  "
              f"{r['address'] or '(no address)'}{'  (this session)' if r['self'] else ''}{flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
