# orca-fleet

Part of **Orca Strator**, a set of small plugins for running many Claude Code sessions at once. Each one installs on its own.

`orca-fleet` was called `orca-strator` until 0.1.x (renamed 27 October 2026, so the name says what it does). Installed `orca-strator` updates to an empty plugin that installs this one.

Runs a **fleet** of Claude Code sessions on one project: an orchestrator that keeps the plan, the crons and the merge queue; lanes that each build one stream of work; checkers that verify each merged change once on staging. When a session's context fills, it hands over to a fresh session that reads one note and carries on. The plugin holds the roles and templates only; your project keeps its own facts and rules in one config file.

![orca-fleet: conduct runs the fleet and its crons, lanes and checkers report to it, and a session near full context hands over to a fresh one](../../docs/images/orca-fleet-flow.png)

| Skill | What it does |
|---|---|
| [`conduct`](skills/conduct) | Makes this session the orchestrator: takes over from a handoff note, keeps a status cron and a nudge cron, tells the fleet to report to it |
| [`join-lane`](skills/join-lane) | Makes this session a lane: one stream of work, `ready to merge #N, head <sha>, SAFE` when a PR is done |
| [`join-checker`](skills/join-checker) | Makes this session a checker: works through the preview ledger, one staging check per merged change |
| [`hand-over`](skills/hand-over) | Writes the handoff note at about 70% context and, with `start`, opens a fresh successor at about 85% |

## How a fleet runs

1. Open one session for the orchestrator and run `/orca-fleet:conduct` (or `/orca-fleet:conduct <handoff note>` to take over).
2. Open a session per lane, named `Lane 1`, `Lane 2` and so on, and run `/orca-fleet:join-lane`. Checkers run `/orca-fleet:join-checker`. Each reports to the orchestrator by itself.
3. The orchestrator's status cron reads every session's context use and nudges the ones that should write a handoff note or hand over; its nudge cron wakes lanes that went idle with work left.
4. A session that hands over writes its note, opens `<name> #2` in a new Terminal tab with the note as its first prompt, and closes once the successor says "took over".

Sessions talk with SendMessage. [`orca-peers`](../orca-peers) finds their addresses in every account and reads their context use, so install it too. [`orca-move`](../orca-move) moves sessions to a twin account when one nears its limit, and [`watch-ci`](../dev-workflow/skills/watch-ci) watches merges, when installed.

## Project config

`.claude/orca-strator.json` in the project. `conduct` asks for it once if it is missing. An example is in [`templates/orca-strator.example.json`](templates/orca-strator.example.json).

| Key | What it is for | Required | Default |
|---|---|---|---|
| `fleet` | Title prefixes of this fleet's sessions, e.g. `["Lane", "Checker"]` | No, but without it and without a handoff note `conduct` asks before messaging anyone | none |
| `rules` | The file that says who may merge what and what always needs a person; every role follows it | Yes | |
| `repo`, `ci.gateJob`, `ci.gatedStatus` | The repository and CI names, for watching merges | No | |
| `files.orders`, `files.ledger`, `files.openItems` | The orders file, the preview ledger and the open-items list; created from the templates when missing | Yes | |
| `files.handoffDir` | Where handoff notes go | Yes | |
| `crons.status`, `crons.nudge` | The minutes past the hour for the two crons | No | `13,43` and `4,19,34,49` |
| `handover.prepare`, `handover.start` | Context percent for writing the note and for starting the successor | No | `70` and `85` |
| `checkers.testAccounts` | Where checkers sign in, and with what | No | |

## Templates

Handoff notes for each role ([orchestrator](templates/handoff-orchestrator.md), [lane](templates/handoff-lane.md), [checker](templates/handoff-checker.md)), the [orders file](templates/orders.md), the [preview ledger](templates/preview-ledger.md) and the [open-items list](templates/open-items.md).

## What it reads and does

- **Reads**: the project config and the files it names, the handoff notes, and live sessions through orca-peers.
- **Writes**: the orders file, ledger, open-items list and handoff notes in your project; scheduled crons in the orchestrator's session (session only).
- **Opens**: a new Terminal window for a successor, only during `hand-over start`. Elsewhere it copies the command for you to paste.
- **Never**: decides merge rights by itself (they come from your rules file), forks a session, or closes a window for you.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).

## Install

Needs Claude Code 2.1.310 or later. The successor window needs macOS Terminal.app.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install orca-fleet@mehmetmutlu
/plugin install orca-peers@mehmetmutlu
```

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev). If it saves you time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).
