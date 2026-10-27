---
name: hand-over
description: Hands this session's work to a fresh session before its context fills. It writes a handoff note from its role's template (orchestrator, lane or checker), and with "start" opens the successor in a new terminal tab (a new session, never a fork) that reads the note, reports in, and takes over; this session stops once the successor confirms. Use when context passes about 70 to 85%, when an orchestrator says "write your handoff note" or "hand over now", or the user says "hand over", "handover", "start a fresh session", "write the handoff", "context is full".
argument-hint: "[start]"
---

# Hand over to a fresh session

A long session gets slower and forgets early details as its context fills. The cure is a fresh
session with an empty context that reads one good note. A fork would carry the full context over,
so a handover always starts a new session.

## 1. Write the note (always)

- Find your role: orchestrator, lane or checker (from how this session was started, or its name).
- Copy `${CLAUDE_PLUGIN_ROOT}/templates/handoff-<role>.md` and fill every section from the files
  and the conversation. Exact ids, branches, shas, PR numbers, paths and commands; nothing from
  memory that a file can confirm. The next session knows only what the note says.
- Name the successor: the same name with the number after `#` raised by one (`Lane 4 #3` becomes
  `Lane 4 #4`); a name without `#` gets ` #2`.
- Save it as `<files.handoffDir>/handoff-<successor name in lowercase, spaces and # as dashes>.md`
  (`Lane 4 #4` becomes `handoff-lane-4-4.md`). The config is `.claude/orca-strator.json`;
  without one, use the project's notes folder.
- If the project is a git repo and the notes folder is tracked, commit the note on its own.

Without `start`: tell the orchestrator (or the person) "handoff note ready: <path>" and keep
working; update the note again just before starting the successor.

## 2. Start the successor (`start`)

1. Finish or park the step in hand: nothing half pushed, no merge mid way.
2. Update the note's state sections one last time.
3. Run:

   ```bash
   python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/successor.py" --name "<successor name>" \
     --cwd "<project folder>" \
     --prompt "/orca-strator:<conduct|join-lane|join-checker> <note path>"
   ```

   It opens a new Terminal window in the same account. Elsewhere it prints the command and copies
   it, for the person to paste.
4. Tell the orchestrator (a lane or checker) or the fleet (the orchestrator does this through the
   successor's `conduct`): "<you> hands over to <successor>, note <path>."
5. Wait for the successor's message "<successor> took over" (it sends it to you and to the
   orchestrator by itself). Then delete your crons with
   CronDelete, reply "handed over, closing", and tell the person this window can be closed.
   Do not close it yourself.

If no report arrives within a few minutes, say so to the person with the command to start it by
hand, and keep the crons running.
