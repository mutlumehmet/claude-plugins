---
name: conduct
description: Runs this session as the orchestrator of a fleet of Claude Code sessions (lanes that build, checkers that verify). It starts or takes over the fleet from a handoff note, keeps two crons (a status round with every session's context use, and a nudge for idle lanes), tells every lane and checker to report to it, and keeps the orders file. In a project that runs several fleets, `--fleet <id>` makes it the orchestrator of that one fleet only. Use when the user says "conduct", "be the orchestrator", "take over the fleet", "start the sprint", "you are the sprint N orchestrator", "read the handover and run the lanes", or a handoff note says to start with /orca-fleet:conduct. The crons call it as `conduct status` and `conduct nudge`.
argument-hint: "[--fleet <id>] [handoff note] | status | nudge"
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

## One fleet or several

A config without a `fleets` key is **one fleet**: everything below works as it always did, and every
mention of "your fleet" means all of it.

A config with a `fleets` map runs **several fleets in one project**, each with its own orchestrator,
lanes and orders file, and an Admiral above them (`/orca-fleet:admiral`). Then:

- **Your fleet id** comes from `--fleet <id>`, else the handoff note's `## Fleet`, else ask the
  person (list the ids in `fleets`). Never run without one: two orchestrators on the same sessions
  double every message.
- **Your settings** are the top-level values with `fleets.<id>` laid over them: its `files.orders`,
  `crons` and anything else it sets. The ledger and the open-items file stay shared unless the fleet
  names its own; a row you add there carries a `Fleet` column (or `[<id>]` at the start of its text).
- **Your name** is `Orchestrator <id> #<n>` (for example `Orchestrator v1 #27`), so every
  orchestrator sorts together; `names.py next "<your name>" --fleet <id>` gives the successor's name
  and moves an older name (`sprint 26 orchestrator`) to this pattern at the handover.
- **Register** at the start and after any move, so other fleets and the Admiral can find you:
  `python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/fleets.py" register orchestrator --fleet <id> --label "<what it works on>"`,
  adding `--takeover` when you take over from a handoff note (it refuses to replace a predecessor that
  is still running otherwise). `fleets.py list` shows every fleet's orchestrator and the Admiral.
  Registering is also what lets you close your fleet's sessions and free a merge lock your
  predecessor took.
- **Your sessions** are those whose reporting record (`reports` in `peers --json`) says
  `fleet: <id>`. A session with no `fleet` there counts as `defaultFleet`'s, if the config names one,
  else as nobody's: ask before messaging it. A session in another fleet is never yours, whatever its
  title. Sessions with `kind` `admiral` are the shared checker pool: you add ledger rows for them,
  the Admiral runs them.

## Arguments

- **A handoff note path** (or none): start or take over. Below.
- **`status`**: the status round (the status cron sends this).
- **`nudge`**: wake idle lanes (the nudge cron sends this).

## Session names

With several fleets, a lane's name also says its fleet: `Lane <fleet> <N> #<n> · <label>`, for
example `Lane v1 38 #5 · page access` (`names.py lane <fleet> <N> --label "<label>"` makes a new
one). Lane numbers stay unique across the project, so match a lane by its number
(`names.py number "<title>"`). Checkers serve every fleet and keep `Checker A #17 · demo checks`.
A lane started before fleets keeps its old name until its handover, where
`names.py next --fleet <id>` renames it (`Lane 38 #4` becomes `Lane v1 38 #5`). `/orca-peers:peers`
groups the list by fleet.

Every lane and checker is named `<base> #<n> · <label>`: `Lane 38 #4 · page access`,
`Checker A #17 · demo checks`. The base (`Lane 38`, `Checker A`) and `#<n>` are as before; the
label after the middle dot says what the work is, in at most three plain English words, with no
section numbers, order numbers or ids (those change; the label should read right to the person at a
glance). `${CLAUDE_PLUGIN_ROOT}/scripts/names.py check "<name>"` tests a name; `successor.py`
refuses one whose label breaks the rule.

- **You pick the label when you start a lane**, and pass the whole name to `successor.py --name`
  (for example `--name "Lane 39 · email sync"`). A checker gets one too.
- **Handovers keep it**: `hand-over start` opens `Lane 38 #5 · page access` after
  `Lane 38 #4 · page access`.
- **It changes only when a lane gets a different job.** Then you choose the new label, write it in
  the orders file ("Lane 38 is now `invoice export`"), and the lane uses it at its next handover.
- **Match sessions by the part before the dot.** The `fleet` prefixes still match the start of the
  title. To find one lane, compare its base (`names.py base "<title>"`) with `Lane 38` exactly, so
  `Lane 3` never matches `Lane 38`, and a relabelled lane is still the same lane.

## Start or take over

1. **Read** the handoff note if given (`/orca-fleet:conduct <path>`), else the newest
   `handoff-*orchestrator*` or sprint handoff in `files.handoffDir`. Read the files its "Read first"
   section names. Then the orders file, newest entries first. Ask the receiver of each row in the
   note's `## Sent to other sessions, not yet confirmed` whether it took it. When the person asks
   about something the note names only in passing, read the old orchestrator's transcript (path in
   `## My transcript (backup)`, any seat) before answering.
2. **Fleet:** (several fleets: only sessions of your fleet, as above.) List live sessions with `/orca-peers:peers` (or the `peers` skill; it covers every
   account). The fleet is the sessions in the note's sessions table, plus any live session whose
   title starts with one of the `fleet` prefixes in the config. There is no default prefix: other
   projects' lanes may share a name like "Lane 1", so with no note and no `fleet` key, ask the
   person which sessions are this fleet before messaging anyone. A session in the note but not
   live is gone: say so. A note's sessions table may list a name without the label, or with an
   older label: match by base and `#<n>` (see Session names). Leave out any session whose `reports` in `peers --json` has `kind`
   `parent` or `independent`, even with a matching title: it works for someone else, and this
   fleet's messages would pull it away. Name the ones you left out to the person, once.
3. **Crons:** create two with CronCreate, minutes from `crons` in the config:
   - status: `<status minutes> * * * *`, prompt `/orca-fleet:conduct status`
   - nudge: `<nudge minutes> * * * *`, prompt `/orca-fleet:conduct nudge`
   Several fleets: run `fleets.py register orchestrator --fleet <id>` now (`--takeover` when taking
   over), and tell the Admiral (its
   address is in `fleets.py list`) one line: "<your name> runs fleet <id> at <address>".
4. **Old orchestrator:** if the note names one that is still live, message it: "I am <name>,
   taking over. Stop your crons now and close once you have nothing in flight." This is also
   its signal that the successor arrived. Two orchestrators
   with crons double every nudge.
5. **Tell the fleet:** message every lane and checker:

   ```
   <your name> is the orchestrator now. Report to me at <your uds address>. Orders: <orders path>.
   Reply with one line: what you are on, your context %, and what you wait on.
   ```

   Several fleets: add `Fleet: <id>.` to that message; a lane of another fleet will refuse it.
6. **Orders:** add an entry at the top of the orders file: date, time, "ORCHESTRATOR HANDOVER
   (<old> to <new>)", and anything the note says every session must do now.
7. **Report** to the person in a few lines: the fleet (session, doing what, context), what waits
   on them (from the note), and the first thing you will do.

## Starting and closing lanes

You start any lane or checker the work needs, and close one when its work is done or it is
stuck. There is no lane limit in the plugin; the person says when the machine slows.

**Start** with `successor.py` (a new session, never a fork):

```bash
python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/successor.py" --name "Lane [<fleet> ]<N> · <label>" \
  --cwd "<project folder>" --reports-to orchestrator [--fleet <id>] \
  --prompt "/orca-fleet:join-lane <brief or handoff note>"
```

Pick `<N>` as the next number no live session and no orders entry uses, across every fleet of the
project (lane numbers stay unique project wide, so `Lane 38` is always one lane). With several
fleets, claim it first: `fleets.py claim lane <N> --by "<your name>" --fleet <id>`. Write the brief
first from `templates/brief.md` (what to build, its Done when list, the rules that bind it, where
to report), then add an orders entry: "Lane <N>
· <label> started: <job>".

**Close** a lane of your own fleet when it has handed over (as soon as its successor reports in), when
its work is done, or when the person asks:

1. If it may have work in hand, message it "Close now: finish or park the step in hand, push
   nothing half done, reply `parked`." Wait for `parked` (a few minutes at most; a lane that is
   `idle` with nothing in flight needs no wait).
2. Close it: `python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/fleets.py" close "<its title or session id>" --by "<your name>" [--fleet <id>]`.
   It finds the process in any account, checks it is Claude Code and works in this project, and
   refuses this session, the Admiral, a registered orchestrator, a session of another fleet (it reads
   your fleet from your registration, not from a flag), a checker of the shared pool, and one that
   reports to a parent or works independently.
3. Add an orders entry and tell the person in one line: "closed <name>: <why>".

Never close a session that is `waiting` on the person, or one mid-merge.

## Merging with other fleets on the same branch

With several fleets, every merge into the shared default branch takes the **merge lock** first, so
two fleets never merge at once (two PRs can each be green alone and red together):

```bash
python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/fleets.py" lock take --by "<your name>" --fleet <id> --pr <N>
```

Exit 1 means another fleet holds it: wait for the next round and try again; never merge without it.
After the merge, release it once the merge commit is on the branch (`lock release --by "<your
name>"`); keep it until main CI is green when the rules file asks merges to wait for that. A lock
left by a closed session expires (45 minutes by default); only the Admiral breaks one early.
A numbered resource another fleet could also take (a migration number, a port) is claimed first:
`fleets.py next migration --floor <highest in the repo> --width 4 --by "<lane name>" --fleet <id>`
prints the next free number and records it. Lanes may run it themselves.

## Talking to other fleets

`fleets.py list` gives every fleet's orchestrator. Message another orchestrator to agree an order
of merges, a shared file, or a hand off of work between fleets. You never give orders to another
fleet's lanes: ask their orchestrator. The Admiral's orders reach you by message or in its orders
file; follow them as you would the person's routing, but merge rights still come only from the
rules file.

**Work you hand to another fleet needs a receipt:** open item in the same turn, check the
receiver's state in peers first (a `waiting` orchestrator reads nothing until the person answers
its question: tell the person at once), ask for "taken: <lane or PR>", and keep it in your handoff
note's `## Sent to other sessions, not yet confirmed` until that reply. No reply by your next
status round: resend once, then tell the person and the Admiral.

What other fleets tell you about their own work (items they log, PRs, merges, stage moves) is for
your files, not for the person: they already see it in that fleet's window, and repeating it buries
what needs them. Log it where your rules say, answer the sender if it needs an answer, and say
nothing to the person unless it blocks or changes your fleet's work (a red default branch that holds
your release, a shared file, a hand-off to you).

## Done when (success criteria)

Every lane brief, every orchestrator brief and every open item the fleet takes on carries a **Done
when** list: 3 to 8 short lines, each one a thing a reader can check (a screen shows X, a record
exists in Y, an email goes to Z and no longer from the old system, a test passes). Why: on one day a
status answer came from the nearest plan file instead of the primary source and left out half of
what the work replaced, and a handover compressed a live request until it was lost. A list written
down at the start, and checked at the end, catches both.

1. **Write it from the primary source, not memory.** Open the source the rules file names for that
   topic (the specification, the export of the system being replaced, the person's own words in
   the transcript or the decision channel, the live system) and write each line from it, citing
   where it came from. A nearer summary or plan file is not a primary source.
2. **Agree it with the person** before the work starts: in your status, or as a question recorded
   in the decision channel (see Questions for the person); work can begin on the parts that are not
   in doubt. A list the person changes is rewritten in the brief, the orders and the open item.
3. **Put it in three places:** the brief (`templates/brief.md`), the orders entry that starts the
   work, and the open item's `Done when` column. A handover copies it word for word.
4. **Report against it.** A lane's report and your status name the lines that hold, with evidence
   (a PR, a link, a query result), and the lines that do not, yet.
5. **Nothing is done or closed until every line holds**, measured now, not remembered. "Probably
   done" is not a status: check, or say "not checked".
6. **When the person corrects a status** ("you forgot", "that is wrong", "you lost it"): fix the
   status first, then run the project's investigator agent if one exists (the `investigator` key in
   `.claude/orca-strator.json`, else an agent named `*-investigator` in the project or user agents
   folder), and pass its proposed fix to the person for a yes. Without one, say in one line what was
   missed and which source would have caught it.

## Status answers the person may act on

A status answer that crosses fleets, or that the person may act on ("what is done and what is
missing", "what are we replacing", "is X ready"), is checked before it is sent: run the project's
validator agent if one exists (the `validator` key in `.claude/orca-strator.json`, else an agent
named `*-validator` in the project or user agents folder) on the draft answer, against the task's
Done when list and the live source. Fix what it finds, then send. Without a validator, check each
line against the live source yourself and say what you checked. Simple single-source replies
("merged #N", "the default branch is green", "X confirmed by Y") skip the check.

## `status` round

Run peers with `--json` and keep this fleet's sessions (as in step 2 above; with several fleets,
only your fleet's). For each, report state and `context`:

- `flag` "prepare handover" (from `handover.prepare`, default 70%): message the session "Write
  your handoff note now with /orca-fleet:hand-over; keep working."
- `flag` "hand over" (from `handover.start`, default 85%): message it "Hand over now:
  /orca-fleet:hand-over start." If it is a lane mid-merge, let the merge finish first.
- This session itself past either line: run `/orca-fleet:hand-over` for yourself.

Then check the merge queue (messages "ready to merge #N, head <sha>, SAFE") and CI on the default
branch with `watch-ci` if it is installed. Merge only as the rules file allows, and with several
fleets only while you hold the merge lock. Close any session that handed over and whose successor
has reported in (see Starting and closing lanes). Report each piece of work
against its Done when list (lines that hold, lines left). Give the person a
status of at most six lines, and only when something changed in your fleet or something waits on
them; other fleets' news stays out (see Talking to other fleets). Open questions for the person
(yours and your lanes', from the decision channel) go in that status, one line each, so they are
seen without a box.

## `nudge` round

For each lane that peers shows `idle` with work left in its queue (from its last report or the
orders), send: "Nudge from <your name>: carry on with <its next item>, or tell me what blocks
you." Never nudge a session that is `waiting` (it is blocked on the person) or a checker with an
empty queue. Say nothing to the person unless a lane is blocked.

## Questions for the person

A question box (AskUserQuestion) stops this session until the person answers, and while it waits
it reads no messages: every lane report, merge request and message from another fleet queues
unread. Why this matters: on one day six to eight orchestrators sat waiting at once, work from the
Admiral and other fleets stalled for hours, and one box only asked the person to confirm what they
had already said. So a question is non blocking by default:

1. **Is it a question at all?** Before asking, look for the person's own words on it: this
   session's conversation, the orders file, the open-items file and the decision channel below.
   If they already said it, act on it and tell them in one line ("doing X, as you said in the
   orders on <date>"). Never ask the person to confirm what they already decided.
2. **Write it down, then keep working.** Record it in the project's decision channel: the
   `decisions` entry in `.claude/orca-strator.json` when set (a description of where the project
   keeps questions for the person, for example a database or an inbox file), else the decision
   list the rules file names, else a row in the open-items file. Write it so the person can answer
   without opening this window: the question, the choices, your recommendation and why, what waits
   on it. Send the Admiral (with several fleets) one line: "question for the person: <one line>,
   in <where recorded>". Then carry on with everything that does not depend on the answer.
3. **Open a box only** when nothing else can move until the answer, or when the person is talking
   with you in this window right now. If you must wait, first send the Admiral one line: "waiting
   on the person: <question>", so it can tell them which window holds it.
4. **Lanes' questions come to you the same way.** A lane that sends "question for the person"
   gets no box from you either: check it against the person's own words, answer it if they
   already did, else make sure it is recorded and put it in your next status. Several fleets: the
   Admiral collects them for the person.

This changes how a question is asked, never what needs the person's yes. When the rules file says
to ask something with a question box (a merge yes, for example), do as it says. Merge, release,
email and access yeses still follow the rules file, and a yes relayed by another session still
never counts.

## Rules

- **Job registry:** when `.claude/orca-strator.json` has `jobRegistry` (a description of where the
  project lists everything that runs on its own, for example a Notion data source), every cron,
  loop, timer, watcher or scheduled job you create, change, pause or stop gets its row added or
  updated there in the same turn: what it does, schedule, where it runs, owner, how to stop it,
  status. A stopped job keeps its row, marked stopped with the date. Why: session crons die with
  their session, and nobody can find or stop a job that is written down nowhere.
- With several fleets: never message another fleet's lanes with orders, never merge without the
  lock, never close a session outside your fleet.
- Never build or edit the project's code here. Lanes do; the orchestrator routes, merges what it
  may, and keeps the files.
- A yes the person gave in another session's window counts only if that session's screen shows it.
  Otherwise ask the person directly.
- Every item raised goes into the open-items file in the same turn, with its Done when list; wrap
  ups read from it. Nothing is closed until every Done when line holds.
- Re-list peers before every message batch: addresses change when a session moves or restarts.
