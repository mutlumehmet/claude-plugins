#!/usr/bin/env python3
"""Move a live Claude Code session to a twin account (another config dir of the same family).

Twins share their projects/ folder, so `claude --resume <id>` under the twin's config dir picks up
the same conversation. Every move reopens the session in a NEW Terminal.app window: typing into the
old tab failed when tty numbers were reused.

  preflight <account>  checks that the target seat is ready for the sessions coming: logged in, the
                        same user MCP servers, the project folders trusted, Chrome set up like the
                        source, and every MCP server connected (`claude mcp list` as the target).
                        --fix copies the plain settings from the source seat (never login tokens)
                        and runs the config's `after_new_seat` command once per new seat; what is
                        left is a to-do list (sign in to these servers once, in a setup window).
                        `go` and `move-all` refuse while it lists anything, unless --skip-preflight.
  plan [account]       says what would happen: this session, its account and family, the target
                        (named, or the twin with most quota left per orca-quota's readings), and
                        the resume script. Changes nothing.
  go <account>         writes the resume script and an exit request, and starts a detached helper.
                        The orca-move mod runs /exit once the session is idle with an empty prompt
                        box (a message from another session starts a new turn first, so with chatty
                        peers type /exit yourself). 45 s after the process ends the helper opens a
                        new window with the resume script, unless the session already runs again.
  move-all <account>   moves every live session of this account (or --account <from>) from outside:
                        ends each idle or waiting session with SIGTERM and opens a new window for
                        it. A session waiting on a question gets a "Re-ask on arrival" section in
                        its move note; one on a permission prompt is skipped unless --force. A busy
                        session gets --wait seconds (default 60) to settle. --assume-limited treats
                        the account as out of quota even when orca-quota has no reading. --dry-run
                        changes nothing. Run it yourself (`!` in a session, or a terminal): it ends
                        other processes.

Usage: move.py preflight <account> [--account <from>] [--fix]
       move.py plan [account] [--json] | move.py go <account> [--skip-preflight] | move.py cancel | move.py status
       move.py move-all <account> [--account <from>] [--wait N] [--force] [--assume-limited] [--dry-run] [--skip-preflight]
Reads ~/.config/orca-strator/config.yaml (`accounts_file:`, and the optional `resume_env_file:` and
`after_new_seat:`). Never reads or copies login tokens: each account must be logged in on its own.
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


# Claude Code writes procStart as `ps -o lstart=` prints it in the C locale ("Mon Nov 16 ...").
# Under another locale (en_GB prints "Mon 16 Nov ...") the two never match and every session looks
# dead, so every ps call runs in the C locale.
C_ENV = dict(os.environ, LC_ALL="C")


def ps(pid, fields):
    try:
        return subprocess.run(["ps", "-p", str(pid), "-o", fields], capture_output=True, text=True,
                              timeout=5, env=C_ENV).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def resume_running(sid):
    """True when some process runs `claude ... --resume <sid>` (the session already reopened)."""
    try:
        out = subprocess.run(["ps", "-axo", "command="], capture_output=True, text=True, timeout=5, env=C_ENV).stdout
    except (OSError, subprocess.SubprocessError):
        return False
    return any(f"--resume {sid}" in line and "move.py" not in line for line in out.splitlines())


def seat_json(cfg_dir):
    """The account's own settings file: <dir>/.claude.json (or ~/.claude.json for ~/.claude)."""
    inside = Path(cfg_dir, ".claude.json")
    if inside.exists() or real(cfg_dir) != real("~/.claude"):
        return inside
    return HOME / ".claude.json"


def read_seat(cfg_dir):
    try:
        return json.loads(seat_json(cfg_dir).read_text())
    except (OSError, ValueError):
        return {}


def wants_chrome(pid, src_dir):
    """Reopen with --chrome when the old process had it, or the source seat has Chrome on by default."""
    args = ps(pid, "command=")
    if "--no-chrome" in args:
        return False
    return "--chrome" in args or bool(read_seat(src_dir).get("claudeInChromeDefaultEnabled"))


def resume_body(cwd, tdir, sid, chrome=False):
    """The resume script's one line. An optional env file (config `resume_env_file`) is sourced first:
    a shell opened before that file existed lacks its variables, and MCP servers need them."""
    env = "unset CLAUDE_CONFIG_DIR" if tdir == real("~/.claude") else f"export CLAUDE_CONFIG_DIR={shlex.quote(tdir)}"
    pre = ""
    ef = read_config().get("resume_env_file")
    if ef:
        q = shlex.quote(os.path.expanduser(ef))
        pre = f"[ -f {q} ] && {{ set -a; . {q}; set +a; }}; "
    flag = "--chrome " if chrome else ""
    return f"{pre}cd {shlex.quote(cwd)} && {env} && exec claude {flag}--resume {sid} '/orca-move:after-move'\n"


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
        "body": resume_body(cwd, tdir, sid, wants_chrome(rec["pid"], cur_dir)),
        "note": str(MOVES / f"{sid}.md"),
        "autoExit": mod_loaded(rec["pid"], rec.get("procStart"), cur_dir),
        "fromDir": cur_dir,
        "toDir": tdir,
    }


def osa(script):
    return subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=20)


def open_window(script):
    """Opens a NEW Terminal.app window that runs `sh <script>`. True when Terminal took it.

    Typing into the session's old tab failed in practice: tty numbers are reused, so the tab was
    often not found, or a different tab got the line. A new window never hits the wrong session.
    """
    cmd = "sh " + shlex.quote(str(script))
    cmd = cmd.replace("\\", "\\\\").replace('"', '\\"')
    try:
        r = osa(f'tell application "Terminal" to do script "{cmd}"')
    except (OSError, subprocess.SubprocessError):
        return False
    return r.returncode == 0


def log(sid, msg):
    MOVES.mkdir(parents=True, exist_ok=True)
    with open(MOVES / f"{sid[:8]}.log", "a") as f:
        f.write(time.strftime("%H:%M:%S ") + msg + "\n")


def fallback(p, why):
    log(p["session"], "paste: " + why)
    subprocess.run(["pbcopy"], input=p["line"], text=True)
    osa(f'display notification "{why} Paste the line on your clipboard in a terminal." with title "orca-move"')


def resumed_pid(sid, tdir):
    """The pid of the live process running this session under tdir, from its pid record, or None."""
    for f in glob.glob(str(Path(tdir, "sessions", "*.json"))):
        try:
            r = json.loads(Path(f).read_text())
        except (OSError, ValueError):
            continue
        if r.get("sessionId") == sid and r.get("pid") and alive(r["pid"]):
            return r["pid"]
    return None


def wait_resumed(sid, tdir, secs):
    end = time.time() + secs
    while True:
        pid = resumed_pid(sid, tdir)
        if pid or time.time() >= end:
            return pid
        time.sleep(1)


SELF_GRACE_S = 45  # after this session's own exit, how long a hand-pasted resume line gets first


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
    log(sid, f"exited; giving a hand-typed resume {SELF_GRACE_S}s first")
    end = time.time() + SELF_GRACE_S
    while time.time() < end:
        if resume_running(sid) or resumed_pid(sid, p["toDir"]):
            log(sid, "already reopened by hand; nothing to open")
            return
        time.sleep(1)
    if not open_window(p["script"]):
        return fallback(p, "Moved out of the old account, but Terminal could not open a window.")
    log(sid, "opened a new window: " + p["line"])
    pid = wait_resumed(sid, p["toDir"], WAIT_START_S)
    if pid:
        log(sid, f"resumed as {p['to']}, pid {pid}")
    else:
        log(sid, f"no pid record for the session in {p['to']} after {WAIT_START_S}s; check the new window")


def go(target, skip_preflight=False):
    p = plan(target)
    if not p["ok"]:
        print(p["why"])
        return 1
    if not skip_preflight:
        todo, _ = preflight_checks(p["from"], p["to"], [p["cwd"]], fix=False, health=True)
        if todo:
            print_preflight(p["from"], p["to"], todo, [])
            print("Refused: fix the list above first (`move.py preflight " + p["to"] + " --fix`), "
                  "or move anyway with --skip-preflight.")
            return 1
    MOVES.mkdir(parents=True, exist_ok=True)
    Path(p["script"]).write_text("#!/bin/sh\n# orca-move: resume this session in " + p["to"] + "\n" + p["body"])
    (MOVES / f"{p['session'][:8]}.json").write_text(json.dumps(p, indent=2))
    (MOVES / f"{p['session'][:8]}.exit").write_text(p["session"] + "\n")
    subprocess.Popen([sys.executable, "-I", os.path.abspath(__file__), "_helper", p["session"]],
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True, close_fds=True)
    log(p["session"], f"move {p['from']} -> {p['to']} requested")
    if p["autoExit"] is False:
        print(f"Ready: {p['from']} -> {p['to']}. This session started before orca-move was installed, so it cannot")
        print("exit by itself: type /exit when this turn ends.")
    else:
        print(f"Ready: {p['from']} -> {p['to']}. The session exits when this turn ends, if the prompt box is empty")
        print("and no message starts a new turn first. If other sessions keep messaging it, type /exit when they pause.")
    print(f"{SELF_GRACE_S}s after the exit a new Terminal window reopens it as {p['to']}, unless you already ran: {p['line']}")
    return 0


# ---------------------------------------------------------------- preflight
# A seat that never ran these sessions lacks what they had on the old seat: user-scope MCP servers,
# trust for the project folder, Chrome turned on, and logins to online MCP servers. Sessions moved
# there arrive without those tools. preflight lists every gap, copies the plain settings with --fix
# (never login tokens: online MCP logins live in the Keychain per seat, and copying rotating refresh
# tokens would log the seats out of each other), and names each server that needs a sign-in.

CHROME_KEYS = ("claudeInChromeDefaultEnabled", "hasCompletedClaudeInChromeOnboarding",
               "chromeExtension", "cachedChromeExtensionInstalled")
PROJECT_KEYS = ("hasTrustDialogAccepted", "enabledMcpjsonServers", "disabledMcpjsonServers")
SEATS_SEEN = HOME / ".config/orca-strator/seats-seen"


def write_seat(cfg_dir, change):
    """Re-reads the seat file, applies change(data) and writes it back atomically. Claude Code
    rewrites this file itself, so the read is kept as close to the write as possible."""
    path = seat_json(cfg_dir)
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return False
    change(data)
    tmp = path.with_name(path.name + ".orca-move.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, path)
    return True


def mcp_health(tdir, cwd):
    """{server: state} from `claude mcp list` run as the target seat in cwd; None when it cannot run.
    The state is "ok", "auth" (needs a sign-in) or "failed"."""
    env = dict(C_ENV)
    if tdir == real("~/.claude"):
        env.pop("CLAUDE_CONFIG_DIR", None)
    else:
        env["CLAUDE_CONFIG_DIR"] = tdir
    try:
        out = subprocess.run(["claude", "mcp", "list"], capture_output=True, text=True, timeout=120,
                             env=env, cwd=cwd if os.path.isdir(cwd) else None).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    states = {}
    for line in out.splitlines():
        m = re.match(r"^([^\s:][^:]*?):\s.*\s-\s(.*)$", line.strip())
        if not m:
            continue
        name, tail = m.group(1).strip(), m.group(2).lower()
        states[name] = "auth" if "auth" in tail else "ok" if ("connected" in tail or "✓" in tail) else "failed"
    return states


def setup_line(tdir):
    if tdir == real("~/.claude"):
        return "env -u CLAUDE_CONFIG_DIR command claude"
    return f"CLAUDE_CONFIG_DIR={shlex.quote(tdir)} command claude"


def preflight_checks(src, target, cwds, fix=False, health=True):
    """Returns (todo, fixed): lines the person still has to act on, and lines --fix took care of."""
    accs = accounts()
    sdir, tdir = accs[src]["dir"], accs[target]["dir"]
    s, t = read_seat(sdir), read_seat(tdir)
    todo, fixed = [], []
    if not t.get("oauthAccount"):
        todo.append(f"{target} is not logged in: open a terminal window, run `{setup_line(tdir)}` and /login.")
    # user-scope MCP servers: copy missing entries (their settings, never a login)
    missing = {k: v for k, v in (s.get("mcpServers") or {}).items() if k not in (t.get("mcpServers") or {})}
    if missing:
        if fix and write_seat(tdir, lambda d: d.setdefault("mcpServers", {}).update(missing)):
            fixed.append(f"copied user MCP server settings from {src}: {', '.join(sorted(missing))}")
        else:
            todo.append(f"{target} lacks user MCP servers {src} has: {', '.join(sorted(missing))} (--fix copies them)")
    # project trust and .mcp.json approvals, per project folder of the sessions moving
    sp, tp = s.get("projects") or {}, t.get("projects") or {}
    for cwd in sorted(set(cwds)):
        want = {k: sp.get(cwd, {}).get(k) for k in PROJECT_KEYS if sp.get(cwd, {}).get(k) not in (None, [], False)}
        have = tp.get(cwd, {})
        gap = {k: v for k, v in want.items() if have.get(k) in (None, [], False)}
        if not gap:
            if not have.get("hasTrustDialogAccepted") and not sp.get(cwd, {}).get("hasTrustDialogAccepted"):
                todo.append(f"{cwd} is not trusted on {target} (nor on {src}): open `{setup_line(tdir)}` there once and accept.")
            continue
        if fix and write_seat(tdir, lambda d, c=cwd, g=gap: d.setdefault("projects", {}).setdefault(c, {}).update(g)):
            fixed.append(f"copied project settings for {cwd}: {', '.join(sorted(gap))}")
        else:
            todo.append(f"{cwd} on {target} lacks {', '.join(sorted(gap))} (--fix copies them from {src})")
    # Chrome: copy the source's keys when Chrome is on there
    if s.get("claudeInChromeDefaultEnabled"):
        gap = {k: s[k] for k in CHROME_KEYS if k in s and t.get(k) != s[k]}
        if gap:
            if fix and write_seat(tdir, lambda d: d.update(gap)):
                fixed.append(f"copied Chrome settings from {src}: {', '.join(sorted(gap))}")
            else:
                todo.append(f"Chrome is on in {src} but not set up in {target} (--fix copies {', '.join(sorted(gap))})")
    # online MCP logins: one sign-in per seat, by the person. Only servers that work on the source
    # count: a connector nobody signed in to anywhere is not a gap the move makes.
    if health and t.get("oauthAccount"):
        auth, bad, where = set(), set(), {}
        for cwd in sorted(set(cwds)) or [str(HOME)]:
            states = mcp_health(tdir, cwd)
            if states is None:
                todo.append(f"could not run `claude mcp list` as {target}; check its MCP servers by hand.")
                break
            before = mcp_health(sdir, cwd) or {}
            for name, state in states.items():
                if state == "ok" or (before and before.get(name, "ok") != "ok"):
                    continue
                (auth if state == "auth" else bad).add(name)
                where.setdefault(name, cwd)
        if auth:
            cwd = where[sorted(auth)[0]]
            todo.append(f"sign in once on {target}: {', '.join(sorted(auth))}. Open a window, "
                        f"`cd {shlex.quote(cwd)} && {setup_line(tdir)}`, then /mcp and authenticate each.")
        if bad:
            todo.append(f"failing on {target} but working on {src}: {', '.join(sorted(bad))} "
                        "(a key missing from the environment?)")
    # a seat moved to for the first time: run the person's own hook (config `after_new_seat`)
    seen = SEATS_SEEN.read_text().split() if SEATS_SEEN.exists() else []
    hook = read_config().get("after_new_seat")
    if target not in seen:
        ok = True
        if hook and not fix:
            ok = False
            todo.append(f"{target} is a new seat: --fix runs after_new_seat (`{hook}`)")
        elif hook:
            r = subprocess.run(["sh", "-c", hook], capture_output=True, text=True, timeout=60)
            ok = r.returncode == 0
            (fixed if ok else todo).append(
                f"after_new_seat for {target}: " + ("ran" if ok else f"failed ({r.stderr.strip()[:120]})"))
        if fix and ok:
            SEATS_SEEN.parent.mkdir(parents=True, exist_ok=True)
            SEATS_SEEN.write_text("\n".join(seen + [target]) + "\n")
    return todo, fixed


def print_preflight(src, target, todo, fixed):
    print(f"preflight {src} -> {target}: " + ("clean" if not todo else f"{len(todo)} to do"))
    for line in fixed:
        print("fixed: " + line)
    for i, line in enumerate(todo, 1):
        print(f"{i}. {line}")


def preflight(target, account=None, fix=False):
    accs = accounts()
    cur_dir = real(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude")
    src = account or next((k for k, v in accs.items() if v["dir"] == cur_dir), None)
    if not src or src not in accs or target not in accs:
        print(f"Unknown account {target if src in accs else src or cur_dir}. Known: {', '.join(accs)}.")
        return 2
    src_dir = accs[src]["dir"]
    cwds = [first_cwd(src_dir, r["sessionId"], r.get("cwd") or str(HOME)) for r in live_records(src_dir)]
    todo, fixed = preflight_checks(src, target, cwds, fix=fix)
    print_preflight(src, target, todo, fixed)
    return 0 if not todo else 1


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
    or ("skip", why). A session waiting on a question moves: its move note tells it to ask the same
    question again on arrival, so it shows as waiting again. One waiting on a permission prompt is
    not ended unless forced, because the tool call it guards would have to be redone."""
    st = rec.get("status") or "unknown"
    wf = (rec.get("waitingFor") or "").strip()
    if st == "idle":
        return "move", "idle"
    if st == "waiting":
        if "limit" in wf.lower():
            return "move", "waiting at the usage limit"
        if "dialog" not in wf.lower():
            return "move", f"waiting ({wf or 'a question'}), asks again on arrival"
        if force:
            return "move", f"waiting ({wf}), forced"
        return "skip", f"waiting ({wf}), not ended without --force"
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


def expected_servers(src_dir, cwd):
    """The MCP servers a session in cwd had on the source seat: user scope, local scope, and the
    project's .mcp.json servers that were approved. Plugin servers are not listed (they come with
    the plugin on every seat)."""
    s = read_seat(src_dir)
    names = set((s.get("mcpServers") or {}).keys())
    proj = (s.get("projects") or {}).get(cwd, {})
    names |= set((proj.get("mcpServers") or {}).keys())
    try:
        shared = set((json.loads(Path(cwd, ".mcp.json").read_text()).get("mcpServers") or {}).keys())
    except (OSError, ValueError):
        shared = set()
    enabled = set(proj.get("enabledMcpjsonServers") or [])
    names |= {n for n in shared if n in enabled and n not in set(proj.get("disabledMcpjsonServers") or [])}
    return sorted(names)


REASK = ("\n## Re-ask on arrival\nThis session was WAITING on the person when it was moved ({why}). The move "
         "closed its question box. As soon as after-move is done, ask the same open question again with "
         "AskUserQuestion: the same question, options and previews (they are at the end of the transcript), "
         "so it shows as waiting again.\n")
REDO = ("\n## Re-ask on arrival\nThis session was waiting on a permission prompt when it was moved ({why}). "
        "The move closed it. As soon as after-move is done, run the same step again so the prompt shows again.\n")


def add_sections(note, rec, src_dir, cwd):
    """Appends what a move from outside knows and the session cannot rebuild alone: the MCP servers
    it had, and, for a waiting session, the question to ask again."""
    text = note.read_text()
    extra = ""
    if "## MCP servers" not in text:
        names = expected_servers(src_dir, cwd)
        extra += "\n## MCP servers\n" + (", ".join(names) if names else "none known") + "\n"
    if rec.get("status") == "waiting" and "## Re-ask on arrival" not in text:
        wf = (rec.get("waitingFor") or "").strip()
        if "limit" not in wf.lower():
            extra += (REDO if "dialog" in wf.lower() else REASK).format(why=wf or "a question")
    if extra:
        note.write_text(text.rstrip("\n") + "\n" + extra)


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
    script = MOVES / f"{sid[:8]}.sh"
    tty = ps(rec["pid"], "tty=")
    p = {"ok": True, "session": sid, "pid": rec["pid"], "procStart": rec.get("procStart"), "title": rec.get("name"),
         "from": src, "to": target, "toDir": tdir, "tty": tty if tty and tty != "??" else None,
         "terminal": "", "cwd": cwd, "script": str(script), "via": "move-all",
         "line": f"sh ~/{script.relative_to(HOME)}" if str(script).startswith(str(HOME)) else f"sh {script}",
         "body": resume_body(cwd, tdir, sid, wants_chrome(rec["pid"], src_dir)),
         "note": str(MOVES / f"{sid}.md")}
    MOVES.mkdir(parents=True, exist_ok=True)
    script.write_text("#!/bin/sh\n# orca-move: resume this session in " + target + "\n" + p["body"])
    (MOVES / f"{sid[:8]}.json").write_text(json.dumps(p, indent=2))
    note = Path(p["note"])
    if not note.exists():  # a note the session wrote itself (switch) is better than ours
        note.write_text(note_text(rec, src, target))
    add_sections(note, rec, src_dir, cwd)
    return p


def end_and_resume(p):
    """SIGTERM, wait for the exit, then open a new Terminal window that runs the resume script.
    Returns (moved, message)."""
    pid = p["pid"]
    send_term(pid)
    end = time.time() + TERM_WAIT_S
    while alive(pid, p.get("procStart")) and time.time() < end:
        time.sleep(1)
    if alive(pid, p.get("procStart")):
        return False, f"still running {TERM_WAIT_S}s after SIGTERM; paste later: {p['line']}"
    log(p["session"], f"ended by move-all ({p['from']} -> {p['to']})")
    if open_window(p["script"]):
        log(p["session"], "opened a new window: " + p["line"])
        return True, "ended, reopening in a new window"
    return True, f"ended, but Terminal could not open a window; paste in any terminal: {p['line']}"


def move_all(target, account=None, wait=60, force=False, dry=False, assume_limited=False, skip_preflight=False):
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
    if not skip_preflight:
        cwds = [first_cwd(src_dir, r["sessionId"], r.get("cwd") or str(HOME)) for r in recs + ([me] if me_sid else [])]
        todo, _ = preflight_checks(src, target, cwds, fix=False, health=True)
        print_preflight(src, target, todo, [])
        if todo and not dry:
            print(f"Refused: fix the list above first (`move.py preflight {target} --account {src} --fix`), "
                  "or move anyway with --skip-preflight.")
            return 1
    verb = "would move" if dry else "moved"
    print(f"move-all {src} -> {target}: {len(recs) + (1 if me_sid else 0)} live session(s)"
          + (", account at its limit" if at_limit else "") + (" (dry run, nothing changes)" if dry else ""))
    counts = {"moved": 0, "skipped": 0}
    opened = []

    def act(rec, why):
        title = rec.get("name") or rec["sessionId"][:8]
        if dry:
            print(f"{verb} {title}: {why}")
            counts["moved"] += 1
            return
        ok, msg = end_and_resume(prepare(rec, src, target, accs))
        print(f"{'moved' if ok else 'skipped'} {title}: {msg}")
        if ok and "new window" in msg:
            opened.append(rec)
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
    if opened:
        # Each new window needs a few seconds to start Claude; check them together, not one by one.
        end = time.time() + 60
        left = list(opened)
        while left and time.time() < end:
            left = [r for r in left if not resumed_pid(r["sessionId"], accs[target]["dir"])]
            if left:
                time.sleep(2)
        for r in opened:
            title = r.get("name") or r["sessionId"][:8]
            print(f"{'NOT SEEN on ' + target + ' after 60s, check its window' if r in left else 'running on ' + target}: {title}")
    if me_sid:
        if dry:
            print(f"{verb} this session last: it exits after this turn and reopens in a new window")
            counts["moved"] += 1
        else:
            print("this session moves last, through `go`:")
            note = MOVES / f"{me_sid}.md"
            if not note.exists():
                MOVES.mkdir(parents=True, exist_ok=True)
                note.write_text(note_text(me, src, target))
            add_sections(note, me, src_dir, first_cwd(src_dir, me_sid, me.get("cwd") or str(HOME)))
            go(target, skip_preflight=True)
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
            print("Reopen   a new Terminal window" + ("" if sys.platform == "darwin" else ": not macOS, you will paste the line"))
            print(f"Resume   {p['line']}  ({p['body'].strip()})")
            print("Exit     " + {True: "automatic (the orca-move mod is loaded)", False: "by hand: this session started before orca-move was installed, so type /exit", None: "automatic if the orca-move mod is loaded; otherwise type /exit"}[p["autoExit"]])
        return 0 if p["ok"] else 1
    if cmd == "go" and rest:
        return go(rest[0], skip_preflight="--skip-preflight" in rest)
    if cmd == "preflight" and rest and not rest[0].startswith("-"):
        acct = rest[rest.index("--account") + 1] if "--account" in rest[:-1] else None
        return preflight(rest[0], account=acct, fix="--fix" in rest)
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
                        dry="--dry-run" in opts, assume_limited="--assume-limited" in opts,
                        skip_preflight="--skip-preflight" in opts)
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
