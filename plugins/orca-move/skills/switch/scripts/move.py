#!/usr/bin/env python3
"""Move a live Claude Code session to a twin account (another config dir of the same family).

Twins share their projects/ folder, so `claude --resume <id>` under the twin's config dir picks up
the same conversation. The move itself is three steps, and only the last one types anything:

  1. `plan [account]`  says what would happen: this session, its account and family, the target
                        (named, or the twin with most quota left per orca-quota' readings), the
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

  move-all <account>   moves every live session of this account (or --account <from>) from outside:
                        ends each idle session, or one waiting at the usage limit, with SIGTERM and
                        types its resume line into its own Terminal tab. A busy session gets --wait
                        seconds (default 60) to settle; one waiting on a permission prompt or a
                        question is skipped unless --force. --assume-limited treats the account as
                        out of quota even when orca-quota has no reading. --dry-run changes nothing.
                        Run it yourself (`!` in a session, or a terminal): it ends other processes.

Usage: move.py plan [account] [--json] | move.py go <account> | move.py cancel | move.py status
       move.py move-all <account> [--account <from>] [--wait N] [--force] [--assume-limited] [--dry-run]
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
    """Highest live percent of an account's saved readings, or None when orca-quota has none."""
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


# ---------------------------------------------------------------- move-all
# Moves every live session of an account from outside, without asking each one to run `go`.
# It ends each Claude process itself (SIGTERM) and types the resume line into the session's own
# Terminal tab, so it also works for sessions that are out of quota and can no longer take a turn.
# Run by the person (for example with `!`): it ends other sessions' processes.

REPORTING = HOME / ".config/orca-strator/reporting"
TERM_WAIT_S = 30  # how long a session gets to exit after SIGTERM


def limited(ident):
    """True when orca-quota's reading says the account is out: a window at 100% or more whose reset
    is still ahead (or has no reset time)."""
    try:
        r = json.loads((QUOTA / f"{ident}.json").read_text())
    except (OSError, ValueError):
        return False
    from datetime import datetime
    for w in (r.get("windows") or {}).values():
        if (w.get("percent") or 0) < 100:
            continue
        reset = w.get("resetsAt")
        if not reset:
            return True
        try:
            if datetime.fromisoformat(reset.replace("Z", "+00:00")).timestamp() > time.time():
                return True
        except ValueError:
            return True
    return False


def decide(rec, at_limit, force=False):
    """What move-all does with one session record: ("move", why) now, ("wait", why) for a busy one,
    or ("skip", why). A session waiting on a permission prompt or a question is never ended unless
    forced, because that would throw away the answer it is waiting for."""
    st = rec.get("status") or "unknown"
    wf = (rec.get("waitingFor") or "").strip()
    if st == "idle":
        return "move", "idle"
    if st == "waiting":
        if "limit" in wf.lower():
            return "move", "waiting at the usage limit"
        if at_limit and "dialog" not in wf.lower():
            # Out of quota it cannot take the next turn anyway. A permission dialog still waits for
            # the person, so it stays behind --force.
            return "move", f"waiting ({wf or 'unknown'}), account at its limit"
        if force:
            return "move", f"waiting ({wf or 'unknown'}), forced"
        return "skip", f"waiting ({wf or 'unknown'}), not ended without --force"
    if st == "shell":
        # Idle at the prompt but with a background command still running (a CI watch, say).
        # Moving ends that command; the move note tells the session to start it again.
        if at_limit:
            return "move", "background command running, account at its limit"
        return "wait", "running a background command (moving ends it)"
    return "wait", st


def live_records(cfg_dir):
    out = []
    for f in sorted(glob.glob(os.path.join(cfg_dir, "sessions", "*.json"))):
        try:
            r = json.loads(Path(f).read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(r, dict) or not r.get("sessionId") or not r.get("pid"):
            continue
        if r.get("kind") not in (None, "interactive"):
            continue
        if alive(r["pid"], r.get("procStart")):
            out.append(r)
    return out


def reread(cfg_dir, rec):
    try:
        r = json.loads(Path(cfg_dir, "sessions", f"{rec['pid']}.json").read_text())
        return r if r.get("sessionId") == rec["sessionId"] else rec
    except (OSError, ValueError):
        return rec


def reporting_of(sid):
    try:
        return json.loads((REPORTING / f"{sid}.json").read_text())
    except (OSError, ValueError):
        return {}


def note_text(rec, src, target):
    sid = rec["sessionId"]
    title = rec.get("name") or sid
    rep = reporting_of(sid)
    line = rep.get("kind") or "unknown"
    if rep.get("name"):
        line += f": {rep['name']}"
    if rep.get("address"):
        line += f" ({rep['address']}, check with peers, it may have moved too)"
    tell = f"- {rep['name']}: \"{title} moved to {target}. New address: <this session's uds address>\"" if rep.get("name") else "none known"
    return (f"# Move note: {title}, {src} -> {target}, {time.strftime('%d %b %Y %H:%M')} (move-all)\n\n"
            "## Crons\n"
            "unknown: moved from outside by move-all, which cannot read a session's crons. "
            "Rebuild them from the project's .claude/orca-strator.json by role (see after-move).\n\n"
            "## Background work\n"
            "unknown: anything that ran in the background ended with the old process. "
            "Look at the end of the transcript and start again what is still needed.\n\n"
            f"## Reports to\n{line}\n\n"
            f"## Fleet\n{rep.get('fleet') or 'none recorded'}\n\n"
            f"## Tell after the move\n{tell}\n\n"
            "## Waiting on\nwhatever the transcript says this session was doing.\n")


def send_term(pid):
    try:
        os.kill(pid, 15)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def prepare(rec, src, target, accs):
    """Writes the resume script, the move record and the move note for one session. Returns the record."""
    sid = rec["sessionId"]
    src_dir, tdir = accs[src]["dir"], accs[target]["dir"]
    cwd = first_cwd(src_dir, sid, rec.get("cwd") or str(HOME))
    env = "unset CLAUDE_CONFIG_DIR" if tdir == real("~/.claude") else f"export CLAUDE_CONFIG_DIR={shlex.quote(tdir)}"
    script = MOVES / f"{sid[:8]}.sh"
    tty = ps(rec["pid"], "tty=")
    p = {"ok": True, "session": sid, "pid": rec["pid"], "procStart": rec.get("procStart"), "title": rec.get("name"),
         "from": src, "to": target, "toDir": tdir, "tty": tty if tty and tty != "??" else None,
         "terminal": "", "cwd": cwd, "script": str(script), "via": "move-all",
         "line": f"sh ~/{script.relative_to(HOME)}" if str(script).startswith(str(HOME)) else f"sh {script}",
         "body": f"cd {shlex.quote(cwd)} && {env} && exec claude --resume {sid} '/orca-move:after-move'\n",
         "note": str(MOVES / f"{sid}.md")}
    MOVES.mkdir(parents=True, exist_ok=True)
    script.write_text("#!/bin/sh\n# orca-move: resume this session in " + target + "\n" + p["body"])
    (MOVES / f"{sid[:8]}.json").write_text(json.dumps(p, indent=2))
    note = Path(p["note"])
    if not note.exists():  # a note the session wrote itself (switch) is better than ours
        note.write_text(note_text(rec, src, target))
    return p


def end_and_resume(p):
    """SIGTERM, wait for the exit, then type the resume line into the session's Terminal tab.
    Returns (moved, message)."""
    pid = p["pid"]
    send_term(pid)
    end = time.time() + TERM_WAIT_S
    while alive(pid, p.get("procStart")) and time.time() < end:
        time.sleep(1)
    if alive(pid, p.get("procStart")):
        return False, f"still running {TERM_WAIT_S}s after SIGTERM; paste later: {p['line']}"
    log(p["session"], f"ended by move-all ({p['from']} -> {p['to']})")
    if not p.get("tty"):
        return True, f"ended, no terminal tab known; paste in any terminal: {p['line']}"
    for _ in range(20):
        if not tab_busy(p["tty"]):
            break
        time.sleep(0.5)
    time.sleep(0.5)
    if type_in_tab(p["tty"], p["line"]):
        log(p["session"], "typed " + p["line"])
        return True, f"resumed in its tab ({p['tty']})"
    return True, f"ended, tab {p['tty']} not found in Terminal; paste there: {p['line']}"


def move_all(target, account=None, wait=60, force=False, dry=False, assume_limited=False):
    accs = accounts()
    cur_dir = real(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude")
    src = account or next((k for k, v in accs.items() if v["dir"] == cur_dir), None)
    if not src or src not in accs:
        print(f"Unknown source account {src or cur_dir}. Known: {', '.join(accs)}. Name it with --account.")
        return 1
    if target not in accs:
        print(f"Unknown account {target}. Known: {', '.join(accs)}.")
        return 1
    if target == src:
        print(f"Sessions of {src} already run as {src}.")
        return 1
    if accs[target]["family"] != accs[src]["family"]:
        print(f"{target} is not a twin of {src}: sessions only move between twins, which share their transcripts.")
        return 1
    src_dir = accs[src]["dir"]
    me = this_session(src_dir) if cur_dir == src_dir else None
    me_sid = me.get("sessionId") if me else None
    at_limit = assume_limited or limited(src)
    recs = [r for r in live_records(src_dir) if r["sessionId"] != me_sid]
    verb = "would move" if dry else "moved"
    print(f"move-all {src} -> {target}: {len(recs) + (1 if me_sid else 0)} live session(s)"
          + (", account at its limit" if at_limit else "") + (" (dry run, nothing changes)" if dry else ""))
    counts = {"moved": 0, "skipped": 0}

    def act(rec, why):
        title = rec.get("name") or rec["sessionId"][:8]
        if dry:
            print(f"{verb} {title}: {why}")
            counts["moved"] += 1
            return
        ok, msg = end_and_resume(prepare(rec, src, target, accs))
        print(f"{'moved' if ok else 'skipped'} {title}: {msg}")
        counts["moved" if ok else "skipped"] += 1

    waiting = []
    for r in recs:
        what, why = decide(r, at_limit, force)
        if what == "move":
            act(r, why)
        elif what == "skip":
            print(f"skipped {r.get('name') or r['sessionId'][:8]}: {why}")
            counts["skipped"] += 1
        else:
            waiting.append(r)
    end = time.time() + (0 if dry else wait)
    while waiting:
        still = []
        for r in waiting:
            r2 = reread(src_dir, r)
            if not alive(r2["pid"], r2.get("procStart")):
                print(f"skipped {r2.get('name') or r2['sessionId'][:8]}: it ended by itself")
                counts["skipped"] += 1
                continue
            what, why = decide(r2, at_limit, force)
            if what == "move":
                act(r2, why)
            elif what == "skip":
                print(f"skipped {r2.get('name') or r2['sessionId'][:8]}: {why}")
                counts["skipped"] += 1
            else:
                still.append(r2)
        waiting = still
        if not waiting:
            break
        if time.time() >= end:
            for r in waiting:
                title = r.get("name") or r["sessionId"][:8]
                if force:
                    act(r, f"still {decide(r, at_limit)[1]} after {wait}s, forced")
                else:
                    print(f"skipped {title}: still {decide(r, at_limit)[1]} after {wait}s (rerun later, or --force)")
                    counts["skipped"] += 1
            break
        time.sleep(1)
    if me_sid:
        if dry:
            print(f"{verb} this session last: it exits after this turn and resumes in its tab")
            counts["moved"] += 1
        else:
            print("this session moves last, through `go`:")
            note = MOVES / f"{me_sid}.md"
            if not note.exists():
                MOVES.mkdir(parents=True, exist_ok=True)
                note.write_text(note_text(me, src, target))
            go(target)
            counts["moved"] += 1
    print(f"done: {counts['moved']} {verb}, {counts['skipped']} skipped.")
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
    if cmd == "move-all" and rest and not rest[0].startswith("-"):
        target, opts = rest[0], rest[1:]
        def opt(name, default=None):
            return opts[opts.index(name) + 1] if name in opts and opts.index(name) + 1 < len(opts) else default
        try:
            wait = int(opt("--wait", 60))
        except ValueError:
            print("--wait takes whole seconds, e.g. --wait 90")
            return 2
        return move_all(target, account=opt("--account"), wait=wait, force="--force" in opts,
                        dry="--dry-run" in opts, assume_limited="--assume-limited" in opts)
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
