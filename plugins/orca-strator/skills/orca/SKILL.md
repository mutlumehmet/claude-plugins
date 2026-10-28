---
name: orca
description: The front door of Orca Strator. Checks the setup, changes the settings with buttons, and starts this session in the right role (orchestrator, lane, checker, or just this session), so nobody has to remember which orca command comes first. Also shows a status screen and every orca command. Use whenever the user types /orca, says "orca", "orca setup", "orca settings", "start the fleet", "set up orca strator", "which orca command", "orca status", "orca help", or seems unsure which Orca Strator command to run.
argument-hint: "[setup | status | help | move | peers | quota | handover]"
---

# Orca Strator: the front door

Orca Strator is four plugins (orca-peers, orca-quota, orca-move, orca-fleet) plus this bundle.
This skill is the one command a person needs: it checks, asks with buttons, and runs the right
part. Every choice goes through AskUserQuestion (buttons, the recommended option first); never
make the person type a command they would have to remember.

Script (reads only, except `--set`, which writes `~/.config/orca-strator/config.yaml`):
`python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/orca/scripts/check.py" [--json] [--set key=value]`

## By argument

- **none or `setup`**: the full flow below.
- **`status`**: run `/orca-peers:peers` (or its script with `--json`) and `/quota`'s readings, and
  show one short screen: each seat's 5h and 7d usage, each session with its seat, state and
  context %, and which sessions need a handover (flags at 70% and 85%). Then stop.
- **`help`**: print the command map below, grouped by what the person wants to do. Then stop.
- **`move`**, **`peers`**, **`quota`**, **`handover`**: run `/orca-move:switch`, `/orca-peers:peers`,
  `/quota`, `/orca-fleet:hand-over` respectively, passing any further words on.

## Setup flow

1. **Check.** Run the script with `--json`. Say in a few lines what is ready and what is not:
   plugins in this account, accounts and twins, auto move and the warning level, a fleet config in
   this project, the terminal.
2. **Fix what is missing, with buttons:**
   - Plugins missing in this account: tell them to install the `orca-strator` plugin from the marketplace this one came from (`/plugin install orca-strator@<marketplace>`)
     (the bundle installs every part), and that other accounts need it too. Never install for them.
   - No accounts file: offer to point at an existing one if `~/.claude/accounts.json` exists
     (`--set accounts_file=~/.claude/accounts.json`); otherwise explain that accounts are named after
     their config folders and twins are found by a shared `projects/` folder, which also works.
   - No fleet config in this project and they want a fleet: hand over to `/orca-fleet:conduct`,
     which asks for it once.
3. **Settings, one AskUserQuestion round** (skip any they did not want to change):
   - Auto move: "Move this session to the seat with room by itself at the warning level" (on) or
     "Only warn" (off). Write with `--set auto_move=true|false`. It applies to every account;
     `/quota auto on|off` in one account overrides it there.
   - Warning level: 80, 85, 90 (default) or 95. Write with `--set warn_percent=N`.
   Say that sessions already open pick the new settings up when they restart.
4. **Role, one AskUserQuestion:** what should this session be?
   - **Orchestrator** (runs the fleet): run `/orca-fleet:conduct`, passing a handoff note if they name
     one or one is obvious in the project's handoff folder.
   - **Lane** (builds one stream of work): suggest a name like "Lane 1" if the session has none, then
     `/orca-fleet:join-lane`.
   - **Checker** (verifies merged changes): `/orca-fleet:join-checker`.
   - **Just this session** (no fleet): nothing more; say what now works by itself (the band, the
     warning, auto move if on, `/peers`).
5. Finish with one short line of what happens automatically from here, and `/orca help` for the
   command map.

## Command map (for `help`)

| I want to | Command |
|---|---|
| Set up or change settings | `/orca` |
| See every seat, session and context level | `/orca status` |
| List sessions and their message addresses | `/orca-peers:peers` |
| See every seat's usage in detail | `/quota` |
| Turn auto move on or off for this account | `/quota auto on`, `/quota auto off` |
| Move this session to another seat now | `/orca-move:switch [seat]` |
| Cancel a move I started | `/orca-move:switch cancel` |
| Move every session of this seat | `/orca-move:switch-all [seat]` |
| Run the fleet as orchestrator | `/orca-fleet:conduct [handoff note]` |
| Join as a lane or a checker | `/orca-fleet:join-lane`, `/orca-fleet:join-checker` |
| Hand over to a fresh session | `/orca-fleet:hand-over` (note), `/orca-fleet:hand-over start` |

## Rules

- Never start crons, message other sessions or move a session without the person choosing it here.
- Never read or copy login tokens.
