# jackpot

A Claude Code mod: a pixel slot machine at the right end of the line above the prompt. Every finished turn pulls the lever; the moments worth celebrating earn golden spins with better odds. Part of the Claude Code Arcade in [claude-plugins](../../README.md).

## What it does

- **Every finished turn** pulls the lever once. Reels blur, stop one by one and bounce as they lock.
- **Medium moments** queue one golden spin, **big moments** three: better odds, double pay, never a loss.
- **Five clean turns in a row** (no tool error) raise the multiplier by one, up to ×5; a failed tool resets it.
- **Payouts**: three 7s pay 100 chips, three dragons 50, diamonds 25, bells 15, stars 10, cherries 8; a cherry pair 3, any other pair 2. A jackpot strobes the cabinet and spills coins.
- **Under the machine**: `◉ 2967  ×1  ▲ 2  ✦ 0  ♛ 1` (chips, multiplier, clean streak, golden spins waiting, jackpots). Chips are kept between sessions.
- **`/jackpot`** shows the rules and stats; `/jackpot spin`, `golden` and `demo` are practice spins that pay nothing; `/jackpot hide` toggles it.

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
- **Hooks**: `skill.prompt` only notes which skill ran, so a finished skill can count as a moment; it passes the skill's prompt on unchanged. `command.run` answers its own `/jackpot` command and no other.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).
- **Never**: changes, blocks or delays a tool call or a message; sends anything anywhere (no network
  calls, no telemetry); reads file contents beyond counting lines of a file Claude writes.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install jackpot@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

It draws in a terminal (including an editor's integrated terminal) and in the Code tab of the
Desktop app; in the VS Code chat panel and `claude -p` it runs but draws nothing. Several Arcade
games can be open at once, but the line above the prompt fills up: `/<command> hide` puts one away.

## Known gaps

- The machine is in colour (red, green, blue, yellow, purple on a gold cabinet), so it does not follow a light or dark terminal theme the way the one colour games do.
- Where two colours meet inside one cell, a terminal with tall line spacing can show a hairline.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
