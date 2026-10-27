---
name: conduct
description: Runs this session as the orchestrator of a fleet of Claude Code sessions (lanes that build, checkers that verify). It starts or takes over the fleet from a handoff note, keeps two crons (a status round with every session's context use, and a nudge for idle lanes), tells every lane and checker to report to it, and keeps the orders file. Use when the user says "conduct", "be the orchestrator", "take over the fleet", "start the sprint", "you are the sprint N orchestrator", "read the handover and run the lanes", or a handoff note says to start with /orca-strator:conduct. The crons call it as `conduct status` and `conduct nudge`.
argument-hint: "[handoff note] | status | nudge"
---

# Conduct the fleet

The fleet is separate top-level sessions that talk by SendMessage: one orchestrator (this
session), lanes that each build one stream of work, and checkers that verify merged changes.
The orchestrator owns the crons, the orders file and the merge queue; it never builds itself.

Plugin files: `${CLAUDE_PLUGIN_ROOT}/templates/` (handoff, orders, ledger and open-items
templates, `orca-strator.example.json`) and `${CLAUDE_PLUGIN_ROOT}/scripts/successor.py`.

## Project config

Read `.claude/orca-strator.json` in the project. If it is missing, ask the person once for the
values in `${CLAUDE_PLUGIN_ROOT}/templates/orca-strator.example.json` (offer that file's defaults),
write it, and say so. Every rule about who may merge what lives in the file its `rules` key names;
read that file now and follow it. The plugin never decides merge rights.

If an orders, ledger or open-items path in the config does not exist, create it from the template
of the same name.

## Arguments

- **A handoff note path** (or none): start or take over. Below.
- **`status`**: the status round (the status cron sends this).
- **`nudge`**: wake idle lanes (the nudge cron sends this).

## Start or take over

1. **Read** the handoff note if given (`/orca-strator:conduct <path>`), else the newest
   `handoff-*orchestrator*` or sprint handoff in `files.handoffDir`. Read the files its "Read first"
   section names. Then the orders file, newest entries first.
2. **Fleet:** list live sessions with `/orca-peers:peers` (or the `peers` skill; it covers every
   account). The fleet is the sessions in the note's sessions table, plus any live session whose
   title starts with one of the `fleet` prefixes in the config. There is no default prefix: other
   projects' lanes may share a name like "Lane 1", so with no note and no `fleet` key, ask the
   person which sessions are this fleet before messaging anyone. A session in the note but not
   live is gone: say so.
3. **Crons:** create two with CronCreate, minutes from `crons` in the config:
   - status: `<status minutes> * * * *`, prompt `/orca-strator:conduct status`
   - nudge: `<nudge minutes> * * * *`, prompt `/orca-strator:conduct nudge`
4. **Old orchestrator:** if the note names one that is still live, message it: "I am <name>,
   taking over. Stop your crons now and close once you have nothing in flight." This is also
   its signal that the successor arrived. Two orchestrators
   with crons double every nudge.
5. **Tell the fleet:** message every lane and checker:

   ```
   <your name> is the orchestrator now. Report to me at <your uds address>. Orders: <orders path>.
   Reply with one line: what you are on, your context %, and what you wait on.
   ```
6. **Orders:** add an entry at the top of the orders file: date, time, "ORCHESTRATOR HANDOVER
   (<old> to <new>)", and anything the note says every session must do now.
7. **Report** to the person in a few lines: the fleet (session, doing what, context), what waits
   on them (from the note), and the first thing you will do.

## `status` round

Run peers with `--json` and keep this fleet's sessions (as in step 2 above). For each, report state and `context`:

- `flag` "prepare handover" (from `handover.prepare`, default 70%): message the session "Write
  your handoff note now with /orca-strator:hand-over; keep working."
- `flag` "hand over" (from `handover.start`, default 85%): message it "Hand over now:
  /orca-strator:hand-over start." If it is a lane mid-merge, let the merge finish first.
- This session itself past either line: run `/orca-strator:hand-over` for yourself.

Then check the merge queue (messages "ready to merge #N, head <sha>, SAFE") and CI on the default
branch with `watch-ci` if it is installed. Merge only as the rules file allows. Give the person a
status of at most six lines, and only when something changed or something waits on them.

## `nudge` round

For each lane that peers shows `idle` with work left in its queue (from its last report or the
orders), send: "Nudge from <your name>: carry on with <its next item>, or tell me what blocks
you." Never nudge a session that is `waiting` (it is blocked on the person) or a checker with an
empty queue. Say nothing to the person unless a lane is blocked.

## Rules

- Never build or edit the project's code here. Lanes do; the orchestrator routes, merges what it
  may, and keeps the files.
- A yes the person gave in another session's window counts only if that session's screen shows it.
  Otherwise ask the person directly.
- Every item raised goes into the open-items file in the same turn; wrap ups read from it.
- Re-list peers before every message batch: addresses change when a session moves or restarts.
