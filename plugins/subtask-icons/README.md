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
- **Pinned list**: when `/subtask` runs, the items of the answer it was taken from are pinned in the
  band above the prompt, so the list stays in view however the conversation scrolls. The mod keeps
  the last 10 answers that had a list and picks the one whose items the `/subtask` text names, else
  the newest one with a list, so a short answer in between does not lose the list. Items already
  sent to a subtask get a `⑂`; the first 5 show, then a `+N more` line. `/subtask unpin`,
  `/st unpin` or the `Unpin` button clears it.

What it reads and does: Claude's last answer (to find the items), the prompt box (to add a pick), and
the text of each `/subtask` you run (to pin and mark items). It watches `/subtask` and only answers it
itself for `unpin`; every other `/subtask` runs as usual. It sends nothing anywhere.

Nothing is drawn in the VS Code chat panel; use `/st` there.

## What it reads and does

- **Reads**: the text of the last answers, to find their list items, and the prompt box, to add an item to it.
- **Keeps**: the last 10 answers that had a list, and the pin, in Claude Code's session state (in memory, this session only), so a hot reload keeps them.
- **Does**: draws the Subtask button, the item picker and the pinned list above the prompt; fills the prompt box and never sends it.
- **Hooks**: `turn.start` and `turn.complete` track the latest answer. `command.run` answers `/subtask unpin` and `/st`; every other `/subtask` passes on unchanged. `ui.render` adds its rows and leaves the answer unchanged.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).
- **Never**: sends anything anywhere (no network calls, no telemetry).

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
- An item counts as sent when the `/subtask` text holds its whole first line; an edited pick is not
  marked, and a `/subtask` whose text names no item pins the newest list. A new session starts with
  no pin.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
