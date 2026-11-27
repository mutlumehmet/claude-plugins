#!/usr/bin/env python3
"""Tests for successor.py: the new session always gets its name with -n, on every path.

Run: python3 -I plugins/orca-fleet/scripts/test_successor.py
Nothing opens: the Terminal and clipboard calls are replaced in the module.
"""

import contextlib
import io
import os
import shlex
import sys
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import successor  # noqa: E402


def words(line):
    """The claude command's own words, after `command claude`."""
    return shlex.split(line.split("command claude ", 1)[1])


class Command(unittest.TestCase):
    def test_name_goes_in_with_n(self):
        line = successor.command("Lane 38 #4 · page access", "/orca-fleet:join-lane note.md", "/p")
        self.assertEqual(words(line)[:2], ["-n", "Lane 38 #4 · page access"])
        self.assertNotIn("--remote-control", line)

    def test_name_with_quotes_stays_one_word(self):
        line = successor.command("Lane 2 · it's \"done\"", "go", "/p")
        self.assertEqual(words(line), ["-n", "Lane 2 · it's \"done\"", "go"])

    def test_account_path_keeps_the_name(self):
        line = successor.command("Checker A #3", "go", "/p", "export CLAUDE_CONFIG_DIR=/seat && ")
        self.assertIn("export CLAUDE_CONFIG_DIR=/seat && ", line)
        self.assertEqual(words(line)[:2], ["-n", "Checker A #3"])

    def test_remote_control_gets_the_same_name(self):
        line = successor.command("Orchestrator v1 #4", "go", "/p", remote_control=True)
        self.assertEqual(words(line), ["-n", "Orchestrator v1 #4", "--remote-control", "Orchestrator v1 #4", "go"])


class Main(unittest.TestCase):
    PATCHED = ("account_env", "started_with_remote_control", "open_tab")

    def setUp(self):
        self.saved = {k: getattr(successor, k) for k in self.PATCHED}
        self.real_run, self.real_argv = successor.subprocess.run, sys.argv
        successor.subprocess.run = lambda *a, **k: None  # no clipboard
        successor.open_tab = lambda line: False
        successor.account_env = lambda acc: "export CLAUDE_CONFIG_DIR=/seat && "
        successor.started_with_remote_control = lambda: False

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(successor, k, v)
        successor.subprocess.run, sys.argv = self.real_run, self.real_argv

    def run_it(self, *args):
        sys.argv = ["successor.py", "--dry-run", "--cwd", "/p", *args]
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = successor.main()
        self.assertEqual(code, 0)
        return out.getvalue().strip().splitlines()[-1]

    def test_every_path_passes_the_name(self):
        for extra in ([], ["--account", "twin"], ["--fleet", "v1"], ["--account", "twin", "--fleet", "v1"]):
            line = self.run_it("--name", "Lane v1 5 · page access", "--prompt", "go", *extra)
            self.assertEqual(words(line)[:2], ["-n", "Lane v1 5 · page access"], extra)

    def test_remote_control_by_flag_or_inherited(self):
        line = self.run_it("--name", "Lane 5", "--prompt", "go", "--remote-control")
        self.assertEqual(words(line)[:4], ["-n", "Lane 5", "--remote-control", "Lane 5"])
        successor.started_with_remote_control = lambda: True
        line = self.run_it("--name", "Lane 6", "--prompt", "go", "--account", "twin")
        self.assertEqual(words(line)[:4], ["-n", "Lane 6", "--remote-control", "Lane 6"])


if __name__ == "__main__":
    unittest.main()
