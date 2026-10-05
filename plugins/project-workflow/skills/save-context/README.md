# save-context

Saves what a working session decided, changed and learned, so the next conversation starts with it
already in context. Part of [claude-plugins](../../../../README.md).

![save-context: harvests, saves, ready](../../../../docs/images/save-context-flow.png)

At the end of every session I used to ask the same question: "did you update everything? Status,
memory, whatever the next session needs?" The answer was usually "mostly". This skill turns that
question into a routine with a plan you approve before anything is written.

## What it does

1. **Finds what the project keeps.** Reads the project's `CLAUDE.md`, `STATUS.md`, the agent's
   memory files and any register or context folder the project names. The project's own rules
   (language per file, folders that must not be edited, check scripts) override the skill.
2. **Harvests the conversation.** Decisions, state changes, new facts, your corrections, open
   threads, promises, and traps that looked one way and were another. Drops what the code or git
   log already says, and what only mattered in this conversation.
3. **Routes each item to one place.** Current state to `STATUS.md`, how you like to work to memory,
   lasting rules to `CLAUDE.md` (rarely), register rows and tasks to the skills that own them.
4. **Shows you the plan once**, grouped by destination, including a "Nothing to save" group so you
   can pull something back in. Nothing is written before you approve.
5. **Writes, in the right order.** Other skills run first, so `STATUS.md` cites what actually
   happened. A handoff that did not go through is recorded as still pending, never as done.
6. **Commits only what it touched**, and never pushes.

If everything was already saved during the session, it says so and changes nothing.

## First run

There is no setup. The skill works with no config file. To change a default, copy
[`config.example.yaml`](config.example.yaml) to `~/.config/save-context/config.yaml`, or set
`SAVE_CONTEXT_CONFIG` to keep it somewhere else.

## Configuration

Every key is optional.

| Key | What it is for | Default |
|---|---|---|
| `commit` | Commit the touched files at the end. `false` leaves them uncommitted | `true` |
| `confirm` | Show the plan and wait for approval. `false` writes everything straight away and lists it in the final report, for when you say "save context" and leave | `true` |

## Optional integrations

| Key | Use it if | What happens |
|---|---|---|
| `tasks_skill` | You have a skill that records to-dos (Notion, Todoist, a tracker) | Dated promises like "send the roster by Friday" are handed to it. Empty: they go to `STATUS.md` under next steps |

Any other skill whose description says it writes to a destination (a findings register, a ticket
tracker) is used for that destination automatically, after you approve the plan.

## What it will never do

- Write anything before you approve the plan (unless you set `confirm: false`).
- Push to a remote.
- Stage with `git add -A`, or commit files that were already modified or untracked before it ran.
- Create a `CLAUDE.md` without asking.
- Rewrite lines the session did not change, even to fix their style.
- Claim something is recorded elsewhere when that handoff did not succeed.

## Requirements

An agent that reads skills folders (built for Claude Code), and `git` if you want the commit.
Memory handling follows Claude Code's per-project memory folder; in other environments the skill
uses whatever memory location the environment describes.

## Install

As a Claude Code plugin:

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install project-workflow@mehmetmutlu
```

Plugin skills are namespaced, so it runs as `/save-context:save-context`, or just say "wrap up" or
"did you update everything before I close?".

As a plain skill: copy or symlink this folder into your skills directory.

```bash
git clone https://github.com/mutlumehmet/claude-plugins.git
ln -s "$PWD/claude-plugins/plugins/project-workflow/skills/save-context" ~/.claude/skills/save-context
```

Then say "save context" at the end of a session.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev). If it saves you time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).
