#!/usr/bin/env python3
"""Tests for fleets.py (lock, claims, project key). Run: python3 -I plugins/orca-fleet/scripts/test_fleets.py"""

import os
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "fleets.py")


class Fleets(unittest.TestCase):
    def setUp(self):
        self.store = tempfile.mkdtemp()
        self.project = tempfile.mkdtemp()

    def run_it(self, *args, session="s1"):
        env = dict(os.environ, ORCA_FLEETS_DIR=self.store, ORCA_FLEETS_TEST_SESSION=session)
        r = subprocess.run([sys.executable, "-I", SCRIPT, "--project", self.project, *args],
                           capture_output=True, text=True, env=env, timeout=20)
        return r.returncode, (r.stdout + r.stderr).strip()

    def test_lock_take_and_release(self):
        self.assertEqual(self.run_it("lock", "show")[1], "Free.")
        self.assertEqual(self.run_it("lock", "take", "--by", "v1 orchestrator #1", "--pr", "12")[0], 0)
        code, out = self.run_it("lock", "take", "--by", "agentic orchestrator #1", session="s2")
        self.assertEqual(code, 1)
        self.assertIn("Held by v1 orchestrator #1 for #12", out)
        # typing the holder's name is not enough: the lock belongs to the session
        self.assertEqual(self.run_it("lock", "release", "--by", "v1 orchestrator #1", session="s2")[0], 1)
        self.assertEqual(self.run_it("lock", "release", "--by", "v1 orchestrator #1")[0], 0)
        self.assertEqual(self.run_it("lock", "take", "--by", "agentic orchestrator #1", session="s2")[0], 0)

    def test_successor_orchestrator_releases_its_fleets_lock(self):
        self.run_it("register", "orchestrator", "--fleet", "v1", session="old")
        self.run_it("lock", "take", "--by", "v1 orchestrator #26", "--fleet", "v1", session="old")
        self.assertEqual(self.run_it("register", "orchestrator", "--fleet", "v1", "--takeover", session="new")[0], 0)
        self.assertEqual(self.run_it("lock", "release", "--by", "v1 orchestrator #27", session="new")[0], 0)

    def test_numbers_compare_by_value(self):
        self.assertEqual(self.run_it("claim", "migration", "198", "--by", "A")[0], 0)
        code, out = self.run_it("claim", "migration", "0198", "--by", "B")
        self.assertEqual(code, 1)
        self.assertIn("taken by A", out)

    def test_retire_needs_admiral_or_own_orchestrator(self):
        self.run_it("register", "orchestrator", "--fleet", "v1", session="o1")
        self.assertEqual(self.run_it("retire", "--fleet", "v1", session="lane")[0], 1)
        self.assertEqual(self.run_it("retire", "--fleet", "v1", session="o1")[0], 0)

    def test_expired_lock_can_be_taken(self):
        self.assertEqual(self.run_it("lock", "take", "--by", "a", "--ttl", "0")[0], 0)
        code, out = self.run_it("lock", "take", "--by", "b")
        self.assertEqual(code, 0)
        self.assertIn("expired lock from a", out)

    def test_claims_do_not_collide(self):
        self.assertEqual(self.run_it("claim", "migration", "0198", "--by", "Lane 38")[0], 0)
        self.assertEqual(self.run_it("claim", "migration", "0198", "--by", "Lane 38")[0], 0)
        code, out = self.run_it("claim", "migration", "0198", "--by", "Lane 40")
        self.assertEqual(code, 1)
        self.assertIn("taken by Lane 38", out)

    def test_next_skips_claimed_and_floor(self):
        self.assertEqual(self.run_it("next", "migration", "--floor", "197", "--by", "x", "--width", "4")[1], "0198")
        self.assertEqual(self.run_it("next", "migration", "--floor", "197", "--by", "y", "--width", "4")[1], "0199")
        self.assertEqual(self.run_it("next", "migration", "--floor", "250", "--by", "z", "--width", "4")[1], "0251")

    def test_list_empty_and_retire_unknown(self):
        self.assertIn("Admiral: none", self.run_it("list")[1])
        self.assertEqual(self.run_it("retire", "--fleet", "nope")[0], 1)

    def test_projects_are_separate(self):
        self.run_it("lock", "take", "--by", "a")
        other = tempfile.mkdtemp()
        env = dict(os.environ, ORCA_FLEETS_DIR=self.store, ORCA_FLEETS_TEST_SESSION="s1")
        r = subprocess.run([sys.executable, "-I", SCRIPT, "--project", other, "lock", "show"],
                           capture_output=True, text=True, env=env, timeout=20)
        self.assertEqual(r.stdout.strip(), "Free.")


if __name__ == "__main__":
    unittest.main()
