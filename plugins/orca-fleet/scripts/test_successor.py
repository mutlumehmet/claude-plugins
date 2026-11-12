import subprocess
import unittest

import successor


class TabLine(unittest.TestCase):
    def test_exit_runs_only_after_the_session(self):
        line = successor.tab_line("cd /tmp && echo ran")
        self.assertEqual(line, "cd /tmp && { echo ran ; exit 0; }")
        out = subprocess.run(["zsh", "-c", line + "; echo AFTER"], capture_output=True, text=True)
        self.assertEqual(out.stdout.strip(), "ran")  # exit 0 ended the shell before AFTER

    def test_failed_cd_keeps_the_shell(self):
        out = subprocess.run(["zsh", "-c", successor.tab_line("cd /nonexistent-dir && echo ran") + "; echo STILL"],
                             capture_output=True, text=True)
        self.assertEqual(out.stdout.strip(), "STILL")

    def test_line_without_chain_is_unchanged(self):
        self.assertEqual(successor.tab_line("claude"), "claude")


if __name__ == "__main__":
    unittest.main()
