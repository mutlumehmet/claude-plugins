---
name: switch-all
description: Moves every live Claude Code session of this account to a twin account, for example when the whole account nears or hits its limit. It checks the target seat first (preflight: logins, MCP servers, trust, Chrome), shows what `move.py move-all` would do and hands the person one `!` line that ends each session and reopens it in a new Terminal window in seconds, even sessions already out of quota, with waiting sessions asking their question again; asking each session to run `/orca-move:switch` itself stays as the fallback. Use whenever the user says "switch all", "move every session", "move all sessions to <account>", "the account is at the limit, move everyone", or sessions are stuck at a usage limit.
argument-hint: "[account]"
---

# Switch every session of this account

The fast way is `move-all`: it ends each session's process from outside and opens a new Terminal
window that resumes it on the target, so a session does not need a model turn to leave. That is
what makes it work for sessions that are already out of quota, which cannot run
`/orca-move:switch` themselves. It ends other sessions' processes, so the person runs it, not this
session.

Script: `python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/switch/scripts/move.py"`

The order matters: a seat that is not ready makes every session arrive without its tools, and a
move cannot be undone cheaply. So: preflight, dry run, one `!` line, verify, then this session.

1. **Plan:** run `move.py plan $ARGUMENTS` for the target (the account named, or the twin with most
   room). Stop if it refuses.
2. **Preflight:** run `move.py preflight <target> --fix`. It copies the plain settings the target
   lacks from this seat (user MCP servers, project trust, Chrome; never login tokens) and lists
   what only the person can do, most often "sign in once on <target>: miro, notion, ..." with the
   line that opens a setup window (`CLAUDE_CONFIG_DIR=<dir> command claude`; `command` skips a
   shell function named `claude` that could pick another seat). Show the list, wait until the
   person says it is done, and run preflight again until it says clean. `move-all` refuses
   otherwise; `--skip-preflight` overrides, only when the person asks.
3. **Dry run:** run `move.py move-all <target> --dry-run --wait 0` and show its lines. What it does
   with each session:
   - idle, or waiting at the usage limit: moved;
   - waiting on a question: moved, and its move note says to ask the same question again on
     arrival, so it comes back waiting;
   - busy: given `--wait` seconds (default 60) to settle, then skipped;
   - running a background command (status `shell`): moved only when the account is at its limit,
     because moving ends that command;
   - waiting on a permission prompt: not ended without `--force`.

   Add `--assume-limited` when the account is out of quota but orca-quota has no fresh reading.
4. **Hand over one line:** give the person the command without `--dry-run`, with `!` in front so
   it runs in this session's shell, for example:

   ```
   ! python3 -I "<the resolved CLAUDE_PLUGIN_ROOT>/skills/switch/scripts/move.py" move-all <target>
   ```

   Write out the real path, since `${CLAUDE_PLUGIN_ROOT}` is not set in the person's shell.
5. **Verify:** read the output (one line per session, then "running on <target>" or "NOT SEEN"
   for each window it opened). Run `/orca-peers:peers`: every moved session should be on the
   target, and the ones that were waiting should show waiting again once they re-asked. List the
   skipped and unseen ones for the person with what would fix them (wait and rerun, `--force`,
   paste the line it printed, or the fallback below).
6. **This session last:** `move-all` armed its move. It exits when this turn ends, but only once
   no message starts a new turn first. If peers keep messaging it, tell the person: "type /exit
   when messages pause". 45 seconds after the exit a new window reopens it on the target.
7. **Reopen offers:** a session manager app that offers to reopen sessions which closed together
   may now offer the ones that just moved. Tell the person to dismiss it, or two copies could be
   opened. Such an app may read its account list only at start: if the target seat is new to it,
   restart it (the config's `after_new_seat` command can do this during preflight).

## Fallback: ask each session

When `move-all` cannot help (not macOS Terminal.app, or a session should save its
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
