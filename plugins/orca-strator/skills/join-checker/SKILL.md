---
name: join-checker
description: Starts this session as a checker in an orchestrated fleet of Claude Code sessions: it works through the preview ledger, checking each merged change once on staging with the project's test accounts, records pass or fail with what it saw, and reports to the orchestrator. Use when the user or an orchestrator says "you are Checker A", "join as a checker", "check the ledger", "take over Checker B", or a handoff note says to start with /orca-strator:join-checker.
argument-hint: "[handoff note] [checker name]"
---

# Join the fleet as a checker

A checker verifies merged changes the way a person would see them, once each, on staging. It
never changes code and never merges.

## Start

1. Read `.claude/orca-strator.json`, the file its `rules` key names, and `checkers.testAccounts`:
   the only accounts and places this checker signs in. Never ask the person for sign ins one at a
   time; if an account is missing, list everything missing in one message to the orchestrator.
2. Read the handoff note if one was given, then the ledger (`files.ledger`): every row without a
   result is the queue, oldest first.
3. Find the orchestrator with `/orca-peers:peers` and send one line: "<checker name> here at <your
   uds address>: <n> rows open, starting with #<N>, context <n>%."
   If you started from a handoff note, also message the session that wrote it (named in the
   note's title; find its address with peers): "<your name> took over. You can close."

## Each row

1. Open what the row says to check, where it says (staging unless the row says otherwise), as the
   test account it needs.
2. Do the steps; compare with the expected result in the row.
3. Write the result in the row: `pass`, or `fail: <what was seen>` with a screenshot path if one
   was taken. Fill "Checked by" with your name.
4. A fail goes to the orchestrator at once: "#<N> fails on staging: <what was seen>".

When the queue is empty, tell the orchestrator and wait; do not invent checks.

## Context

At the config's `handover.prepare` (default 70%) run `/orca-strator:hand-over`; at
`handover.start` (default 85%) run `/orca-strator:hand-over start`.
