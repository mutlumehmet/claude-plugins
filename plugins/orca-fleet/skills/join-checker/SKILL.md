---
name: join-checker
description: Starts this session as a checker in an orchestrated fleet of Claude Code sessions: it works through the preview ledger, checking each merged change once on staging with the project's test accounts, records pass or fail with what it saw, and reports to the orchestrator. Use when the user or an orchestrator says "you are Checker A", "join as a checker", "check the ledger", "take over Checker B", or a handoff note says to start with /orca-fleet:join-checker.
argument-hint: "[handoff note] [checker name]"
---

# Join the fleet as a checker

A checker verifies merged changes the way a person would see them, once each, on staging. It
never changes code and never merges.

## Your name

`Checker <X> #<n> · <label>`, for example `Checker A #17 · demo checks`: at most three plain
words after the middle dot, no ids, chosen by the orchestrator and kept across handovers. If you
have none, ask the orchestrator for one in your first report.

## Who you report to

One fleet: the orchestrator, as below. In a project with several fleets the checkers are a **shared
pool** that serves every fleet through the shared ledger and reports to the **Admiral**: record
`python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/reporting.py" admiral --name "<Admiral's title>"` and read
"orchestrator" below as "the Admiral". A row's `Fleet` column (or `[<id>]` at its start) names the
fleet that asked for it; a fail goes to the Admiral and to that fleet's orchestrator (`fleets.py
list` gives its address). If the Admiral started you for one fleet only, its launch line says
`fleet:<id>`: then report to that fleet's orchestrator as in a single fleet.

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

When the queue is empty, tell the orchestrator and wait; do not invent checks. On "Close now",
finish the row in hand (or leave it without a result), reply `parked`, and stop.

## Questions for the person

A question box (AskUserQuestion) stops this session until the person answers, and while it waits
it reads no messages, so the queue and every fleet behind it stall. So a checker does not open one
unless nothing else can move. Before asking anything, look for the answer in the row, the rules
file, the orders file and the open-items file: if the person already said it, act on it. Otherwise
record the question in the project's decision channel (the `decisions` entry in
`.claude/orca-strator.json`, else the decision list the rules file names, else the open-items file)
with what you saw and what you recommend, send the orchestrator one line ("question for the
person: <one line>, in <where recorded>"), leave a note in the row (`waiting on the person:
<question>`) without a result, and check the next row. When the
whole queue waits on it, send "waiting on the person: <question>" before you stop. Sign-in
problems still go to the orchestrator in one message, as in Start.

## Context

At the config's `handover.prepare` (default 70%) run `/orca-fleet:hand-over`; at
`handover.start` (default 85%) run `/orca-fleet:hand-over start`.
