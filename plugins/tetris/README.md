# tetris

A Claude Code mod: a classic falling-piece Tetris in a small handheld screen at the right end of the line above the prompt. Claude's tools drop the pieces; nobody knows what comes next. Part of the Claude Code Arcade in [claude-plugins](../../README.md).

## What it does

- **Every tool Claude runs** drops a piece; a simple placement AI picks where it lands. The next piece is never shown.
- **A full row** clears, with the classic scoring (40, 100, 300 or 1200 for one to four rows, times the level). Every ten rows is a level.
- **A failed tool** pushes up a garbage row with one gap in it.
- **Medium moments** clear one row from the bottom, **big moments** three.
- **When the stack reaches the lid** the game ends, the well empties and a new game starts. The best score is kept.
- **Under the screen**: `▤ 35  ◆ 4250  Lv 3` (rows, score, level).
- **`/tetris`** shows the score and rules; `/tetris drop` adds pieces, `/tetris clear` clears a row, `/tetris hide` toggles it.

## Moments

Every Arcade game spots the moments worth celebrating on its own, so each one installs alone with no
dependency. Coding or not, a session has them.

| Size | Moments |
|---|---|
| Small | A finished turn, a file saved, every 10th tool call in a turn |
| Medium | A commit, a push, a pull request opened, tests passing, any skill run, a subagent finished, a plan approved, an MCP tool that sends, creates, posts or publishes, a long document written, praise in your message |
| Big | A merge, a release (`gh release create`, `npm publish`), a production deploy (`vercel --prod`, `netlify deploy --prod`, `fly deploy` and others), tests back to green after failing, a deliverable made (PDF, DOCX, XLSX, PPTX, images), a published page, a finished task list of three or more, a marathon turn (10 minutes, 30 tools, no errors), three subagents done in one turn, a 3, 7, 30 or 100 day streak, the 100th, 1,000th or 10,000th tool call |

A commit that says "nothing to commit" or a push that says "Everything up-to-date" counts for
nothing. Tool calls inside subagents do not count; their finishing does.

## Settings

All optional; every one is empty by default. Set them in `/plugin` (the plugin's settings) or in
`settings.json` under `pluginConfigs`.

| Setting | What it is for | Example |
|---|---|---|
| `big_skills` | Skills whose run is a big moment (every other skill is medium) | `release-notes, publish-report` |
| `quiet_skills` | Skills that celebrate nothing | `commit` |
| `big_commands` | A regular expression of shell commands whose success is big | `make ship` |
| `medium_commands` | A regular expression of shell commands whose success is medium | `terraform apply` |
| `praise_words` | Extra words that count as praise, on top of the built-in list (thanks, great, perfect and a few in other languages) | `nice one, cheers` |

## What it reads and does

- **Reads**: the name of each tool Claude runs and whether it failed; for shell commands, the command
  line and whether its output says nothing changed; for file writes, the file name and its line
  count; skill names; the words of your message (only to spot praise); subagent start and finish.
- **Keeps**: its own score and state in Claude Code's plugin store on your machine.
- **Draws**: one block at the right end of the line above the prompt, and an occasional notice.
- **Never**: changes, blocks or delays a tool call or a message; sends anything anywhere (no network
  calls, no telemetry); reads file contents beyond counting lines of a file Claude writes.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install tetris@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

It draws in a terminal (including an editor's integrated terminal) and in the Code tab of the
Desktop app; in the VS Code chat panel and `claude -p` it runs but draws nothing. Several Arcade
games can be open at once, but the line above the prompt fills up: `/<command> hide` puts one away.

## Known gaps

- The well is 10 blocks wide and 8 deep, so games are short and restart often.
- The placement AI favours a low, flat stack; it does not look ahead.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
