#!/usr/bin/env python3
"""Tests for names.py. Run: python3 -I plugins/orca-fleet/scripts/test_names.py"""

import os
import sys
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import names  # noqa: E402


class Fleets(unittest.TestCase):
    def test_new_lane(self):
        self.assertEqual(names.lane_name("v1", 38, "page access"), "Lane v1 38 · page access")

    def test_parse_fleet_lane(self):
        self.assertEqual(names.parse("Lane v1 38 #5 · page access"), ("Lane v1 38", 5, "page access"))
        self.assertEqual(names.fleet_of("Lane v1 38 #5 · page access"), "v1")
        self.assertEqual(names.lane_number("Lane v1 38 #5 · page access"), "38")
        self.assertEqual(names.lane_number("Lane 38 #4"), "38")
        self.assertIsNone(names.fleet_of("Lane 38 #4"))

    def test_orchestrator(self):
        self.assertEqual(names.orchestrator_name("agentic"), "Orchestrator agentic #1")
        self.assertEqual(names.fleet_of("Orchestrator ci-cost #3"), "ci-cost")
        self.assertEqual(names.next_name("Orchestrator v1 #27"), "Orchestrator v1 #28")

    def test_old_names_move_at_handover(self):
        self.assertEqual(names.next_name("Lane 38 #4 · page access", fleet="v1"), "Lane v1 38 #5 · page access")
        self.assertEqual(names.next_name("sprint 26 orchestrator", fleet="v1"), "Orchestrator v1 #27")
        self.assertEqual(names.next_name("agentic orchestrator #1", fleet="agentic"), "Orchestrator agentic #2")
        self.assertEqual(names.next_name("Lane v1 38 #5 · page access", fleet="v1"), "Lane v1 38 #6 · page access")

    def test_checker_unchanged_by_fleet(self):
        self.assertEqual(names.next_name("Checker A #17 · demo checks", fleet="v1"), "Checker A #18 · demo checks")

    def test_slug_with_fleet(self):
        self.assertEqual(names.slug("Lane v1 38 #5 · page access"), "lane-v1-38-5")


class Parse(unittest.TestCase):
    def test_full(self):
        self.assertEqual(names.parse("Lane 38 #4 · page access"), ("Lane 38", 4, "page access"))

    def test_checker(self):
        self.assertEqual(names.parse("Checker A #17 · demo checks"), ("Checker A", 17, "demo checks"))

    def test_old_names(self):
        self.assertEqual(names.parse("Lane 4 #3"), ("Lane 4", 3, None))
        self.assertEqual(names.parse("Lane 1"), ("Lane 1", None, None))

    def test_label_without_number(self):
        self.assertEqual(names.parse("Lane 2 · imports"), ("Lane 2", None, "imports"))

    def test_tight_spacing(self):
        self.assertEqual(names.parse("Lane 38#4·page access"), ("Lane 38", 4, "page access"))


class Next(unittest.TestCase):
    def test_keeps_label(self):
        self.assertEqual(names.next_name("Lane 38 #4 · page access"), "Lane 38 #5 · page access")

    def test_double_digit(self):
        self.assertEqual(names.next_name("Checker A #17 · demo checks"), "Checker A #18 · demo checks")

    def test_new_label(self):
        self.assertEqual(names.next_name("Lane 38 #4 · page access", "email sync"), "Lane 38 #5 · email sync")

    def test_old_names(self):
        self.assertEqual(names.next_name("Lane 4 #3"), "Lane 4 #4")
        self.assertEqual(names.next_name("Lane 1"), "Lane 1 #2")
        self.assertEqual(names.next_name("Lane 2 · imports"), "Lane 2 #2 · imports")


class Base(unittest.TestCase):
    def test_lane_id_is_exact(self):
        # "Lane 3" must not match "Lane 38": compare bases, not prefixes
        self.assertNotEqual(names.parse("Lane 38 #4 · page access")[0], "Lane 3")
        self.assertEqual(names.parse("Lane 38 #4 · page access")[0], "Lane 38")

    def test_fleet_prefix_still_matches(self):
        self.assertTrue("Lane 38 #4 · page access".startswith("Lane"))
        self.assertTrue("Checker A #17 · demo checks".startswith("Checker"))


class Slug(unittest.TestCase):
    def test_label_left_out(self):
        self.assertEqual(names.slug("Lane 4 #4 · page access"), "lane-4-4")
        self.assertEqual(names.slug("Lane 4 #4"), "lane-4-4")
        self.assertEqual(names.slug("Checker A #18 · demo checks"), "checker-a-18")


class Label(unittest.TestCase):
    def test_good(self):
        for good in (None, "", "page access", "demo checks", "monday import fixes"):
            self.assertIsNone(names.label_problem(good), good)

    def test_bad(self):
        for bad in ("fix the page access list", "§24.94 fix", "#1176 retest", "S9 651", "order 12"):
            self.assertIsNotNone(names.label_problem(bad), bad)


if __name__ == "__main__":
    unittest.main()
