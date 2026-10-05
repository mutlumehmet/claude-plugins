# octo-invader

A Claude Code mod: a pixel octopus invades a city that runs the full width of the line above the prompt. It acts out what Claude is doing, Godzilla style, and pulls planes out of the sky when something worth celebrating happens. Part of the Claude Code Arcade in [claude-plugins](../../README.md).

![octo-invader in a terminal: Claude reads, edits, commits and merges while the octopus walks the streets, smashes a building, pulls a plane out of the sky and takes the city](../../docs/images/octo-invader-terminal.gif)

The strip on its own, as the mod draws it:

![The octopus strip: a city the width of the terminal, buildings toppled, a plane downed, a flag on the rubble](../../docs/images/octo-invader.gif)

Both GIFs are drawn by the mod's own code from a scripted session (a read, an edit, a web search, a commit, a merge); the window around the strip is a mock up of a terminal.

## What it does

- **While Claude works** the octopus shows it: it hops when you send a message, hovers over the rooftops while Claude thinks, walks the streets on its tentacles while a file is read, hunts about with a `?` while Claude searches, and takes to the sky for web and MCP tools.
- **Edits and shell commands** are demolition: it walks up to the nearest building and pounds it down a storey at a time until it falls with a `CRASH!`. Fallen buildings rise again after about 45 seconds, so the city never runs out.
- **Each subagent** is a baby octopus that swims behind it in a line, paddles faster as the subagent works, and swims home when it finishes (or sinks when it fails).
- **A failed tool** leaves it dazed with stars over its head; **two minutes of quiet** and it curls up asleep.
- **Moments**: a small one is a squirt of ink, a medium one a plane snatched out of the sky and thrown down (`BOOM!`), a big one a `RAMPAGE!` through the streets, and a merge, release, deploy, streak or record ends with a flag on the rubble and `THE CITY IS MINE`.
- **The score** sits at the right end of the strip: `Lv 3  ⌂ 12  ✈ 4  ⚒ 140` (level, buildings toppled, planes downed, tool calls). It is kept between sessions.
- **`/octopus`** shows the score; `/octopus ink`, `plane`, `rampage` and `conquer` show off each size; `/octopus hide` puts it away and `/octopus show` brings it back.

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
- **Draws**: an eight row strip, the full width of the line above the prompt, with whatever else is
  on that line kept underneath it; and an occasional notice.
- **Hooks**: `skill.prompt` only notes which skill ran, so a finished skill can count as a moment; it passes the skill's prompt on unchanged. `command.run` answers its own `/octopus` command and no other.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).
- **Never**: changes, blocks or delays a tool call or a message; sends anything anywhere (no network
  calls, no telemetry); reads file contents beyond counting lines of a file Claude writes.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install octo-invader@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

It draws in a terminal (including an editor's integrated terminal); in the Desktop app, the VS Code
chat panel and `claude -p` it runs but draws nothing. It is not part of the `arcade` meta plugin,
because the strip takes eight rows; install it on its own.

## Known gaps

- The strip takes eight rows; on a short terminal the line above the prompt scrolls instead of showing whole.
- With other Arcade games showing, the line above the prompt gets tall: `/<command> hide` puts one away.
- The octopus is drawn with half blocks; a terminal with tall line spacing shows thin gaps between rows.
- The score glyphs `⌂` and `✈` are single width in most terminal fonts; a font that draws `✈` as an emoji shifts the score by one cell.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
