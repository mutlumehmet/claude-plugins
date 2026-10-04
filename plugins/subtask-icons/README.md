# subtask-icons

A Claude Code mod that puts one small `⑂ Subtask` button under Claude's last answer. It opens a
picker of the answer's items; a pick puts `/subtask <the item's text>` in the prompt box and sends
nothing, so you can add your own words and press Enter. Part of [claude-plugins](../../README.md).

## What it does

- **One button**: a quiet `⑂ Subtask (N)` under Claude's last answer, where N is the number of items
  (numbered items and top level bullets, at most 12; code blocks are skipped).
- **The picker**: pressing it opens a small pane with every item's full first line. Click one or
  press its number; `/subtask <item>` goes into the prompt box and nothing is sent, so you can add
  your own words and press Enter. Esc closes it.
- **Several items into one subtask**: if the prompt box already holds a `/subtask`, the next pick
  is added on a new line.
- **From the keyboard**: `/st` opens the same picker; `/st 3` puts item 3 in the prompt box directly.

Nothing is drawn in the VS Code chat panel; use `/st` there.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install subtask-icons@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

## Known gaps

- Plain fact bullets count as items too, so the picker can list a few lines that are not tasks; the
  12 item cap keeps it short.
- After editing the mod while a session is open, restart the session: a hot reload has dropped the
  `/st` command once.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
