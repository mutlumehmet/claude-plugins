# answer-buttons

A Claude Code mod that draws three small buttons under Claude's last answer. Part of
[claude-plugins](../../README.md).

## What it does

| Button | What it sends |
|---|---|
| `✎ Plain English` | Asks for the answer again in plain words: what the thing is, one labelled analogy and where it stops being true, where it is, and what breaks if it is wrong |
| `✂ Shorter` | Asks for the same answer cut to its point in 2 or 3 sentences, keeping any yes/no question and any copyable draft word for word |
| `✎✂ Plain & short` | Plain words, held to 2 or 3 sentences |

The buttons show only under the last answer, never while Claude is working. From the keyboard:
`/answer-buttons:shorter` and `/answer-buttons:plain-short`.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `plain_skill` | empty | A skill the two Plain buttons run instead of the built in prompt, such as `my-plugin:plain-english` |

## What it reads and does

- **Reads**: whether Claude is answering and which answer is the latest, to draw the buttons under it.
- **Does**: on a press, sends a fixed prompt as your message (Plain English, Shorter, Plain & short), or runs the skill named in `plain_skill`.
- **Hooks**: `turn.start` and `turn.complete` only track whether a turn is running. `ui.render` on the answer adds the button row under the last answer and leaves the answer itself unchanged.
- **Commands it runs**: only when you press a Plain button and the `plain_skill` setting names a skill, it runs that one skill (`/<plain_skill>` with the fixed argument "re-explain the last answer" or "re-explain the last answer in 2 or 3 sentences"). With `plain_skill` empty it runs no command at all. It never runs a command on its own, only on your press.
- **What goes into the prompts it submits**: one of three fixed sentences written in this mod's code (ask Claude to re-explain the last answer in plain English, to say it shorter, or both), sent as your own message in the same session. It reads the conversation only to find which answer is the latest, and copies none of its text into the prompt.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).
- **Never**: sends anything anywhere (no network calls, no telemetry).

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install answer-buttons@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.
Settings are asked for at install, or later with `/plugin configure answer-buttons@mehmetmutlu`.

## Known gaps

- Nothing is drawn in the VS Code chat panel; use the commands there.
- A reply that ends with a hidden block may get no buttons.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
