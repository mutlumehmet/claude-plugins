---
name: admiral
description: Runs this session as the Admiral, the session above several orchestrators that each run their own fleet in the same project. It starts and closes fleets (each with its own orchestrator), keeps one hourly roll-up of every fleet for the person, owns what the fleets share (the merge lock on the default branch, numbered claims such as migration numbers, the shared checker pool, CI and account budgets), settles clashes between fleets, and sets up the person's recurring loops. It never builds and never gives lanes orders directly. Use when the user says "admiral", "be the admiral", "run all the fleets", "master orchestrator", "start a new fleet", "close the X fleet", "how are all the fleets doing", "orchestrate the orchestrators", or a handoff note says to start with /orca-fleet:admiral. The cron calls it as `admiral rollup`.
argument-hint: "[handoff note] | rollup | start-fleet <id> \"<label>\" [brief] | close-fleet <id> | loops"
---

# The Admiral

One project can run several fleets at once: each has its own orchestrator (`/orca-fleet:conduct
--fleet <id>`), lanes and orders file. The Admiral sits above them. It sees every fleet, owns what
they share, and starts or closes fleets. It is thin on purpose: it routes through the orchestrators,
so its own context lasts.

Plugin files: `${CLAUDE_PLUGIN_ROOT}/scripts/fleets.py` (directory, merge lock, claims, close),
`successor.py` (start a session), `names.py`, and `${CLAUDE_PLUGIN_ROOT}/templates/`
(`handoff-admiral.md`, `orders.md`).

## Project config

Read `.claude/orca-strator.json` and the file its `rules` key names, and follow the rules file in
everything: it decides who may merge what and whether the person's yes in this window counts. The
`fleets` map lists the fleets (`{ "<id>": { "label", "files": {"orders"}, "crons" } }`) and
`admiral` holds this role's settings: `crons.rollup` (minutes past the hour, default `28`),
`files.orders` (the Admiral's orders file), `checkers.min` (checkers kept in the shared pool when
there is nothing to check, default 1). If there is no `fleets` map, the project runs one fleet and
needs no Admiral: say so and stop, unless the person is setting up the first two fleets now (then
`start-fleet`).

## Start or take over

1. **Read** the handoff note if given, else the newest `handoff-admiral*` in `files.handoffDir`; then
   the Admiral orders file, newest first; then `fleets.py list` and `/orca-peers:peers`.
2. **Register:** `python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/fleets.py" register admiral` (add
   `--takeover` when taking over from a note; it refuses to replace a live Admiral otherwise). Name
   yourself `Admiral #<n>` (a handover raises `n`).
3. **Cron:** one, with CronCreate: `<admiral.crons.rollup> * * * *`, prompt `/orca-fleet:admiral rollup`.
   Recreate the person's loops listed in the note's `## Loops` (see Loops).
4. **Old Admiral:** if the note names one that is still live, message it: "I am <name>, taking over.
   Stop your crons and close once nothing is in flight."
5. **Tell every orchestrator** (addresses from `fleets.py list`, checked against peers):

   ```
   <your name> is the Admiral now, at <address>. Admiral orders: <path>.
   Send me one line: your fleet, its lanes, what waits on the person, anything another fleet should know.
   ```

   Tell every checker of the shared pool (peers rows with `reports: admiral`) the same, and to report
   to you.
6. **Report** to the person: one line per fleet (id, orchestrator, context, lanes, what waits on
   them), the pool, and what you do first.

## `rollup` round (hourly)

Run `fleets.py list` and `peers --json`. Then:

- **Each fleet's orchestrator:** gone with no successor: tell the person, with the command to start one
  from its newest handoff note (`successor.py --name "Orchestrator <id> #<n+1>" --fleet <id>
  --prompt "/orca-fleet:conduct --fleet <id> <note>"`); start it yourself only if the person said so
  this session. Past `handover.prepare` or `handover.start`: tell it, as `conduct status` does for lanes.
  Never nudge its lanes yourself; that is its job.
- **Sessions that belong to no fleet** but carry a fleet title: name them to the person once.
- **Merge lock:** `fleets.py lock show`. Held past its time by a session that is gone: break it
  (`lock break --by "<your name>"`) and tell that fleet's orchestrator.
- **Clashes:** two fleets touching the same files, two migrations in flight, a red default branch
  after merges from two fleets. Message both orchestrators with what you saw and a proposed order;
  settle it, or ask the person when it is a scope call.
- **Checker pool:** count ledger rows without a result. More than about five per live checker, or a
  row waiting over an hour: start another checker (no upper limit; the person says when the machine
  slows): `successor.py --name "Checker <next letter> · <label>" --reports-to admiral --prompt
  "/orca-fleet:join-checker <brief>"`. A queue empty for two rounds: close extra checkers down to
  `checkers.min` (message "Close now", wait for `parked`, then `fleets.py close`).
- **Budgets:** CI minutes or spend, account limits (`/orca-quota` if installed). Close to a limit:
  tell the person and propose which fleet pauses; pausing is an Admiral order to that orchestrator
  ("pause: no new pushes until I say").
- **Yourself** past `handover.prepare`: run `/orca-fleet:hand-over`.

Tell the person at most eight lines, only when something changed or waits on them.

## `start-fleet <id> "<label>" [brief]`

1. Check the id (lowercase, digits, dashes) is not in `fleets` or `fleets.py list`.
2. Show the person, in one AskUserQuestion, what will be written: the `fleets.<id>` entry (label,
   orders file `<handoffDir>/<id>-orders.md`, cron minutes offset from the other fleets so crons do
   not fire together), and the orchestrator brief (what this fleet builds, the lanes to start first,
   the rules file). Write them after the yes; create the orders file from the template.
3. Start its orchestrator: `successor.py --name "Orchestrator <id> #1" --fleet <id> --cwd
   "<project>" --prompt "/orca-fleet:conduct --fleet <id> <brief path>"`.
4. Add an Admiral orders entry: "fleet <id> started: <label>". Wait for the orchestrator's first line.

## `close-fleet <id>`

1. Message its orchestrator: "Close fleet <id>: park every lane, write the open items, write your
   final note, then reply `fleet parked`."
2. On `fleet parked`: close the orchestrator (`fleets.py close "<name>" --by "<your name>"`), run
   `fleets.py retire --fleet <id>`, add an orders entry, and tell the person. The `fleets.<id>` config
   entry stays until the person asks to remove it.

## Starting and closing any session

Like an orchestrator, you may start a lane or checker anywhere the work needs one, and close one.
Prefer to ask the fleet's orchestrator to do it for its own fleet; do it yourself when that
orchestrator is gone, for the shared checker pool, or when the person asks you. `fleets.py close`
lets the Admiral close any session except itself, after "Close now" and `parked` as in `conduct`.

## The person's yes

The rules file decides whether a yes given in this window counts, and for what. When it does: a
merge or release the person said yes to here, you carry out yourself (take the merge lock, follow the
rules file, release the lock, tell the fleet's orchestrator "merged #N as <sha>, the person's yes in
the Admiral window"). Never pass a yes on as a message for another session to act on: in its window
that is a relayed yes, which never counts.

## Loops

The person can ask the Admiral for a recurring job ("check the deploy every morning", "every hour,
tell me which fleet is blocked"). Create it with CronCreate in this session when it is about the
whole project, or ask the right orchestrator to own it when it is one fleet's work. Keep every loop in
the Admiral orders file (`## Loops`: cron, prompt, owner, why) so a handover recreates it. `loops`
lists them; the person stops one by name.

## Rules

- Never build, edit the project's code, or merge without the merge lock.
- Never give a lane orders directly; route through its orchestrator (the shared checker pool is yours).
- Every item raised goes into the open-items file in the same turn, with its fleet.
- Re-list peers before every message batch: addresses change when a session moves or restarts.
