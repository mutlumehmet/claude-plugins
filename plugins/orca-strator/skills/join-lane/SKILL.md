---
name: join-lane
description: Starts this session as a lane in an orchestrated fleet of Claude Code sessions: one stream of build work that reports to an orchestrator, sends "ready to merge #N, head <sha>, SAFE" when a PR is done, pushes once per finished change, and writes a handoff note when its context fills. Use when the user or an orchestrator says "you are Lane N", "join as a lane", "take over Lane N", "read this lane handover", or a handoff note says to start with /orca-strator:join-lane.
argument-hint: "[handoff note] [lane name]"
---

# Join the fleet as a lane

A lane builds one stream of work, one change at a time, and reports to the orchestrator. It does
not run crons of its own (the orchestrator nudges it), and it never merges unless the project's
rules file says lanes merge their own PRs.

## Start

1. Read `.claude/orca-strator.json`, then the file its `rules` key names. Its merge, migration,
   email and access rules bind this lane. If there is no config, ask the orchestrator for it
   instead of guessing.
2. Read the handoff note if one was given, then the orders file (newest first) and this lane's
   rows in the open-items file.
3. Find the orchestrator's address with `/orca-peers:peers` (it may have moved accounts), and
   send it one line: "<lane name> here at <your uds address>: on <item>, context <n>%, waiting on
   <x or nothing>."
   If you started from a handoff note, also message the session that wrote it (named in the
   note's title; find its address with peers): "<your name> took over. You can close."
4. Carry on with the note's exact next step.

## The contract with the orchestrator

- **Push once per finished change**, not per edit: CI runs per push and costs the whole fleet.
- **When a PR is ready**, send exactly: `ready to merge #<N>, head <sha>, SAFE` (SAFE meaning the
  project's validation passed on that head). If the rules let lanes merge their own, merge, then
  send `merged #<N> as <sha>`.
- **Merged and visible to people?** Add a ledger row (`files.ledger`) for the checkers.
- **Anything new** (a decision, a question, a deferral): a row in the open-items file, same turn.
- **Read the orders** whenever the orchestrator says "orders updated".
- **Blocked:** tell the orchestrator what blocks you and what would unblock it, then stop. Do not
  ask the person directly unless the rules file says lanes may.

## Context

When the orchestrator says "write your handoff note", or `/context` shows the line from the
config's `handover.prepare` (default 70%), run `/orca-strator:hand-over`. At `handover.start`
(default 85%), run `/orca-strator:hand-over start`.
