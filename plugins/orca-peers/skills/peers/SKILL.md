---
name: peers
description: Lists every live Claude Code session on this machine, in every account (each config dir, twins included), with its project, title, state and the `uds:` address to message it. Use it whenever you need to message, check on or coordinate with another session, especially one in a different account, since ListAgents only shows the current account. Triggers on "peers", "which sessions are running", "list the sessions", "what is <session name> doing", "message the orchestrator", "send this to lane 2", "find the address of", "who is still running", or before any SendMessage to a session you have not listed yet in this turn.
allowed-tools:
  - Bash
---

# Peers

ListAgents shows only the sessions of the account this one runs in, yet SendMessage to a
`uds:<socket>` address reaches a session in any account. This skill lists them all.

The script: `${CLAUDE_PLUGIN_ROOT}/skills/peers/scripts/peers.py`

## Run it

```bash
python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/peers/scripts/peers.py" [filter words]
```

- Filter words narrow the list (all must match the title, project or account), e.g. `lane 2b`.
- `--json` prints the rows as JSON (account, project, cwd, title, state, address, sessionId, pid, self, context) for scripts and other skills. `context` is `{used, window, percent, flag}` or null before a session's first reply.
- It reads only. It never writes to a Claude Code config dir.

Show the result to the user as a short list. Mark which row is this session (the script adds
"(this session)"), and never message that row.

## Messaging from the list

Call SendMessage with `to` set to the address exactly as printed (`uds:/tmp/cc-socks/<pid>.sock`).

- **Re-list before you send if the list is more than a few minutes old.** An address belongs to a
  process. When a session moves to another account, restarts or resumes, it gets a new pid and a
  new address, and the old one is dead.
- A session in a different permission mode may hold your message for its user's approval, so a
  successful send is delivery, not agreement. Do not treat silence as a yes.
- When you give another session your own address, take it from this list ("this session") at
  that moment, for the same reason.

## States

`busy` working, `waiting` blocked on its user (a question or a permission prompt), `idle`
finished its turn, `shell` turn finished while a background shell still runs. A session that is
waiting on its user will not read your message until the user answers it.

## Context use

The percent column is how full each session's context window was at its last reply. At 70% the
row adds `PREPARE HANDOVER`, at 85% `HAND OVER`. When you report the list, name the sessions with
a flag first: a flagged session should write its handover note soon. `·` means no reply yet. The
window is 1M when the account's model ends in `[1m]` or the session already passed 200k, else
200k; `context_window:` in the config overrides it.

## When the list looks wrong

- **An account is missing:** the script finds `~/.claude` and every `~/.claude-<name>` that has a
  `sessions/` folder. For other locations, or to name the accounts, set `accounts_file` in
  `~/.config/orca-strator/config.yaml` (see the README).
- **A title says "untitled" or a folder name:** the session has no name and no title yet. Its
  project and address are still right.
- **"No live Claude Code session found"** while sessions are open: the record format may have
  changed in a new Claude Code version. Say so, and fall back to ListAgents for this account.
