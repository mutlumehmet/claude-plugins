#!/usr/bin/env python3
"""List every live Claude Code session in every account on this machine, with its message address.

Claude Code's own peer list (ListAgents) shows only the sessions of the account it runs in, but
SendMessage to a `uds:<socket>` address works across accounts. Each running session leaves a pid
record at `<config dir>/sessions/<pid>.json` (name, folder, state, socket). This reads those, read
only, for every config dir it knows, and drops records whose process is gone or was reused.

The record format is not documented by Claude Code, so every field is optional here and unknown
fields are ignored. Nothing is ever written to a config dir.

Usage: peers.py [--json] [--flat] [filter words...]

When a project runs several orca fleets, the list is grouped: the Admiral and the shared checkers,
then each fleet (its orchestrator, then its lanes by number), then every other session. A row's fleet
comes from the orca fleet directory, the session's reporting line, or its name (`Lane v1 38`,
`Orchestrator agentic`). `--flat` prints the plain list. JSON rows carry `fleet` and `fleetRole`.

Context use: the session's own reading when the orca-peers hooks module has saved one
(`~/.config/orca-strator/context/<sessionId>.json`: tokens, window and percent as Claude Code
measured them). Without that file the row is an ESTIMATE, shown with a leading `~`: the last
reply's input tokens (plus cache reads and writes) in the transcript, out of `context_window:` in
the config when set, else 1M. An estimate never carries a handover flag. At 70% a measured row says
"prepare handover", at 85% "hand over". (Until 3 November 2026 the estimate guessed a 200k window
unless the model name ended in [1m]; on 1M-window models that read two to five times too high.)

Reporting line: a lane started with orca-fleet saves who it reports to at
`~/.config/orca-strator/reporting/<sessionId>.json` ({"kind", "name", "address", "session", "fleet"}).
The row then ends with `reports: <kind> <name>`, plus `fleet: <id>` when the project runs several
fleets; a session without that file shows nothing extra.

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
CONTEXT_DIR = Path("~/.config/orca-strator/context").expanduser()
REPORTING_DIR = Path("~/.config/orca-strator/reporting").expanduser()
TITLE_KEYS = (b'"customTitle":"', b'"aiTitle":"')
PREPARE, HANDOVER = 70, 85
LARGE = 1_000_000  # the fallback window for an estimate; `context_window:` in the config overrides it


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


def reported_context(sid):
    """The session's own reading, saved by the orca-peers hooks module on every change."""
    if not sid:
        return None
    try:
        d = json.loads((CONTEXT_DIR / f"{sid}.json").read_text())
    except (OSError, ValueError):
        return None
    pct = d.get("percent") if isinstance(d, dict) else None
    if not isinstance(pct, (int, float)):
        return None
    return {"used": d.get("tokens"), "window": d.get("window"), "percent": round(pct), "source": "session"}


def context_of(path, cfg, configured, sid=None):
    """{used, window, percent, flag, source} or None when the session has no reading yet.

    source is "session" (Claude Code's own number, from the hooks module) or "estimate" (from the
    transcript against a configured or assumed window). Only a measured reading gets a flag."""
    c = reported_context(sid)
    if c is None:
        u = last_usage(path) if path else None
        if not u:
            return None
        used = sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
        window = configured or LARGE
        c = {"used": used, "window": window, "percent": round(used * 100 / window), "source": "estimate"}
    pct = c["percent"]
    measured = c["source"] == "session" or bool(configured)
    c["flag"] = ("hand over" if pct >= HANDOVER else "prepare handover" if pct >= PREPARE else None) if measured else None
    return c


def transcript(cfg, sid):
    if not sid:
        return None
    hits = glob.glob(os.path.join(cfg, "projects", "*", f"{sid}.jsonl"))
    return os.path.realpath(hits[0]) if hits else None


def reporting_line(sid):
    """What the session recorded about who it reports to, or None."""
    try:
        line = json.loads((REPORTING_DIR / f"{os.path.basename(sid or '')}.json").read_text())
    except (OSError, ValueError):
        return None
    return line if isinstance(line, dict) and line.get("kind") else None


FLEETS_DIR = Path("~/.config/orca-strator/fleets").expanduser()
_LANE = re.compile(r"^Lane\s+([a-z][a-z0-9-]*)\s+\d+\b")
_ORCH = re.compile(r"^Orchestrator\s+([a-z][a-z0-9-]*)(?:\s+#\d+)?(?:\s*·.*)?$")


def registered_roles():
    """{sessionId: "admiral" | "fleet:<id>"} from every project's fleet directory (orca-fleet), plus
    {"name:<title>": the same} so a lane that names its orchestrator lands in that fleet."""
    out = {}
    for f in glob.glob(str(FLEETS_DIR / "*" / "directory.json")):
        try:
            d = json.loads(Path(f).read_text())
        except (OSError, ValueError):
            continue
        adm = (d.get("admiral") or {}).get("sessionId")
        if adm:
            out[adm] = "admiral"
            out["name:" + (d["admiral"].get("name") or "")] = "admiral"
        for fid, fl in (d.get("fleets") or {}).items():
            sid = ((fl or {}).get("orchestrator") or {}).get("sessionId")
            if sid and fl.get("status") != "closed":
                out[sid] = f"fleet:{fid}"
                out["name:" + (fl["orchestrator"].get("name") or "")] = f"fleet:{fid}"
    return out


def fleet_group(row, roles):
    """("admiral", None), ("fleet", <id>) or (None, None) for one row."""
    role = roles.get(row["sessionId"])
    if role == "admiral" or row["title"].startswith("Admiral"):
        return "admiral", None
    if role and role.startswith("fleet:"):
        return "fleet", role[6:]
    rep = row.get("reports") or {}
    if rep.get("fleet"):
        return "fleet", rep["fleet"]
    boss = roles.get("name:" + (rep.get("name") or "")) if rep.get("name") else None
    if rep.get("kind") == "admiral" or boss == "admiral" or (rep.get("name") or "").startswith("Admiral"):
        return "admiral", None
    if boss and boss.startswith("fleet:"):
        return "fleet", boss[6:]
    m = _LANE.match(row["title"]) or _ORCH.match(row["title"])
    return ("fleet", m.group(1)) if m else (None, None)


def role_rank(title):
    t = title.lower()
    if t.startswith("admiral"):
        return (0, 0)
    if "orchestrator" in t:
        return (1, 0)
    m = re.search(r"\d+", title)
    if t.startswith("lane"):
        return (2, int(m.group()) if m else 0)
    return (3, 0)


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
    words = " ".join(a for a in args if a not in ("--json", "--flat")).lower().split()
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
                "context": context_of(path, cfg, configured, rec.get("sessionId")),
                "reports": reporting_line(rec.get("sessionId")),
            }
            hay = f"{row['title']} {row['project']} {ident}".lower()
            if words and not all(w in hay for w in words):
                continue
            rows.append(row)
    roles = registered_roles()
    for r in rows:
        kind, fid = fleet_group(r, roles)
        r["fleet"] = fid
        r["fleetRole"] = kind
    rows.sort(key=lambda r: (r["account"], r["project"], r["title"]))
    if as_json:
        print(json.dumps(rows, indent=2))
        return 0
    if not rows:
        print("No live session matches." if words else "No live Claude Code session found.")
        return 0
    def line(r):
        c = r["context"]
        ctx = (("~" if c["source"] == "estimate" else "") + f"{c['percent']}%") if c else "·"
        flag = f"  {c['flag'].upper()}" if c and c["flag"] else ""
        rep = r["reports"]
        reports = (f"  reports: {rep['kind']}{' ' + rep['name'] if rep.get('name') else ''}"
                   f"{'  fleet: ' + rep['fleet'] if rep.get('fleet') else ''}") if rep else ""
        return (f"{r['account']:<9} {r['project'][:22]:<22} {r['title'][:48]:<48} {r['state']:<8} {ctx:>4}  "
                f"{r['address'] or '(no address)'}{'  (this session)' if r['self'] else ''}{flag}{reports}")

    grouped = [r for r in rows if r["fleetRole"]]
    if not grouped or "--flat" in args:
        for r in rows:
            print(line(r))
        return 0
    # Several fleets: the Admiral first, then each fleet (its orchestrator, then lanes by number), then the rest
    projects = sorted({r["project"] for r in grouped})
    for proj in projects:
        mine_rows = [r for r in grouped if r["project"] == proj]
        adm = sorted((r for r in mine_rows if r["fleetRole"] == "admiral"), key=lambda r: role_rank(r["title"]))
        if adm:
            print(f"[{proj}] Admiral and shared checkers")
            for r in adm:
                print("  " + line(r))
        for fid in sorted({r["fleet"] for r in mine_rows if r["fleetRole"] == "fleet"}):
            print(f"[{proj}] fleet {fid}")
            for r in sorted((r for r in mine_rows if r["fleet"] == fid), key=lambda r: role_rank(r["title"])):
                print("  " + line(r))
    rest = [r for r in rows if not r["fleetRole"]]
    if rest:
        print("Other sessions")
        for r in rest:
            print("  " + line(r))
    return 0


if __name__ == "__main__":
    sys.exit(main())
