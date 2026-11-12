---
name: switch-all
description: Moves every live Claude Code session of this account to a twin account, for example when the whole account nears or hits its limit. It shows what `move.py move-all` would do and hands the person one `!` line that ends each session and resumes it in its own Terminal tab in seconds, even sessions already out of quota; asking each session to run `/orca-move:switch` itself stays as the fallback. Use whenever the user says "switch all", "move every session", "move all sessions to <account>", "the account is at the limit, move everyone", or sessions are stuck at a usage limit.
argument-hint: "[account]"
---

# Switch every session of this account

The fast way is `move-all`: it ends each session's process from outside and types its resume line
into the session's own Terminal tab, so a session does not need a model turn to leave. That is what
makes it work for sessions that are already out of quota, which cannot run `/orca-move:switch`
themselves. It ends other sessions' processes, so the person runs it, not this session.

1. **Plan:** run `python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/switch/scripts/move.py" plan $ARGUMENTS`
   for the target (the account named, or the twin with most room). Stop if it refuses.
2. **Dry run:** run
   `python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/switch/scripts/move.py" move-all <target> --dry-run --wait 0`
   and show its lines. What it does with each session:
   - idle, or waiting at the usage limit: moved;
   - busy: given `--wait` seconds (default 60) to settle, then skipped;
   - running a background command (status `shell`): moved only when the account is at its limit,
     because moving ends that command;
   - waiting on a permission prompt: never ended without `--force`, since the answer would be lost.

   Add `--assume-limited` when the account is out of quota but orca-quota has no fresh reading.
3. **Hand over one line:** give the person the command without `--dry-run`, with `!` in front so
   it runs in this session's shell, for example:

   ```
   ! python3 -I "<the resolved CLAUDE_PLUGIN_ROOT>/skills/switch/scripts/move.py" move-all <target>
   ```

   Write out the real path, since `${CLAUDE_PLUGIN_ROOT}` is not set in the person's shell. This
   session moves last, by itself, once its turn ends.
4. **After:** read the output (one line per session: moved, or skipped and why). Each moved session
   runs `/orca-move:after-move` when it resumes, which rebuilds its crons and tells its reporting
   line its new address. List the skipped ones for the person with what would move them (wait and
   rerun, `--force`, or the fallback below).
5. **Reopen offers:** a session manager app that offers to reopen sessions which closed together
   may now offer the ones that just moved. Tell the person to dismiss it, or two copies could be
   opened.

## Fallback: ask each session

When `move-all` cannot help (the sessions do not run in Terminal.app, or a session should save its
own crons and background work in a full move note), ask them instead:

1. Run `/orca-peers:peers` (or the `peers` skill) and keep the live sessions of this account,
   except this one. Ask the person once: "Move these N sessions and this one to <target>?" Move
   nothing without a yes.
2. With SendMessage, at most three at a time:

   ```
   Please run /orca-move:switch <target> now: <account> is near its limit (asked by <this title>).
   ```

   Wait for each batch to answer or go quiet (SendMessage with `notify_when_idle`), check with
   peers that their old pids are gone and they are back under the target account, then send the
   next batch. A session that refuses, or is still running after five minutes, is listed for the
   person, not forced.
3. Last, this session: follow the `switch` skill for itself.

Report the sessions that moved, the ones that did not and why, before this session's own move.
