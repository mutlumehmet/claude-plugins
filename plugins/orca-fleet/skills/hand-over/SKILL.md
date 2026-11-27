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

- Find your role: admiral, orchestrator, lane or checker (from how this session was started, or its name).
- Copy `${CLAUDE_PLUGIN_ROOT}/templates/handoff-<role>.md` and fill every section from the files
  and the conversation. Exact ids, branches, shas, PR numbers, paths and commands; nothing from
  memory that a file can confirm. The next session knows only what the note says.
- **List what the person asked in this window (admiral and orchestrator).** Read your own
  transcript (path below) for every message the person typed since the last note, and write each
  in `## Asked by the person in this window, not finished` with its state and owner, unless it is
  finished. A request is never folded into a fleet table cell or a one-line summary.
- **Copy every Done when list word for word** (from the brief, orders or open item) into the
  note, each line marked holds (with evidence), left, or not checked. A list is never summarised:
  it is what the successor reports against, and nothing is done until every line holds.
- **List every yes you are still waiting for (every role).** Each yes this session asked the
  person for and did not get, and each drafted message not sent (an email, a WhatsApp, a ticket
  reply), goes in `## Waiting on the person's yes in this window` (admiral and orchestrator) or
  under `## Waiting on` (lane): the time asked, the exact yes sentence, what is held behind it
  (the draft text or its file path), channel and recipient, and its open-items id. Before saving,
  grep your note for `no yes`, `not sent`, `drafted` and `waiting`; any hit in another section
  that is a pending yes or an unsent draft moves there. Why: the successor never saw the person
  ask, so a held draft that sits in a clash or decision table is never asked again (27 Nov 2026,
  a staff reply waited a full Admiral handover unseen).
- **Every row needs an open-items id.** Any row in that table, in `## Waiting on the person's yes in
  this window`, or in `## Sent to other sessions, not yet confirmed` without one: add it to the open-items file now. Do not start the successor
  while a row has none.
- **Sweep for work you passed on (admiral and orchestrator).** Before writing, list every message
  this session and its subagents sent to another session since the last note (your SendMessage
  calls, and those in `<transcript folder>/<sessionId>/subagents/*.jsonl`). Each one that asked
  for new work goes in `## Sent to other sessions, not yet confirmed` with its open item id, unless
  the receiver has already replied that it took it. Also check the person's own requests from this
  session: each one is either done, in the open-items file, or in that table. Why: on 27 Nov 2026
  an Admiral's subagent sent a fix to an orchestrator that sat on a question to the person, the
  message was never read, the note named it in four words, and the next Admiral could not say who
  was working on it (nobody was).
- **Write your transcript path** in `## My transcript (backup)`: read `sessionId` from
  `~/.claude-<seat>/sessions/<your pid>.json` (the file whose `name` is yours). The successor reads
  it when the note is thin. Seats share one machine, so a successor on another seat can read it.
- A lane copies its reporting line into the note's `## Reports to` exactly as it stands now
  (`orchestrator <name>`, `parent "<title>" uds:<address> session:<id>` or `independent`), so the
  successor reports to the same place. A released lane stays released. In a project with several
  fleets, also write `## Fleet` with your fleet id (an orchestrator and every lane of a fleet), so
  the successor joins the same fleet; the Admiral writes `## Fleets` with every fleet's id,
  orchestrator and state.
- Name the successor: the same name with the number after `#` raised by one and the label after
  the middle dot kept as it is (`Lane 38 #4 · page access` becomes `Lane 38 #5 · page access`;
  `Lane 4 #3` becomes `Lane 4 #4`; a name without `#` gets ` #2`). Let the script do it, so the
  label survives: `python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/names.py" next "<your name>"`, adding
  `--fleet <id>` in a project with several fleets (an orchestrator or a lane), so the successor carries
  the fleet: `Lane 38 #4` becomes `Lane v1 38 #5`, `sprint 26 orchestrator` becomes
  `Orchestrator v1 #27`. The
  label changes only when the orchestrator gave this lane a different job and wrote the new label
  in the orders file; then add `--label "<new label>"`.
- Save it as `<files.handoffDir>/handoff-<slug>.md`, where the slug is
  `names.py slug "<successor name>"`: the name without its label, lowercase, spaces and `#` as
  dashes (`Lane 38 #5 · page access` becomes `handoff-lane-38-5.md`). The config is
  `.claude/orca-strator.json`; without one, use the project's notes folder.
- If the project is a git repo and the notes folder is tracked, commit the note on its own.

Without `start`: tell whoever you report to (the orchestrator, your parent, or the person) "handoff note ready: <path>" and keep
working; update the note again just before starting the successor.

## 2. Start the successor (`start`)

1. Finish or park the step in hand: nothing half pushed, no merge mid way.
2. Update the note's state sections one last time.
3. Run:

   ```bash
   python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/successor.py" --name "<successor name>" \
     --cwd "<project folder>" [--fleet <id>] \
     --prompt "/orca-fleet:<conduct|join-lane|join-checker|admiral> <note path>"
   ```

   An orchestrator of one of several fleets passes `--fleet <id>` and its prompt starts
   `/orca-fleet:conduct --fleet <id>`.

   It opens a new Terminal window in the same account. Elsewhere it prints the command and copies
   it, for the person to paste.
4. Tell whoever you report to (a lane or checker; an independent lane tells the person) or the
   fleet (the orchestrator does this through the successor's `conduct`): "<you> hands over to
   <successor>, note <path>."
5. Wait for the successor's message "<successor> took over" (it sends it to you and to
   whoever it reports to by itself). Then delete your crons with
   CronDelete, reply "handed over, closing", and tell the person this window can be closed.
   Do not close it yourself.

If no report arrives within a few minutes, say so to the person with the command to start it by
hand, and keep the crons running.
