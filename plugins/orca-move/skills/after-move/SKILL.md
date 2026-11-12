---
name: after-move
description: Finishes a move to another account after `/orca-move:switch` resumed this session there. It reads the move note, recreates the session's crons (from the project's orca-strator.json when the note could not list them) and background work, and sends its new message address to every session on the note's list. Use right after a session was resumed by orca-move (the resume line runs it), or when the user says "after move", "finish the move", "re-announce my address", "we moved accounts, restore the crons".
---

# After a move

This session was just resumed in another account by `orca-move`. Its old process, crons and
background jobs ended; its message address changed.

1. Read `~/.config/orca-strator/moves/${CLAUDE_SESSION_ID}.md`. If there is no note, say this
   session has no pending move and stop.
2. **Crons:** recreate each one under `## Crons` with CronCreate, same schedule, same
   recurring flag, same prompt. When the section says the crons are unknown (the note was written
   by `move-all`, which ends sessions from outside and cannot read their crons), rebuild them by
   role from the project's `.claude/orca-strator.json`, because that file is where every fleet's
   schedule is set:
   - an orchestrator (title `Orchestrator <fleet> #n`, or `Orchestrator #n` in a one-fleet project):
     the status and nudge crons of its fleet (`fleets.<id>.crons`, else the top-level `crons`),
     with the prompts `/orca-fleet:conduct status` and `/orca-fleet:conduct nudge` (add
     `--fleet <id>` when the project has a `fleets` map);
   - the Admiral (title `Admiral #n`): `admiral.crons.rollup` with `/orca-fleet:admiral rollup`;
   - anyone else (lanes, checkers, sessions outside a fleet): no crons.
   Without that file, or with a role it does not cover, recreate nothing and say so in the report.
3. **Background work:** start again each command under `## Background work`, in the background,
   the same way it ran before. Skip anything the note marks as finished.
4. **New address:** find this session's own address: the `messagingSocketPath` in
   `$CLAUDE_CONFIG_DIR/sessions/<pid>.json` (or `~/.claude/sessions/` when the variable is
   unset) whose `sessionId` is `${CLAUDE_SESSION_ID}`, written as `uds:<path>`. `/orca-peers:peers`
   shows it too, marked "(this session)".
5. **Tell:** send each session under `## Tell after the move`, and the session under
   `## Reports to` when the note has one (it has to know where its report line now lands), after
   checking its current address with peers (it may have moved too). If this session keeps a
   reporting record (orca-fleet's `reporting.py`), it does not need rewriting: it names the
   reporter, not this session's own address.

   ```
   <this session's title> moved to <account>. New address: uds:/tmp/cc-socks/<pid>.sock
   ```
6. Rename the note to `<session id>.done.md` (keep it as the record), delete
   `~/.config/orca-strator/moves/<first 8 of the id>.sh`, `.json` and `.exit` if present.
7. Report in two or three lines: the account it now runs in, what was restored, who was told,
   and what it is still waiting on (from `## Waiting on`). Then carry on with that work.
