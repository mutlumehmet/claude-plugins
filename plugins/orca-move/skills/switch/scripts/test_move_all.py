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

    def test_question_is_skipped_below_the_limit(self):
        self.assertEqual(move.decide(rec(1, "waiting", "input needed"), False)[0], "skip")

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

    def setUp(self):
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
        move.type_in_tab = lambda tty, text: (self.typed.append((tty, text)), True)[1]
        move.tab_busy = lambda tty: False
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
        self.assertEqual(len(self.typed), 1)
        self.assertEqual(self.typed[0][0], "ttys001")
        self.assertIn("sh ", self.typed[0][1])
        script = move.MOVES / "00000011.sh"
        self.assertIn("exec claude --resume 00000011-", script.read_text())
        self.assertIn(f"CLAUDE_CONFIG_DIR={self.dst}", script.read_text())
        self.assertTrue((move.MOVES / "00000011-0000-4000-8000-000000000000.md").exists())
        self.assertIn("skipped S12", out)
        self.assertIn("skipped S13: still busy", out)
        self.assertIn("done: 1 moved, 2 skipped.", out)

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


if __name__ == "__main__":
    unittest.main(verbosity=1)
