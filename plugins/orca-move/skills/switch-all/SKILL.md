---
name: switch-all
description: Moves every live Claude Code session of this account to a twin account, for example when the whole account nears its limit. Each session is asked to run `/orca-move:switch` itself, a few at a time, so each one saves its own crons and tells its own peers; this session moves last. Use whenever the user says "switch all", "move every session", "move all sessions to <account>", "the account is at the limit, move everyone".
argument-hint: "[account]"
---

# Switch every session of this account

1. **Plan:** run `python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/switch/scripts/move.py" plan $ARGUMENTS`
   for the target (the account named, or the twin with most room). Stop if it refuses.
2. **List:** run `/orca-peers:peers` (or the `peers` skill) and keep the live sessions of this
   account, except this one. Show the list with the target and ask the person once: "Move these
   N sessions and this one to <target>?" Move nothing without a yes.
3. **Ask each one**, at most three at a time, with SendMessage:

   ```
   Please run /orca-move:switch <target> now: <account> is near its limit (asked by <this title>).
   ```

   Wait for each batch to answer or go quiet (SendMessage with `notify_when_idle`), check with
   peers that their old pids are gone and they are back under the target account, then send the
   next batch. A session that refuses, or is still running after five minutes, is listed for the
   person, not forced.
4. **Reopen offers:** a session manager app that offers to reopen sessions which closed
   together may now offer the ones that just moved. Tell the person to dismiss it, or two copies
   could be opened.
5. **Last, this session:** follow the `switch` skill for itself.

Report the sessions that moved, the ones that did not and why, before this session's own move.
