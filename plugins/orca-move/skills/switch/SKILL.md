---
name: switch
description: Moves this live Claude Code session to a twin account (another login of the same person whose config dir shares the same projects), for example when this account nears its usage limit. It tells the sessions this one works with, saves its scheduled jobs in a move note, exits, and resumes the same conversation in the twin account in the same terminal tab. Use whenever the user says "switch", "switch to <account>", "move this session to <account>", "we are near the limit, move", "continue in workb", or a session it works with asks it to move.
argument-hint: "[account] | cancel"
---

# Switch this session to a twin account

The conversation continues in the twin account: twins share their `projects/` folder, so
`claude --resume <id>` there opens this same transcript. What does not survive an exit is
everything in the process: scheduled crons, background jobs and watches, and this session's
message address (`uds:/tmp/cc-socks/<pid>.sock`, it changes with the new process). This skill
saves the first, tells people about the last, and `/orca-move:after-move` restores them.

Script: `python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/switch/scripts/move.py"`

## 1. Plan

If the argument is `cancel`, skip to **Cancel** below. Otherwise run `move.py plan $ARGUMENTS`. It names the target (the account named, or the twin with most
quota left by orca-accounts' readings), the terminal tab, and the resume line. If it refuses
(no twin, another family, not in a known account), say why in one line and stop.

Moving between twins is the only kind of move: another family has its own transcripts, and a
session never runs in two places at once.

## 2. Tell the sessions this one works with

From this conversation, list the sessions this one coordinates with: the orchestrator it reports
to, the lanes or checkers that report to it, anyone it promised an answer. Get their current
addresses from `/orca-peers:peers` (or the `peers` skill) if it is installed; otherwise use the
addresses already in this conversation. Send each one, with SendMessage:

```
<this session's title> is moving to <target> now (account limit). Hold messages for about a
minute; my new address follows from the new session.
```

If background subagents of this session are still running, tell them to finish the current
step and report; do not wait longer than they need for that.

## 3. Write the move note

Write `~/.config/orca-strator/moves/${CLAUDE_SESSION_ID}.md` with exactly these sections, so
`after-move` can rebuild the session:

```markdown
# Move note: <title>, <from> -> <target>, <date and time>

## Crons
<one line per cron from CronList: the schedule, recurring or once, and the full prompt>

## Background work
<each background command or watch still useful after the move: what it was and the exact command
to start it again; finished or obsolete ones are left out>

## Tell after the move
<each session from step 2: its title and the address used>

## Waiting on
<what this session was waiting for (a CI run, a reply, a merge, a person's answer) and what to do
when it comes>
```

Then delete every cron with CronDelete. They would fire into a session that is about to exit.

## 4. Go

Run `move.py go <target>` (the target from step 1). It writes the resume script, asks the
orca-move mod to run `/exit` once this turn ends, and starts a helper that resumes the session
in the same Terminal tab after the old process has ended.

End the turn with one short message: the move, and the fallback line it printed, for example:

```
Moving to workb. If the tab does not reopen the session within a minute, run /exit and paste:
sh ~/.config/orca-strator/moves/1a2b3c4d.sh
```

Do not run anything after `go`: the exit waits for this turn to end, and only happens while the
prompt box is empty. If the person typed a draft, the mod says so and the move waits; their own
`/exit` also completes it.

## Cancel

`/orca-move:switch cancel` withdraws a pending move (for example when the orchestrator says hold
after `go` ran): run `move.py cancel`. It stops the helper, removes the exit request and the
resume script, and keeps the move note as `<id>.cancelled.md`. Then recreate any crons the note
lists (step 3 deleted them) and tell everyone you told in step 2: "<title> is not moving; my
address is unchanged."

## Rules

- Never read, copy or move login tokens. Each account must already be logged in.
- Never type into another session's prompt. Other sessions move by running this skill themselves
  (that is what `switch-all` asks them to do).
- Outside macOS Terminal.app the helper cannot type the line; it copies it to the clipboard and
  shows a notification instead. Say so in the last message when `plan` reported it.
