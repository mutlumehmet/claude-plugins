# orca-move

Part of **Orca Strator**, a set of small plugins for running many Claude Code sessions at once. Each one installs on its own.

When one Claude account nears its usage limit, this moves a live session (or all of them) to a **twin account**: a second login whose config directory shares the same `projects/` folder, so `claude --resume` there opens the very same conversation. Before the move the session tells the sessions it works with and saves its scheduled jobs; after it, it brings them back and sends its new message address.

![orca-move: tells the others and saves its crons, exits only with an empty prompt box, resumes in the twin account in the same tab, and announces its new address](../../docs/images/orca-move-flow.png)

| Skill | What it does |
|---|---|
| [`switch`](skills/switch) | Moves this session to a twin account |
| [`switch-all`](skills/switch-all) | Asks every session of this account to move, a few at a time, this one last |
| [`after-move`](skills/after-move) | Runs in the resumed session: restores crons and background work, announces the new address |

It also holds one small mod: the part of a move that has to happen inside Claude Code. When `switch` asks for it, the mod runs `/exit` through Claude Code itself once the session is idle, and only while the prompt box is empty. Nothing is ever typed into a Claude prompt.

## How a move works

1. `/orca-move:switch [account]` picks the target: the account you name, or the twin with the most quota left (from [`orca-accounts`](../orca-accounts) readings, when installed).
2. It messages the sessions it works with (the orchestrator, lanes, checkers) that it is moving.
3. It writes a move note, `~/.config/orca-strator/moves/<session id>.md`: its crons, background work worth restarting, who to tell afterwards and what it is waiting on. Then it deletes its crons.
4. It writes a resume script, `~/.config/orca-strator/moves/<first 8 of the id>.sh`, and starts a detached helper.
5. When the turn ends, the mod runs `/exit` (or tells you to clear a draft first; your own `/exit` works too).
6. Once the old process has ended, the helper types one short line at the shell prompt of the same Terminal tab: `sh ~/.config/orca-strator/moves/<id8>.sh`. It runs `claude --resume <id> '/orca-move:after-move'` under the twin's config dir.
7. `after-move` reads the note, recreates the crons and background work, and messages everyone on the list its new `uds:` address.

A session never runs in two places: the line is typed only after the old process is gone.

Changed your mind after `switch` ran? `/orca-move:switch cancel` stops the helper and withdraws the exit request; the session stays where it is.

## Setup

Twins must already exist and be logged in on their own; this never reads or copies login tokens. Optional: the same `~/.config/orca-strator/config.yaml` that [`orca-peers`](../orca-peers) and [`orca-accounts`](../orca-accounts) read, pointing at an accounts file that names your accounts and marks twins with `twinOf` (see the orca-accounts README). Without it, an account whose `projects/` is a link into another account's counts as that account's twin.

Install it in every account of the family (twins that share `plugins/` share it automatically), and install [`orca-peers`](../orca-peers) too, so a moving session can find the addresses of the sessions it tells.

## What it reads and does

- **Reads**: its own pid record and transcript start (for the session id, folder and terminal tab), the Orca Strator config and accounts file, and orca-accounts' quota readings.
- **Writes**: move notes, resume scripts, a small plan file and a log per move in `~/.config/orca-strator/moves/`. `after-move` keeps the note as `<id>.done.md` and removes the rest.
- **Types**: one line, `sh ~/.config/orca-strator/moves/<id8>.sh`, into the shell of the tab the session ran in, only after that session's process has ended. Never into a Claude prompt.
- **Mod hooks**: `session.start` (starts a two second check for a move request addressed to this session); it reads the prompt box only when such a request exists, and runs `/exit` only then.
- **Never**: reads login tokens, moves a session between unrelated accounts, or sends anything off the machine.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).

## Install

Needs Claude Code 2.1.310 or later, macOS, and Terminal.app for the automatic resume (other terminals get the line on the clipboard and a notification, to paste yourself).

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install orca-move@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

## Known gaps

- Terminal.app only for the automatic resume; iTerm, Ghostty and others paste the line.
- A shell function or alias named `claude` is bypassed on purpose: the resume script runs the `claude` on `PATH` with the twin's config dir.
- A session manager app that offers to reopen sessions which closed together may offer the sessions a `switch-all` just moved; dismiss that offer, or two copies could open.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev). If it saves you time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).
