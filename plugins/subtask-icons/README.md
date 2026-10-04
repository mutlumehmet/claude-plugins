# subtask-icons

A Claude Code mod that draws a small `⑂` icon for each item under Claude's last answer. A press puts
`/subtask <the item's text>` in the prompt box and sends nothing, so you can add your own words and
press Enter. Part of [claude-plugins](../../README.md).

## What it does

- **Icons**: one per numbered item or top level bullet of the last answer (at most 12; code blocks
  are skipped).
- **Several items into one subtask**: if the prompt box already holds a `/subtask`, a press adds the
  item on a new line.
- **`/st`**: opens a picker with every item's full first line; click one or press its number, Esc
  closes it.
- **`/st 3`**: puts item 3 in the prompt box directly.

Nothing is drawn in the VS Code chat panel; use `/st` there.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install subtask-icons@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

## Known gaps

- Plain fact bullets get icons too; the 12 item cap keeps it short.
- After editing the mod while a session is open, restart the session: a hot reload has dropped the
  `/st` command once.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
