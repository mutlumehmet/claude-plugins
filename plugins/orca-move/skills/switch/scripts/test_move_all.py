#!/usr/bin/env python3
"""Tests for move.py move-all: which sessions it ends, and that a dry run changes nothing.

Run: python3 -I plugins/orca-move/skills/switch/scripts/test_move_all.py
Nothing real is ended or typed: the process, Terminal and clock calls are replaced in the module.
"""

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("move", os.path.join(HERE, "move.py"))
move = importlib.util.module_from_spec(spec)
spec.loader.exec_module(move)


def rec(pid, status, waiting=None, name=None):
    r = {"pid": pid, "sessionId": f"{pid:08d}-0000-4000-8000-000000000000", "kind": "interactive",
         "status": status, "name": name or f"S{pid}", "cwd": "/p"}
    if waiting:
        r["waitingFor"] = waiting
    return r


class Decide(unittest.TestCase):
    def test_idle_moves(self):
        self.assertEqual(move.decide(rec(1, "idle"), False)[0], "move")

    def test_waiting_on_the_limit_moves(self):
        self.assertEqual(move.decide(rec(1, "waiting", "usage limit reached"), False)[0], "move")

    def test_waiting_with_the_account_at_its_limit_moves(self):
        self.assertEqual(move.decide(rec(1, "waiting", "input needed"), True)[0], "move")

    def test_permission_prompt_is_skipped(self):
        self.assertEqual(move.decide(rec(1, "waiting", "dialog open"), False)[0], "skip")
        # even at the limit: the prompt waits for the person
        self.assertEqual(move.decide(rec(1, "waiting", "dialog open"), True)[0], "skip")

    def test_permission_prompt_moves_with_force(self):
        self.assertEqual(move.decide(rec(1, "waiting", "dialog open"), False, force=True)[0], "move")

    def test_question_moves_and_asks_again(self):
        what, why = move.decide(rec(1, "waiting", "input needed"), False)
        self.assertEqual(what, "move")
        self.assertIn("asks again", why)

    def test_busy_waits(self):
        self.assertEqual(move.decide(rec(1, "busy"), False)[0], "wait")
        self.assertEqual(move.decide(rec(1, "busy"), True)[0], "wait")

    def test_background_shell_waits_below_the_limit_and_moves_at_it(self):
        self.assertEqual(move.decide(rec(1, "shell"), False)[0], "wait")
        self.assertEqual(move.decide(rec(1, "shell"), True)[0], "move")


class Limited(unittest.TestCase):
    def setUp(self):
        self.q = Path(tempfile.mkdtemp())
        move.QUOTA = self.q

    def write(self, percent, reset):
        w = {"percent": percent}
        if reset is not None:
            w["resetsAt"] = reset.isoformat().replace("+00:00", "Z")
        (self.q / "a.json").write_text(json.dumps({"windows": {"five_hour": w}}))

    def test_no_reading_is_not_limited(self):
        self.assertFalse(move.limited("a"))

    def test_full_window_with_reset_ahead_is_limited(self):
        self.write(100, datetime.now(timezone.utc) + timedelta(hours=1))
        self.assertTrue(move.limited("a"))

    def test_full_window_already_reset_is_not_limited(self):
        self.write(100, datetime.now(timezone.utc) - timedelta(minutes=1))
        self.assertFalse(move.limited("a"))

    def test_below_full_is_not_limited(self):
        self.write(99, datetime.now(timezone.utc) + timedelta(hours=1))
        self.assertFalse(move.limited("a"))


class MoveAll(unittest.TestCase):
    """The whole command on fake accounts: src and dst are twins, sessions are files on disk."""

    PATCHED = ("MOVES", "QUOTA", "REPORTING", "TERM_WAIT_S", "accounts", "alive", "send_term", "open_window",
               "resumed_pid", "read_config", "preflight_checks", "ps", "this_session")

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(move, k, v)
        move.time.sleep = self.sleep

    def setUp(self):
        self.saved = {k: getattr(move, k) for k in self.PATCHED}
        self.sleep = move.time.sleep
        root = Path(tempfile.mkdtemp())
        self.src, self.dst = root / "src", root / "dst"
        (self.src / "sessions").mkdir(parents=True)
        self.dst.mkdir()
        move.MOVES = root / "moves"
        move.QUOTA = root / "quota"
        move.REPORTING = root / "reporting"
        move.TERM_WAIT_S = 2
        self.ended, self.typed, self.live = [], [], set()
        move.accounts = lambda: {"src": {"dir": str(self.src), "family": "f"},
                                 "dst": {"dir": str(self.dst), "family": "f"}}
        move.alive = lambda pid, start=None: pid in self.live
        move.send_term = lambda pid: (self.ended.append(pid), self.live.discard(pid))
        move.open_window = lambda script: (self.typed.append(str(script)), True)[1]
        move.resumed_pid = lambda sid, tdir: 1
        move.read_config = lambda: {}
        move.preflight_checks = lambda *a, **k: ([], [])
        move.ps = lambda pid, fields: "ttys001" if fields == "tty=" else ""
        move.this_session = lambda d: None
        move.time.sleep = lambda s: None

    def add(self, r):
        (self.src / "sessions" / f"{r['pid']}.json").write_text(json.dumps(r))
        self.live.add(r["pid"])

    def run_it(self, **kw):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = move.move_all("dst", account="src", **kw)
        return code, out.getvalue()

    def test_dry_run_changes_nothing(self):
        self.add(rec(11, "idle"))
        self.add(rec(12, "waiting", "dialog open"))
        code, out = self.run_it(dry=True, wait=0)
        self.assertEqual(code, 0)
        self.assertIn("would move S11: idle", out)
        self.assertIn("skipped S12", out)
        self.assertEqual(self.ended, [])
        self.assertEqual(self.typed, [])
        self.assertFalse(move.MOVES.exists())

    def test_moves_idle_skips_prompt_and_stays_busy(self):
        self.add(rec(11, "idle"))
        self.add(rec(12, "waiting", "dialog open"))
        self.add(rec(13, "busy"))
        code, out = self.run_it(wait=0)
        self.assertEqual(self.ended, [11])
        self.assertEqual(self.typed, [str(move.MOVES / "00000011.sh")])
        script = move.MOVES / "00000011.sh"
        self.assertIn("exec claude --resume 00000011-", script.read_text())
        self.assertNotIn(" -n ", script.read_text())  # an automatic name stays automatic
        self.assertIn(f"CLAUDE_CONFIG_DIR={self.dst}", script.read_text())
        self.assertTrue((move.MOVES / "00000011-0000-4000-8000-000000000000.md").exists())
        self.assertIn("skipped S12", out)
        self.assertIn("skipped S13: still busy", out)
        self.assertIn("running on dst: S11", out)
        self.assertIn("done: 1 moved, 2 skipped.", out)

    def test_a_named_session_reopens_with_its_name(self):
        r = rec(14, "idle", name="Orchestrator v2 #7")
        r["nameSource"] = "user"
        self.add(r)
        self.run_it(wait=0)
        body = (move.MOVES / "00000014.sh").read_text(encoding="utf-8")
        self.assertIn("exec claude -n 'Orchestrator v2 #7' --remote-control 'Orchestrator v2 #7' --resume 00000014-", body)

    def test_busy_that_goes_idle_within_the_wait_is_moved(self):
        r = rec(13, "busy")
        self.add(r)
        calls = {"n": 0}
        real_reread = move.reread

        def reread(d, x):
            calls["n"] += 1
            if calls["n"] >= 2:
                (self.src / "sessions" / "13.json").write_text(json.dumps(dict(r, status="idle")))
            return real_reread(d, x)
        move.reread = reread
        try:
            code, out = self.run_it(wait=30)
        finally:
            move.reread = real_reread
        self.assertEqual(self.ended, [13])
        self.assertIn("moved S13", out)

    def test_force_moves_a_permission_prompt(self):
        self.add(rec(12, "waiting", "dialog open"))
        self.run_it(wait=0, force=True)
        self.assertEqual(self.ended, [12])

    def test_assume_limited_moves_background_shells(self):
        self.add(rec(14, "shell"))
        _, out = self.run_it(wait=0)
        self.assertEqual(self.ended, [])
        self.run_it(wait=0, assume_limited=True)
        self.assertEqual(self.ended, [14])

    def test_a_session_that_will_not_exit_is_reported_not_typed(self):
        self.add(rec(15, "idle"))
        move.send_term = lambda pid: self.ended.append(pid)  # stays alive
        clock = {"t": 1000.0}

        def tick():
            clock["t"] += 1
            return clock["t"]
        real_time = move.time.time
        move.time.time = tick
        try:
            _, out = self.run_it(wait=0)
        finally:
            move.time.time = real_time
        self.assertEqual(self.typed, [])
        self.assertIn("skipped S15: still running", out)

    def test_refuses_a_target_outside_the_family(self):
        move.accounts = lambda: {"src": {"dir": str(self.src), "family": "f"},
                                 "dst": {"dir": str(self.dst), "family": "g"}}
        code, out = self.run_it(wait=0)
        self.assertEqual(code, 1)
        self.assertIn("not a twin", out)

    def test_waiting_on_a_question_moves_with_a_reask_section(self):
        self.add(rec(16, "waiting", "input needed"))
        self.run_it(wait=0)
        self.assertEqual(self.ended, [16])
        note = (move.MOVES / "00000016-0000-4000-8000-000000000000.md").read_text()
        self.assertIn("## Re-ask on arrival", note)
        self.assertIn("AskUserQuestion", note)
        self.assertIn("## MCP servers", note)

    def test_an_idle_session_gets_no_reask(self):
        self.add(rec(11, "idle"))
        self.run_it(wait=0)
        note = (move.MOVES / "00000011-0000-4000-8000-000000000000.md").read_text()
        self.assertNotIn("Re-ask", note)

    def test_refuses_while_preflight_lists_anything(self):
        self.add(rec(11, "idle"))
        move.preflight_checks = lambda *a, **k: (["sign in once on dst: miro."], [])
        code, out = self.run_it(wait=0)
        self.assertEqual(code, 1)
        self.assertIn("Refused", out)
        self.assertEqual(self.ended, [])
        code, out = self.run_it(wait=0, skip_preflight=True)
        self.assertEqual(self.ended, [11])

    def test_a_window_not_seen_on_the_target_is_reported(self):
        self.add(rec(11, "idle"))
        move.resumed_pid = lambda sid, tdir: None
        clock = {"t": 1000.0}

        def tick():
            clock["t"] += 5
            return clock["t"]
        real_time = move.time.time
        move.time.time = tick
        try:
            _, out = self.run_it(wait=0)
        finally:
            move.time.time = real_time
        self.assertIn("NOT SEEN on dst", out)


class Resume(unittest.TestCase):
    def setUp(self):
        self.real_read_config, self.real_ps = move.read_config, move.ps
        self.real_read_seat = move.read_seat

    def tearDown(self):
        move.read_config, move.ps, move.read_seat = self.real_read_config, self.real_ps, self.real_read_seat

    def test_ps_runs_in_the_c_locale(self):
        self.assertEqual(move.C_ENV["LC_ALL"], "C")
        seen = {}
        real_run = move.subprocess.run

        def run(cmd, **kw):
            seen["env"] = kw.get("env")
            return real_run(["true"], capture_output=True, text=True)
        move.subprocess.run = run
        try:
            move.ps(os.getpid(), "lstart=")
        finally:
            move.subprocess.run = real_run
        self.assertEqual(seen["env"]["LC_ALL"], "C")

    def test_body_sources_the_env_file_and_adds_chrome(self):
        move.read_config = lambda: {"resume_env_file": "/x/secrets.env"}
        body = move.resume_body("/p", "/seat", "abc", chrome=True)
        self.assertTrue(body.startswith("[ -f /x/secrets.env ] && { set -a; . /x/secrets.env; set +a; }; cd /p"))
        self.assertIn("exec claude --chrome --resume abc '/orca-move:after-move'", body)

    def test_body_without_config_is_plain(self):
        move.read_config = lambda: {}
        body = move.resume_body("/p", "/seat", "abc")
        self.assertEqual(body, "cd /p && export CLAUDE_CONFIG_DIR=/seat && exec claude --resume abc '/orca-move:after-move'\n")

    def test_chrome_follows_the_old_process_or_the_source_seat(self):
        move.read_seat = lambda d: {}
        move.ps = lambda pid, f: "claude --chrome --resume x"
        self.assertTrue(move.wants_chrome(1, "/s"))
        move.ps = lambda pid, f: "claude --resume x"
        self.assertFalse(move.wants_chrome(1, "/s"))
        move.read_seat = lambda d: {"claudeInChromeDefaultEnabled": True}
        self.assertTrue(move.wants_chrome(1, "/s"))
        move.ps = lambda pid, f: "claude --no-chrome"
        self.assertFalse(move.wants_chrome(1, "/s"))

    def test_body_keeps_the_session_name(self):
        move.read_config = lambda: {}
        body = move.resume_body("/p", "/seat", "abc", chrome=True, name="Lane 38 #4 \u00b7 it's \"done\"")
        name = "Lane 38 #4 \u00b7 it's \"done\""
        self.assertEqual(move.shlex.split(body.split("exec ", 1)[1])[:6],
                         ["claude", "--chrome", "-n", name, "--remote-control", name])

    def test_named_session_gets_its_remote_control_name_by_default(self):
        move.read_config = lambda: {}
        body = move.resume_body("/p", "/seat", "abc", name="Orchestrator onboarding #5")
        self.assertIn("exec claude -n 'Orchestrator onboarding #5' --remote-control 'Orchestrator onboarding #5'"
                      " --resume abc", body)

    def test_config_can_leave_the_remote_control_name_out(self):
        move.read_config = lambda: {"remote_control_name": "false"}
        body = move.resume_body("/p", "/seat", "abc", name="Lane 4")
        self.assertIn("exec claude -n 'Lane 4' --resume abc", body)
        body = move.resume_body("/p", "/seat", "abc", name="Lane 4", remote_control=True)
        self.assertIn("exec claude -n 'Lane 4' --remote-control 'Lane 4' --resume abc", body)

    def test_body_names_remote_control_too(self):
        move.read_config = lambda: {}
        body = move.resume_body("/p", "/seat", "abc", name="Admiral #16", remote_control=True)
        self.assertIn("exec claude -n 'Admiral #16' --remote-control 'Admiral #16' --resume abc", body)
        body = move.resume_body("/p", "/seat", "abc", remote_control=True)
        self.assertIn("exec claude --remote-control --resume abc", body)

    def test_name_is_one_safe_line(self):
        self.assertEqual(move.clean_name("a\nb\x07c  d"), "a b c d")
        self.assertIsNone(move.clean_name("  \n "))
        self.assertIsNone(move.clean_name(None))
        self.assertEqual(len(move.clean_name("x" * 500)), 200)

    def test_remote_control_follows_the_old_process(self):
        move.ps = lambda pid, f: "claude --remote-control --resume x"
        self.assertTrue(move.wants_remote_control(1))
        move.ps = lambda pid, f: "claude --resume x --remote-control-session-name-prefix h"
        self.assertFalse(move.wants_remote_control(1))

    def test_session_name_prefers_a_set_name_then_the_transcript(self):
        d = Path(tempfile.mkdtemp())
        sid = "11111111-0000-4000-8000-000000000000"
        (d / "projects" / "-p").mkdir(parents=True)
        rows = [{"type": "user", "message": "hi"},
                {"type": "custom-title", "customTitle": "Old name", "sessionId": sid},
                {"type": "custom-title", "customTitle": "Lane 2 #3 \u00b7 page access", "sessionId": sid}]
        (d / "projects" / "-p" / f"{sid}.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
        r = {"sessionId": sid, "name": "Set by hand", "nameSource": "user"}
        self.assertEqual(move.session_name(r, str(d)), "Set by hand")
        r = {"sessionId": sid, "name": "host-polished-kahn", "nameSource": "derived"}
        self.assertEqual(move.session_name(r, str(d)), "Lane 2 #3 \u00b7 page access")
        r = {"sessionId": "22222222-0000-4000-8000-000000000000", "name": "host-polished-kahn", "nameSource": "derived"}
        self.assertIsNone(move.session_name(r, str(d)))


class Preflight(unittest.TestCase):
    """Two fake seats on disk; the MCP health check is replaced."""

    def setUp(self):
        root = Path(tempfile.mkdtemp())
        self.s, self.t = root / "s", root / "t"
        self.s.mkdir()
        self.t.mkdir()
        self.saved = (move.accounts, move.mcp_health, move.read_config, move.SEATS_SEEN)
        move.accounts = lambda: {"s": {"dir": str(self.s), "family": "f"}, "t": {"dir": str(self.t), "family": "f"}}
        self.health = {}
        move.mcp_health = lambda d, cwd: dict(self.health.get(d, {}))
        move.read_config = lambda: {}
        move.SEATS_SEEN = root / "seats-seen"
        self.src = {"oauthAccount": {"emailAddress": "a@example.com"}, "mcpServers": {"m1": {"command": "x"}},
                    "projects": {"/p": {"hasTrustDialogAccepted": True, "enabledMcpjsonServers": ["db"]}},
                    "claudeInChromeDefaultEnabled": True, "hasCompletedClaudeInChromeOnboarding": True,
                    "chromeExtension": {"pairedDeviceId": "d"}, "cachedChromeExtensionInstalled": True}
        (self.s / ".claude.json").write_text(json.dumps(self.src))

    def tearDown(self):
        move.accounts, move.mcp_health, move.read_config, move.SEATS_SEEN = self.saved

    def seat(self, data):
        (self.t / ".claude.json").write_text(json.dumps(data))

    def test_a_ready_seat_is_clean(self):
        self.seat(self.src)
        self.assertEqual(move.preflight_checks("s", "t", ["/p"]), ([], []))

    def test_not_logged_in_is_listed_and_not_fixed(self):
        self.seat({k: v for k, v in self.src.items() if k != "oauthAccount"})
        todo, fixed = move.preflight_checks("s", "t", ["/p"], fix=True)
        self.assertEqual(len(todo), 1)
        self.assertIn("not logged in", todo[0])
        self.assertNotIn("oauthAccount", json.loads((self.t / ".claude.json").read_text()))

    def test_fix_copies_settings_but_never_the_login(self):
        self.seat({"oauthAccount": {"emailAddress": "b@example.com"}})
        todo, _ = move.preflight_checks("s", "t", ["/p"])
        self.assertEqual(len(todo), 3)  # servers, project, chrome
        todo, fixed = move.preflight_checks("s", "t", ["/p"], fix=True)
        self.assertEqual(todo, [])
        self.assertEqual(len(fixed), 3)
        got = json.loads((self.t / ".claude.json").read_text())
        self.assertEqual(got["oauthAccount"]["emailAddress"], "b@example.com")
        self.assertIn("m1", got["mcpServers"])
        self.assertTrue(got["projects"]["/p"]["hasTrustDialogAccepted"])
        self.assertEqual(got["projects"]["/p"]["enabledMcpjsonServers"], ["db"])
        self.assertTrue(got["claudeInChromeDefaultEnabled"])
        self.assertEqual(move.preflight_checks("s", "t", ["/p"]), ([], []))

    def test_only_servers_that_work_on_the_source_need_a_sign_in(self):
        self.seat(self.src)
        self.health = {str(self.s): {"miro": "ok", "canva": "auth"}, str(self.t): {"miro": "auth", "canva": "auth"}}
        todo, _ = move.preflight_checks("s", "t", ["/p"])
        self.assertEqual(len(todo), 1)
        self.assertIn("sign in once on t: miro.", todo[0])
        self.assertIn("command claude", todo[0])

    def test_a_new_seat_runs_the_hook_once_with_fix(self):
        self.seat(self.src)
        mark = self.t / "hook-ran"
        move.read_config = lambda: {"after_new_seat": f"touch {mark}"}
        todo, _ = move.preflight_checks("s", "t", ["/p"])
        self.assertIn("new seat", todo[0])
        self.assertFalse(mark.exists())
        todo, fixed = move.preflight_checks("s", "t", ["/p"], fix=True)
        self.assertEqual(todo, [])
        self.assertTrue(mark.exists())
        mark.unlink()
        self.assertEqual(move.preflight_checks("s", "t", ["/p"], fix=True), ([], []))
        self.assertFalse(mark.exists())


class SelfMove(unittest.TestCase):
    """The helper after this session's own exit: a new window unless it already reopened."""

    def setUp(self):
        root = Path(tempfile.mkdtemp())
        self.saved = {k: getattr(move, k) for k in ("MOVES", "alive", "resume_running", "resumed_pid",
                                                     "open_window", "SELF_GRACE_S", "WAIT_START_S")}
        move.MOVES = root
        move.alive = lambda pid, start=None: False
        move.SELF_GRACE_S = 0
        move.WAIT_START_S = 0
        self.opened = []
        move.open_window = lambda s: (self.opened.append(s), True)[1]
        move.resumed_pid = lambda sid, d: None
        (root / "abcdef12.json").write_text(json.dumps({"session": "abcdef12-x", "pid": 9, "to": "t", "toDir": "/t",
                                                        "script": str(root / "abcdef12.sh"), "line": "sh x"}))

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(move, k, v)

    def test_opens_a_new_window_after_the_exit(self):
        move.resume_running = lambda sid: False
        move.helper("abcdef12-x")
        self.assertEqual(len(self.opened), 1)

    def test_does_nothing_when_already_reopened_by_hand(self):
        move.SELF_GRACE_S = 5
        move.resume_running = lambda sid: True
        move.helper("abcdef12-x")
        self.assertEqual(self.opened, [])


if __name__ == "__main__":
    unittest.main(verbosity=1)
