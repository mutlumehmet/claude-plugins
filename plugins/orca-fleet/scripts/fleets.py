#!/usr/bin/env python3
"""Several fleets in one project: who runs each one, a shared merge lock, numbered claims, closing a session.

One project (one repo folder) can run several fleets at once, each with its own orchestrator, lanes
and orders file, and one Admiral above them. This script keeps what they share, per project, under
`~/.config/orca-strator/fleets/<project key>/` (never inside the repo):

  directory.json   each fleet's current orchestrator (name, address, session) and the Admiral
  merge.lock       who is merging into the shared default branch right now
  claims.json      numbered things that must not collide: migration numbers, ports, lane numbers

Usage:
  fleets.py register orchestrator --fleet <id> [--label "<what it works on>"] [--takeover]
  fleets.py register admiral [--takeover]
  fleets.py retire --fleet <id>                      mark a fleet closed (its orchestrator stopped)
  fleets.py list [--json]
  fleets.py lock take --by "<name>" [--fleet <id>] [--pr <N>] [--ttl <minutes, default 45>]
  fleets.py lock release --by "<name>"
  fleets.py lock show
  fleets.py lock break --by "<name>"                 the Admiral only: drop someone else's lock
  fleets.py claim <resource> <value> --by "<name>" [--fleet <id>]
  fleets.py next <resource> --floor <n> --by "<name>" [--fleet <id>] [--width 4]
  fleets.py claims [<resource>] [--json]
  fleets.py close "<session title or id>" --by "<name>" [--fleet <id>]

`register` reads this session's own name, address and id (from reporting.py), so nobody types an
address; it refuses to replace a holder that is still running unless `--takeover` (a successor at a
handover). `--project <folder>` on any command picks the project; the default is the main checkout
of the repo the current folder is in (every worktree shares it), else the folder itself.

`close` checks the caller: in a project with several fleets only the Admiral, or a registered
orchestrator closing a session of its own fleet, may close; never this session, the Admiral, a
registered orchestrator (except by the Admiral), a session of another project, or one that reports
to a parent or works independently.

Exit codes: 0 done, 1 refused (lock held, value taken, not allowed), 2 bad input.
"""

import argparse
import contextlib
import fcntl
import glob
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python3 -I leaves it out
import names  # noqa: E402
import reporting  # noqa: E402

ROOT = Path(os.environ.get("ORCA_FLEETS_DIR") or "~/.config/orca-strator/fleets").expanduser()
FLEET_ID = re.compile(r"^[a-z][a-z0-9-]{0,23}$")


# ---------- where things live ----------

def project_root(given=None):
    """The main checkout of the repo the folder is in, so every worktree of one repo shares one
    directory (lanes work in worktrees). Outside git, the folder itself."""
    folder = os.path.abspath(os.path.expanduser(given or os.getcwd()))
    try:
        common = subprocess.run(["git", "-C", folder, "rev-parse", "--path-format=absolute", "--git-common-dir"],
                                capture_output=True, text=True, timeout=5).stdout.strip()
        if common:
            folder = os.path.dirname(common.rstrip("/")) if os.path.basename(common.rstrip("/")) == ".git" else common
    except (OSError, subprocess.SubprocessError):
        pass
    return os.path.realpath(folder)


def project_dir(root):
    """`<basename>-<8 hex>`: readable, and two folders with the same name never share a directory."""
    key = re.sub(r"[^a-z0-9]+", "-", os.path.basename(root).lower()).strip("-") or "project"
    d = ROOT / f"{key}-{hashlib.sha1(root.encode()).hexdigest()[:8]}"
    d.mkdir(parents=True, exist_ok=True)
    return d


@contextlib.contextmanager
def locked(d):
    """One writer at a time for every file in the project's directory."""
    with open(d / ".write.lock", "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def read(path, default):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def write(path, data):
    fd, tmp = tempfile.mkstemp(dir=Path(path).parent)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def now():
    return int(time.time())


def me():
    fake = os.environ.get("ORCA_FLEETS_TEST_SESSION")  # tests only: act as this session id
    if fake:
        return {"name": f"test {fake}", "address": None, "sessionId": fake}
    rec = reporting.this_session()
    return reporting.identity(rec) if rec else None


def live_ids():
    return {r["sessionId"] for r in live_sessions()}


def role_of(directory, sid):
    """("admiral", None), ("orchestrator", <fleet id>) or (None, None) for a session id."""
    if not sid:
        return None, None
    if (directory.get("admiral") or {}).get("sessionId") == sid:
        return "admiral", None
    for fid, f in directory.get("fleets", {}).items():
        if (f.get("orchestrator") or {}).get("sessionId") == sid and f.get("status") != "closed":
            return "orchestrator", fid
    return None, None


def project_config(root):
    return read(Path(root) / ".claude" / "orca-strator.json", {}) or {}


# ---------- directory ----------

def cmd_register(d, a):
    ident = me()
    if not ident:
        print("Could not find this session (run it from inside a Claude Code session).", file=sys.stderr)
        return 2
    entry = dict(ident, updatedAt=now())
    with locked(d):
        data = read(d / "directory.json", {"fleets": {}, "admiral": None})
        current = data.get("admiral") if a.role == "admiral" else \
            (data["fleets"].get(a.fleet or "", {}) or {}).get("orchestrator")
        if current and current.get("sessionId") != ident["sessionId"] and not a.takeover \
                and current.get("sessionId") in live_ids():
            what = "the Admiral" if a.role == "admiral" else f"fleet {a.fleet}'s orchestrator"
            print(f"{current['name']} is {what} and still running. Pass --takeover only when you are its "
                  f"successor (a handover) or the person said so.", file=sys.stderr)
            return 1
        if a.role == "admiral":
            data["admiral"] = entry
            print(f"Registered {ident['name']} as the Admiral.")
        else:
            if not a.fleet or not FLEET_ID.match(a.fleet):
                print("--fleet needs an id: lowercase letters, digits and dashes, starting with a letter "
                      "(e.g. v1, agentic, lettings-ai).", file=sys.stderr)
                return 2
            fleet = data["fleets"].setdefault(a.fleet, {})
            old = fleet.get("orchestrator")
            fleet["orchestrator"] = entry
            fleet["status"] = "running"
            if a.label:
                fleet["label"] = a.label
            fleet.setdefault("startedAt", now())
            was = f" (was {old['name']})" if old and old.get("session") != ident["sessionId"] else ""
            print(f"Registered {ident['name']} as the orchestrator of fleet {a.fleet}{was}.")
        write(d / "directory.json", data)
    return 0


def cmd_retire(d, a):
    with locked(d):
        data = read(d / "directory.json", {"fleets": {}, "admiral": None})
        role, fleet = role_of(data, (me() or {}).get("sessionId"))
        if not (role == "admiral" or (role == "orchestrator" and fleet == a.fleet)):
            print("Only the Admiral or the fleet's own orchestrator retires a fleet.", file=sys.stderr)
            return 1
        if a.fleet not in data["fleets"]:
            print(f"No fleet {a.fleet}.", file=sys.stderr)
            return 1
        data["fleets"][a.fleet]["status"] = "closed"
        data["fleets"][a.fleet]["closedAt"] = now()
        write(d / "directory.json", data)
    print(f"Fleet {a.fleet} marked closed.")
    return 0


def cmd_list(d, a):
    data = read(d / "directory.json", {"fleets": {}, "admiral": None})
    if a.json:
        print(json.dumps(data, indent=2))
        return 0
    adm = data.get("admiral")
    print(f"Admiral: {adm['name']}  {adm.get('address') or ''}" if adm else "Admiral: none")
    if not data["fleets"]:
        print("No fleets registered.")
    for fid, f in sorted(data["fleets"].items()):
        o = f.get("orchestrator") or {}
        print(f"  {fid:<14} {f.get('status', '?'):<8} {o.get('name', '-'):<28} {o.get('address') or ''}"
              f"{'  · ' + f['label'] if f.get('label') else ''}")
    return 0


# ---------- merge lock ----------

def cmd_lock(d, a):
    path = d / "merge.lock"
    with locked(d):
        held = read(path, None)
        expired = bool(held) and held.get("expiresAt", 0) <= now()
        if a.action == "show":
            if not held:
                print("Free.")
            else:
                left = held["expiresAt"] - now()
                print(f"Held by {held['by']}{' (fleet ' + held['fleet'] + ')' if held.get('fleet') else ''}"
                      f"{' for #' + str(held['pr']) if held.get('pr') else ''}, "
                      f"{'EXPIRED ' + str(-left // 60) + ' min ago' if expired else str(left // 60) + ' min left'}.")
            return 0
        if not a.by:
            print("--by is required.", file=sys.stderr)
            return 2
        if a.action == "take":
            sid = (me() or {}).get("sessionId")
            if held and not expired and held.get("session") != sid and held["by"] != a.by:
                print(f"Held by {held['by']}{' for #' + str(held['pr']) if held.get('pr') else ''}; "
                      f"wait and try again, or ask them.", file=sys.stderr)
                return 1
            write(path, {"by": a.by, "session": sid, "fleet": a.fleet, "pr": a.pr, "takenAt": now(),
                         "expiresAt": now() + 60 * a.ttl})
            note = f" (took over an expired lock from {held['by']})" if held and expired and held["by"] != a.by else ""
            print(f"Lock taken by {a.by} for {a.ttl} min{note}.")
            return 0
        if a.action == "release":
            if not held:
                print("Already free.")
                return 0
            sid = (me() or {}).get("sessionId")
            role, fleet = role_of(read(d / "directory.json", {}), sid)
            mine_lock = (held.get("session") == sid) if held.get("session") else held["by"] == a.by
            successor = role == "orchestrator" and held.get("fleet") and fleet == held["fleet"]
            if not (mine_lock or successor):
                print(f"Held by {held['by']}; only the holder, its fleet's current orchestrator "
                      f"(after a handover) or the Admiral (`lock break`) frees it.", file=sys.stderr)
                return 1
            path.unlink()
            print("Lock released.")
            return 0
        if a.action == "break":
            adm = read(d / "directory.json", {}).get("admiral") or {}
            mine = me() or {}
            if not adm or adm.get("sessionId") != mine.get("sessionId"):
                print("Only the registered Admiral may break a lock.", file=sys.stderr)
                return 1
            if held:
                path.unlink()
                print(f"Broke the lock held by {held['by']}.")
            else:
                print("Already free.")
            return 0
    return 2


# ---------- numbered claims ----------

def cmd_claim(d, a):
    with locked(d):
        data = read(d / "claims.json", {})
        bucket = data.setdefault(a.resource, {})
        value = str(a.value)
        same = [v for v in bucket if v == value or (v.isdigit() and value.isdigit() and int(v) == int(value))]
        taken = [v for v in same if bucket[v]["by"] != a.by]
        if taken:
            print(f"{a.resource} {taken[0]} is taken by {bucket[taken[0]]['by']}.", file=sys.stderr)
            return 1
        for v in same:
            del bucket[v]
        bucket[value] = {"by": a.by, "fleet": a.fleet, "at": now()}
        write(d / "claims.json", data)
    print(f"{a.resource} {value} is yours, {a.by}.")
    return 0


def cmd_next(d, a):
    with locked(d):
        data = read(d / "claims.json", {})
        bucket = data.setdefault(a.resource, {})
        used = [int(v) for v in bucket if v.isdigit()]
        n = max([a.floor] + used) + 1
        value = str(n).zfill(a.width) if a.width else str(n)
        bucket[value] = {"by": a.by, "fleet": a.fleet, "at": now()}
        write(d / "claims.json", data)
    print(value)
    return 0


def cmd_claims(d, a):
    data = read(d / "claims.json", {})
    if a.resource:
        data = {a.resource: data.get(a.resource, {})}
    if a.json:
        print(json.dumps(data, indent=2))
        return 0
    if not any(data.values()):
        print("No claims.")
    for res, bucket in sorted(data.items()):
        for value, c in sorted(bucket.items()):
            print(f"  {res:<12} {value:<8} {c['by']}{'  (fleet ' + c['fleet'] + ')' if c.get('fleet') else ''}")
    return 0


# ---------- closing a session ----------

def live_sessions():
    """Every live session's pid record, across every account's config dir."""
    out = []
    for cfg in reporting.config_dirs():
        for f in glob.glob(os.path.join(cfg, "sessions", "*.json")):
            rec = read(f, None)
            if not isinstance(rec, dict) or not rec.get("pid") or not rec.get("sessionId"):
                continue
            try:
                os.kill(rec["pid"], 0)
            except OSError:
                continue
            out.append(rec)
    return out


def find_session(target, sessions):
    """By session id, by exact title, then by base and #n (so a label change still matches)."""
    exact = [r for r in sessions if target in (r.get("sessionId"), r.get("name"))]
    if exact:
        return exact
    base, n, _ = names.parse(target)
    return [r for r in sessions if r.get("name") and names.parse(r["name"])[:2] == (base, n)]


def reporting_of(sid):
    return read(reporting.REPORTING_DIR / f"{os.path.basename(sid)}.json", {}) or {}


def cmd_close(d, a):
    sessions = live_sessions()
    hits = find_session(a.target, sessions)
    if not hits:
        print(f"No live session called {a.target}.", file=sys.stderr)
        return 1
    if len(hits) > 1:
        print(f"{len(hits)} live sessions match {a.target}; give the session id: "
              + ", ".join(f"{r.get('name')} ({r['sessionId']})" for r in hits), file=sys.stderr)
        return 2
    rec = hits[0]
    mine = me() or {}
    if rec["sessionId"] == mine.get("sessionId"):
        print("That is this session. Close your own window instead.", file=sys.stderr)
        return 1
    directory = read(d / "directory.json", {"fleets": {}, "admiral": None})
    adm = directory.get("admiral") or {}
    i_am_admiral = bool(adm) and adm.get("sessionId") == mine.get("sessionId")
    if adm and adm.get("sessionId") == rec["sessionId"]:
        print("That is the Admiral; only the person closes it.", file=sys.stderr)
        return 1
    their = reporting_of(rec["sessionId"])
    root = project_root(a.project)
    target_root = project_root(rec.get("cwd")) if rec.get("cwd") else None
    if target_root != root:
        print(f"{rec.get('name')} works in another project ({rec.get('cwd') or 'unknown folder'}); not closing.",
              file=sys.stderr)
        return 1
    cfg = project_config(root)
    several = bool(cfg.get("fleets"))
    role, my_fleet = role_of(directory, mine.get("sessionId"))
    if several and not i_am_admiral:
        if role != "orchestrator":
            print("Only a registered orchestrator or the Admiral closes sessions in a project with several "
                  "fleets (`fleets.py register orchestrator --fleet <id>`).", file=sys.stderr)
            return 1
        target_fleet = their.get("fleet") or (cfg.get("defaultFleet") if their else None)
        if target_fleet != my_fleet:
            print(f"{rec.get('name')} is in fleet {target_fleet or 'none'}, you run fleet {my_fleet}; ask its "
                  f"orchestrator or the Admiral.", file=sys.stderr)
            return 1
    if not i_am_admiral:
        runs = [fid for fid, f in directory.get("fleets", {}).items()
                if (f.get("orchestrator") or {}).get("sessionId") == rec["sessionId"]]
        if runs:
            print(f"{rec.get('name')} is the registered orchestrator of fleet {runs[0]}; only the Admiral or "
                  f"the person closes it (a successor registers first, then closes its predecessor).",
                  file=sys.stderr)
            return 1
        if their.get("kind") in ("parent", "independent") and their.get("session") != mine.get("sessionId"):
            print(f"{rec.get('name')} reports to {their.get('kind')} {their.get('name') or ''}, not to you.",
                  file=sys.stderr)
            return 1
        if their.get("kind") == "admiral":
            print(f"{rec.get('name')} reports to the Admiral (shared checker pool); ask the Admiral.",
                  file=sys.stderr)
            return 1
    pid = rec["pid"]
    try:
        cmdline = subprocess.run(["ps", "-p", str(pid), "-o", "command="],
                                 capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        cmdline = ""
    if "claude" not in cmdline.lower():
        print(f"pid {pid} does not look like Claude Code ({cmdline or 'gone'}); not closing.", file=sys.stderr)
        return 1
    os.kill(pid, signal.SIGTERM)
    for _ in range(20):
        time.sleep(0.5)
        try:
            os.kill(pid, 0)
        except OSError:
            print(f"Closed {rec.get('name')} (pid {pid}), by {a.by}.")
            return 0
    print(f"Sent TERM to {rec.get('name')} (pid {pid}); it is still running after 10 s.", file=sys.stderr)
    return 1


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("register")
    p.add_argument("role", choices=["orchestrator", "admiral"])
    p.add_argument("--fleet")
    p.add_argument("--label")
    p.add_argument("--takeover", action="store_true")

    p = sub.add_parser("retire")
    p.add_argument("--fleet", required=True)

    p = sub.add_parser("list")
    p.add_argument("--json", action="store_true")

    p = sub.add_parser("lock")
    p.add_argument("action", choices=["take", "release", "show", "break"])
    p.add_argument("--by")
    p.add_argument("--fleet")
    p.add_argument("--pr", type=int)
    p.add_argument("--ttl", type=int, default=45)

    p = sub.add_parser("claim")
    p.add_argument("resource")
    p.add_argument("value")
    p.add_argument("--by", required=True)
    p.add_argument("--fleet")

    p = sub.add_parser("next")
    p.add_argument("resource")
    p.add_argument("--floor", type=int, required=True)
    p.add_argument("--by", required=True)
    p.add_argument("--fleet")
    p.add_argument("--width", type=int, default=0)

    p = sub.add_parser("claims")
    p.add_argument("resource", nargs="?")
    p.add_argument("--json", action="store_true")

    p = sub.add_parser("close")
    p.add_argument("target")
    p.add_argument("--by", required=True)
    p.add_argument("--fleet")

    a = ap.parse_args()
    d = project_dir(project_root(a.project))
    return {"register": cmd_register, "retire": cmd_retire, "list": cmd_list, "lock": cmd_lock,
            "claim": cmd_claim, "next": cmd_next, "claims": cmd_claims, "close": cmd_close}[a.cmd](d, a)


if __name__ == "__main__":
    sys.exit(main())
