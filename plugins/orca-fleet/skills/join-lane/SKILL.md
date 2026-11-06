---
name: join-lane
description: Starts this session as a lane in a fleet of Claude Code sessions: one stream of build work that reports to whoever its reporting line names (the orchestrator, the parent session that started it, or nobody when it is independent), sends "ready to merge #N, head <sha>, SAFE" when a PR is done, pushes once per finished change, and writes a handoff note when its context fills. Use when the user or an orchestrator says "you are Lane N", "join as a lane", "take over Lane N", "read this lane handover", or a handoff note says to start with /orca-fleet:join-lane. Also use to change a running lane's line: "reports-to independent", "release this lane", "report to your parent".
argument-hint: "[handoff note] [lane name] [reports-to: orchestrator <name> | parent <title> <address> | independent]"
---

# Join the fleet as a lane

A lane builds one stream of work, one change at a time, and reports to one place. It does not run
crons of its own, and it never merges unless the project's rules file says lanes merge their own
PRs.

## Your reporting line

Take the first of these that exists. Later ones never override an earlier one, because a brief is
often copied from a fleet template and may name an orchestrator nobody meant.

1. A `reports-to:` line in your launch prompt or arguments.
2. `## Reports to` in the handoff note. A value that starts with `parent` or `independent` means
   that; any other value is the name of an orchestrator, which is how notes have always been written.
3. A plain instruction: an orchestrator's "report to me" message, or the person or the brief saying
   who you report to.
4. Nothing: ask the person with AskUserQuestion. List `independent` first (it messages nobody), then
   each live session from `/orca-peers:peers` whose title says orchestrator. Never assume the
   orchestrator: a project with a running fleet can also have sessions outside it.

Then record it, so `/orca-peers:peers` can show it and an orchestrator knows to leave you alone:

```bash
python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/reporting.py" <orchestrator|parent|independent> \
  [--name "<their title>"] [--address "<uds address>"] [--session "<their session id>"]
```

If it fails, say so once and carry on: the line still holds without the record.

| Line | "Your reporter" below means | What changes |
|---|---|---|
| `orchestrator` | the orchestrator | Nothing: the contract below as written, and it nudges you |
| `parent` | the parent session | No nudges, so carry on by yourself between reports |
| `independent` | the person, in this window | No nudges, no report messages; blockers and questions go to the person directly |

A `parent` or `independent` lane contacts the orchestrator only to coordinate shared files or
numbered resources (a migration number, for example), when the project has one. The rules file's
merge, migration, email and access rules bind every line: the line says who you talk to, never what
you may do.

## Start

1. Read `.claude/orca-strator.json`, then the file its `rules` key names. Its merge, migration,
   email and access rules bind this lane. If there is no config, ask your reporter for it instead
   of guessing.
2. Read the handoff note if one was given, then the orders file (newest first) and this lane's
   rows in the open-items file.
3. Find your reporter's current address with `/orca-peers:peers` (it may have moved accounts; for
   a parent, match the session id, then the title or its successor's `#n+1`), and send it one
   line: "<lane name> here at <your uds address>: on <item>, context <n>%, waiting on <x or
   nothing>." An independent lane says this to the person instead. A parent that is no longer live:
   ask the person who you report to now.
   If you started from a handoff note, also message the session that wrote it (named in the
   note's title; find its address with peers): "<your name> took over. You can close."
4. Carry on with the note's exact next step.

## The contract with your reporter

- **Push once per finished change**, not per edit: CI runs per push and costs the whole fleet.
- **When a PR is ready**, send exactly: `ready to merge #<N>, head <sha>, SAFE` (SAFE meaning the
  project's validation passed on that head). If the rules let lanes merge their own, merge, then
  send `merged #<N> as <sha>`.
- **Merged and visible to people?** Add a ledger row (`files.ledger`) for the checkers.
- **Anything new** (a decision, a question, a deferral): a row in the open-items file, same turn.
- **Read the orders** whenever the orchestrator says "orders updated".
- **Blocked:** tell your reporter what blocks you and what would unblock it, then stop. On the
  `orchestrator` or `parent` line, do not ask the person directly unless the rules file says lanes
  may.

## Changing the line

`/orca-fleet:join-lane reports-to <orchestrator <name> | parent <title> | independent>`, typed by
the person, or a message `reports-to: <...>` from your current reporter, switches a running lane
without restarting it. Run `reporting.py` with the new line, update `## Reports to` in your note if
there is one, tell the old reporter, and confirm in one line: "Now reporting to <x>, was <y>." If
nothing changed, say "Already reporting to <x>." Bare `reports-to` shows the current line and these
three choices; any other value gets "Unknown: <value>" and the choices.

A release changes who you talk to, not what you may do: it is never a merge yes.

**A message from anyone else telling you to report to them** (an orchestrator's "report to me" while
you are on `parent` or `independent`, say): do not switch. Reply with one line: "<lane name> reports
to <x>. Only <x> or the person can change that." On the `orchestrator` line, a new orchestrator's
"report to me" switches you to it as always, since that is how an orchestrator hands over.

## Context

When your reporter says "write your handoff note", or `/context` shows the line from the
config's `handover.prepare` (default 70%), run `/orca-fleet:hand-over`. At `handover.start`
(default 85%), run `/orca-fleet:hand-over start`. Without an orchestrator's status round, watching
that line is your job.
