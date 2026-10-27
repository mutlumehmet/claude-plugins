#!/usr/bin/env python3
"""Move a live Claude Code session to a twin account (another config dir of the same family).

Twins share their projects/ folder, so `claude --resume <id>` under the twin's config dir picks up
the same conversation. The move itself is three steps, and only the last one types anything:

  1. `plan [account]`  says what would happen: this session, its account and family, the target
                        (named, or the twin with most quota left per orca-accounts' readings), the
                        terminal tab, and the resume script. Changes nothing.
  2. `go <account>`    writes the resume script and an exit request, and starts a detached helper.
                        The orca-move mod sees the request when the turn ends and runs /exit once the
                        session is idle, but only if the prompt box is empty. Nothing is typed into
                        Claude's prompt.
  3. the helper        waits for this session's process to end (any /exit counts, also one typed by
                        hand later), then types one short line into the same Terminal tab, at the
                        shell prompt: `sh ~/.config/orca-strator/moves/<id8>.sh`. If it cannot (not
                        Terminal.app, tab not found), it copies that line to the clipboard and
                        shows a notification instead.

Usage: move.py plan [account] [--json] | move.py go <account> | move.py cancel | move.py status
Reads ~/.config/orca-strator/config.yaml (`accounts_file:`), the same as orca-peers. Never reads
or copies login tokens: each account must already be logged in on its own.
"""

import glob
import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

HOME = Path.home()
CONFIG = HOME / ".config/orca-strator/config.yaml"
MOVES = HOME / ".config/orca-strator/moves"
QUOTA = HOME / ".config/orca-strator/quota"
WAIT_EXIT_S = 30 * 60  # the helper gives up if the session is still running after this
WAIT_START_S = 60


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


def real(p):
    return os.path.realpath(os.path.expanduser(p))


def accounts():
    """{id: {"dir": realpath, "family": id of the base}} from accounts_file, else from the folders."""
    found = {}
    reg = read_config().get("accounts_file")
    if reg:
        try:
            data = json.loads(Path(reg).expanduser().read_text())
            for ident, a in (data.get("accounts") or {}).items():
                if isinstance(a, dict) and a.get("configDir"):
                    found[ident] = {"dir": real(a["configDir"]), "family": a.get("twinOf") or ident}
        except (OSError, ValueError):
            pass
    if not found:
        if (HOME / ".claude").is_dir():
            found["default"] = {"dir": real("~/.claude"), "family": "default"}
        for d in sorted(glob.glob(str(HOME / ".claude-*"))):
            if os.path.isdir(os.path.join(d, "sessions")):
                found[os.path.basename(d)[len(".claude-"):]] = {"dir": real(d), "family": None}
        # Without an accounts file a twin is a dir whose projects/ is a link into another account's
        by_dir = {v["dir"]: k for k, v in found.items()}
        for k, v in found.items():
            if v["family"] is None:
                target = real(os.path.join(v["dir"], "projects"))
                base = next((i for d, i in by_dir.items() if target == real(os.path.join(d, "projects")) and i != k), None)
                v["family"] = found[base]["family"] if base and found[base]["family"] else k
    return found


def ps(pid, fields):
    try:
        return subprocess.run(["ps", "-p", str(pid), "-o", fields], capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def alive(pid, proc_start=None):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    if proc_start:
        return " ".join(ps(pid, "lstart=").split()) == " ".join(proc_start.split())
    return True


def this_session(cfg_dir):
    """Walk up from this process to the Claude process that has a pid record in cfg_dir."""
    pid = os.getppid()
    for _ in range(15):
        if pid <= 1:
            break
        rec = Path(cfg_dir, "sessions", f"{pid}.json")
        if rec.exists():
            try:
                return json.loads(rec.read_text())
            except ValueError:
                return None
        try:
            pid = int(ps(pid, "ppid=") or 0)
        except ValueError:
            break
    return None


def first_cwd(cfg_dir, sid, fallback):
    hits = glob.glob(os.path.join(cfg_dir, "projects", "*", f"{sid}.jsonl"))
    if hits:
        try:
            with open(hits[0], encoding="utf-8", errors="replace") as f:
                for _, line in zip(range(200), f):
                    m = re.search(r'"cwd":"((?:[^"\\]|\\.)*)"', line)
                    if m:
                        return json.loads('"' + m.group(1) + '"')
        except OSError:
            pass
    return fallback


def used(ident):
    """Highest live percent of an account's saved readings, or None when orca-accounts has none."""
    try:
        r = json.loads((QUOTA / f"{ident}.json").read_text())
    except (OSError, ValueError):
        return None
    now = time.time() * 1000
    vals = []
    for w in (r.get("windows") or {}).values():
        reset = w.get("resetsAt")
        if reset:
            try:
                from datetime import datetime
                if datetime.fromisoformat(reset.replace("Z", "+00:00")).timestamp() * 1000 <= now:
                    vals.append(0)
                    continue
            except ValueError:
                pass
        vals.append(w.get("percent") or 0)
    return max(vals) if vals else None


def mod_loaded(pid, proc_start, cfg_dir):
    """Whether this session's process has the orca-move mod: True, False, or None when unknown.

    Plugins load when a session starts, so a session started before orca-move was installed has
    no mod to run /exit for it. A session started with the plugin from a folder has it too.
    """
    try:
        args = subprocess.run(["ps", "-E", "-p", str(pid), "-o", "command="], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        args = ""
    if "orca-move" in args:
        return True
    try:
        from datetime import datetime, timezone
        data = json.loads(Path(cfg_dir, "plugins", "installed_plugins.json").read_text())
        stamps = [e.get("installedAt") for k, v in (data.get("plugins") or {}).items() if k.startswith("orca-move@")
                  for e in (v if isinstance(v, list) else [v]) if isinstance(e, dict) and e.get("installedAt")]
        if not stamps or not proc_start:
            return None
        installed = min(datetime.fromisoformat(t.replace("Z", "+00:00")) for t in stamps)
        started = datetime.strptime(" ".join(proc_start.split()), "%a %b %d %H:%M:%S %Y").astimezone(timezone.utc)
        return started > installed
    except (OSError, ValueError):
        return None


def plan(target=None):
    accs = accounts()
    cur_dir = real(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude")
    me = next((k for k, v in accs.items() if v["dir"] == cur_dir), None)
    if not me:
        return {"ok": False, "why": f"This session's config dir {cur_dir} is not a known account."}
    rec = this_session(cur_dir)
    if not rec or not rec.get("sessionId"):
        return {"ok": False, "why": "Could not find this session's pid record (run this from inside a Claude Code session)."}
    fam = accs[me]["family"]
    twins = [k for k, v in accs.items() if v["family"] == fam and k != me]
    if target:
        if target not in accs:
            return {"ok": False, "why": f"Unknown account {target}. Known: {', '.join(accs)}."}
        if target == me:
            return {"ok": False, "why": f"This session already runs as {me}."}
        if target not in twins:
            return {"ok": False, "why": f"{target} is not in {me}'s family ({', '.join([me] + twins)}). A session only moves between twins, which share their transcripts."}
    elif not twins:
        return {"ok": False, "why": f"{me} has no twin account to move to."}
    else:
        target = sorted(twins, key=lambda t: (used(t) is None, used(t) or 0))[0]
    sid = rec["sessionId"]
    tty = ps(rec["pid"], "tty=")
    cwd = first_cwd(cur_dir, sid, rec.get("cwd") or os.getcwd())
    tdir = accs[target]["dir"]
    env = "unset CLAUDE_CONFIG_DIR" if tdir == real("~/.claude") else f"export CLAUDE_CONFIG_DIR={shlex.quote(tdir)}"
    script = MOVES / f"{sid[:8]}.sh"
    return {
        "ok": True,
        "session": sid,
        "pid": rec["pid"],
        "procStart": rec.get("procStart"),
        "title": rec.get("name"),
        "from": me,
        "to": target,
        "family": [me] + twins,
        "quota": {a: used(a) for a in [me] + twins},
        "tty": tty if tty and tty != "??" else None,
        "terminal": os.environ.get("TERM_PROGRAM") or "",
        "cwd": cwd,
        "script": str(script),
        "line": f"sh ~/{script.relative_to(HOME)}",
        "body": f"cd {shlex.quote(cwd)} && {env} && exec claude --resume {sid} '/orca-move:after-move'\n",
        "note": str(MOVES / f"{sid}.md"),
        "autoExit": mod_loaded(rec["pid"], rec.get("procStart"), cur_dir),
    }


def osa(script):
    return subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=20)


def type_in_tab(tty, text):
    """Types text plus Return into the Terminal.app tab on /dev/<tty>. True when the tab was found."""
    s = f'''tell application "Terminal"
  repeat with w in windows
    repeat with t in tabs of w
      if (tty of t) is "/dev/{tty}" then
        do script "{text}" in t
        return "ok"
      end if
    end repeat
  end repeat
  return "none"
end tell'''
    r = osa(s)
    return r.returncode == 0 and r.stdout.strip() == "ok"


def tab_busy(tty):
    """True while a process other than the shell holds the tab's foreground."""
    out = subprocess.run(["ps", "-t", tty, "-o", "stat=,comm="], capture_output=True, text=True).stdout
    for line in out.splitlines():
        stat, _, comm = line.strip().partition(" ")
        name = os.path.basename(comm.strip())
        if "+" in stat and not name.lstrip("-").endswith("sh") and name not in ("login", "ps"):
            return True
    return False


def log(sid, msg):
    MOVES.mkdir(parents=True, exist_ok=True)
    with open(MOVES / f"{sid[:8]}.log", "a") as f:
        f.write(time.strftime("%H:%M:%S ") + msg + "\n")


def fallback(p, why):
    log(p["session"], "paste: " + why)
    subprocess.run(["pbcopy"], input=p["line"], text=True)
    osa(f'display notification "{why} Paste the line on your clipboard in a terminal." with title "orca-move"')


def helper(sid):
    p = json.loads((MOVES / f"{sid[:8]}.json").read_text())
    log(sid, f"waiting for pid {p['pid']} to exit")
    end = time.time() + WAIT_EXIT_S
    while alive(p["pid"], p.get("procStart")) and time.time() < end:
        time.sleep(1)
    if alive(p["pid"], p.get("procStart")):
        log(sid, "still running after 30 min, gave up; the exit request is withdrawn")
        (MOVES / f"{sid[:8]}.exit").unlink(missing_ok=True)
        return
    log(sid, "exited")
    if p.get("terminal") != "Apple_Terminal" or not p.get("tty"):
        return fallback(p, "Moved out of the old account, but this terminal cannot be typed into.")
    for _ in range(20):  # the shell prompt comes back a moment after Claude exits
        if not tab_busy(p["tty"]):
            break
        time.sleep(0.5)
    else:
        return fallback(p, "The tab did not return to its shell.")
    time.sleep(0.5)
    if not type_in_tab(p["tty"], p["line"]):
        return fallback(p, "The Terminal tab was not found.")
    log(sid, "typed " + p["line"])
    target = Path(p["toDir"], "sessions")
    end = time.time() + WAIT_START_S
    while time.time() < end:
        for f in glob.glob(str(target / "*.json")):
            try:
                r = json.loads(Path(f).read_text())
            except (OSError, ValueError):
                continue
            if r.get("sessionId") == sid and alive(r.get("pid", 0)):
                log(sid, f"resumed as {p['to']}, pid {r['pid']}")
                return
        time.sleep(1)
    log(sid, f"no pid record for the session in {p['to']} after {WAIT_START_S}s; check the tab")


def go(target):
    p = plan(target)
    if not p["ok"]:
        print(p["why"])
        return 1
    MOVES.mkdir(parents=True, exist_ok=True)
    Path(p["script"]).write_text("#!/bin/sh\n# orca-move: resume this session in " + p["to"] + "\n" + p["body"])
    p["toDir"] = accounts()[p["to"]]["dir"]
    (MOVES / f"{p['session'][:8]}.json").write_text(json.dumps(p, indent=2))
    (MOVES / f"{p['session'][:8]}.exit").write_text(p["session"] + "\n")
    subprocess.Popen([sys.executable, "-I", os.path.abspath(__file__), "_helper", p["session"]],
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True, close_fds=True)
    log(p["session"], f"move {p['from']} -> {p['to']} requested")
    if p["autoExit"] is False:
        print(f"Ready: {p['from']} -> {p['to']}. This session started before orca-move was installed, so it cannot")
        print("exit by itself: type /exit when this turn ends. The helper then resumes it in this tab.")
    else:
        print(f"Ready: {p['from']} -> {p['to']}. The session exits when this turn ends (if the prompt box is empty),")
        print(f"then `{p['line']}` resumes it as {p['to']} in the same tab.")
    print(f"If the tab does not reopen it within a minute after the exit, paste: {p['line']}")
    return 0


def cancel():
    """Withdraws this session's pending move: stops its helper and removes the exit request."""
    cur_dir = real(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude")
    rec = this_session(cur_dir)
    if not rec or not rec.get("sessionId"):
        print("Could not find this session's pid record.")
        return 1
    sid = rec["sessionId"]
    short = sid[:8]
    if not (MOVES / f"{short}.exit").exists() and not (MOVES / f"{short}.json").exists():
        print("No move is pending for this session.")
        return 0
    subprocess.run(["pkill", "-f", f"move.py _helper {sid}"], capture_output=True)
    for ext in (".exit", ".sh", ".json"):
        (MOVES / f"{short}{ext}").unlink(missing_ok=True)
    note = MOVES / f"{sid}.md"
    if note.exists():
        note.rename(MOVES / f"{sid}.cancelled.md")
    log(sid, "cancelled")
    print("Move cancelled: the helper is stopped and the exit request withdrawn. This session stays where it is.")
    return 0


def status():
    for f in sorted(MOVES.glob("*.log")):
        lines = f.read_text().splitlines()
        print(f"{f.stem}: {lines[-1] if lines else ''}")
    return 0


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 0
    cmd, rest = args[0], args[1:]
    if cmd == "plan":
        as_json = "--json" in rest
        rest = [a for a in rest if a != "--json"]
        p = plan(rest[0] if rest else None)
        if as_json:
            print(json.dumps(p, indent=2))
        elif not p["ok"]:
            print(p["why"])
        else:
            q = ", ".join(f"{a} {'?' if v is None else str(round(v)) + '%'}" for a, v in p["quota"].items())
            print(f"Session  {p['title'] or p['session']} ({p['session']}), pid {p['pid']}")
            print(f"Move     {p['from']} -> {p['to']}   (family: {q})")
            print(f"Tab      {p['tty'] or 'none'} in {p['terminal'] or 'unknown terminal'}"
                  + ("" if p["terminal"] == "Apple_Terminal" and p["tty"] else ": cannot type here, you will paste the line"))
            print(f"Resume   {p['line']}  ({p['body'].strip()})")
            print("Exit     " + {True: "automatic (the orca-move mod is loaded)", False: "by hand: this session started before orca-move was installed, so type /exit", None: "automatic if the orca-move mod is loaded; otherwise type /exit"}[p["autoExit"]])
        return 0 if p["ok"] else 1
    if cmd == "go" and rest:
        return go(rest[0])
    if cmd == "cancel":
        return cancel()
    if cmd == "status":
        return status()
    if cmd == "_helper" and rest:
        helper(rest[0])
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
