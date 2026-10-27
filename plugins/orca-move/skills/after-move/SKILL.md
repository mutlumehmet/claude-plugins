---
name: after-move
description: Finishes a move to another account after `/orca-move:switch` resumed this session there. It reads the move note, recreates the session's crons and background work, and sends its new message address to every session on the note's list. Use right after a session was resumed by orca-move (the resume line runs it), or when the user says "after move", "finish the move", "re-announce my address", "we moved accounts, restore the crons".
---

# After a move

This session was just resumed in another account by `orca-move`. Its old process, crons and
background jobs ended; its message address changed.

1. Read `~/.config/orca-strator/moves/${CLAUDE_SESSION_ID}.md`. If there is no note, say this
   session has no pending move and stop.
2. **Crons:** recreate each one under `## Crons` with CronCreate, same schedule, same
   recurring flag, same prompt.
3. **Background work:** start again each command under `## Background work`, in the background,
   the same way it ran before. Skip anything the note marks as finished.
4. **New address:** find this session's own address: the `messagingSocketPath` in
   `$CLAUDE_CONFIG_DIR/sessions/<pid>.json` (or `~/.claude/sessions/` when the variable is
   unset) whose `sessionId` is `${CLAUDE_SESSION_ID}`, written as `uds:<path>`. `/orca-peers:peers`
   shows it too, marked "(this session)".
5. **Tell:** send each session under `## Tell after the move`, after checking its current address
   with peers (it may have moved too):

   ```
   <this session's title> moved to <account>. New address: uds:/tmp/cc-socks/<pid>.sock
   ```
6. Rename the note to `<session id>.done.md` (keep it as the record), delete
   `~/.config/orca-strator/moves/<first 8 of the id>.sh`, `.json` and `.exit` if present.
7. Report in two or three lines: the account it now runs in, what was restored, who was told,
   and what it is still waiting on (from `## Waiting on`). Then carry on with that work.
