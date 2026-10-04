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
