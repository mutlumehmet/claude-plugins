# claude-plugins

![claude-plugins: plugins I use every day with Claude](docs/images/banner.png)

[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-827dbd?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/mutlumehmet)
[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-d97757?logo=buymeacoffee&logoColor=white)](https://buymeacoffee.com/mutlumehmet)
[![License: MIT](https://img.shields.io/badge/license-MIT-629987)](LICENSE)

Claude Code plugins I use every day, cleaned up so they work on anyone's machine. Formerly
`agent-skills`; old links redirect here.

**Contents:** [Claude Code Arcade](#claude-code-arcade) · [Claude Code Toolkit](#claude-code-toolkit) ·
[Skills](#skills) · [Install](#install) · [Contributing](#contributing) · [About](#about)

## Claude Code Arcade

Pixel games that live above your prompt and are played by your work: every tool call, commit,
merge and failed test moves the game on. Ten games in one plugin, [`arcade`](plugins/arcade).

![Octo Invader in a terminal: a pixel octopus smashes a city above the prompt while Claude edits, commits and merges](docs/images/octo-invader-terminal.gif)

**Install it** (type these at the Claude Code prompt, then pick a scope; there is nothing to set up):

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install arcade@mehmetmutlu
```

**Play:** Octo Invader starts by itself. Above the game sit three small buttons: **◀ ▶** switch
to the previous or next game, **☰** opens the game menu, and **☆ make default** (it shows once you
switch) makes that game the one every new terminal starts with. Prefer typing? `/arcade` opens
the menu, `/arcade duck` plays Duck Hunt here, `/arcade default duck` makes it your default.

| Game | Command | |
|---|---|---|
| **Octo Invader**: an octopus smashes a city while Claude edits | `/arcade octopus` | <img src="docs/images/octo-invader.gif" width="360" alt="Octo Invader strip"> |
| **Duck Hunt**: your commits shoot the ducks, failed tools let them fly | `/arcade duck` | <img src="docs/images/duck-hunt.gif" width="360" alt="Duck Hunt strip"> |
| **Bug Command**: bugs fall on six cities; click the sky to fire too | `/arcade bugs` | <img src="docs/images/bug-command.gif" width="360" alt="Bug Command strip"> |
| **Dario**: a side scroller, tool calls bring coins | `/arcade dario` | <img src="docs/images/dario.gif" width="360" alt="Dario strip"> |
| **Block Town**: your agents build a town, a castle on merges | `/arcade town` | <img src="docs/images/block-town.gif" width="360" alt="Block Town strip"> |
| **Dragon Lair, Jackpot, Outlaw, Tama, Tetris**: five small games at the right of the line | `/arcade dragon`, `jackpot`, `outlaw`, `tama`, `tetris` | <img src="docs/images/arcade-hero.gif" width="360" alt="The five small games"> |

Every game, what counts as a moment, and every command: [the Arcade's own page](plugins/arcade).

## Claude Code Toolkit

Small mods for long sessions. Install them all with `/plugin install toolkit@mehmetmutlu`
([`toolkit`](plugins/toolkit)), or any one by name.

| Plugin | Kind | What it does |
|---|---|---|
| [`subtask-icons`](plugins/subtask-icons) | mod | A `⑂ Subtask` button under the last answer that puts `/subtask <item>` in the prompt box, and a `Pin list` button that keeps that list above the prompt while you work through it |
| [`context-alarm`](plugins/context-alarm) | mod | Warns as the context fills up and suggests `/save-context` before compaction |
| [`answer-buttons`](plugins/answer-buttons) | mod | Plain English, Shorter and Plain & short buttons under the last answer |
| [`skill-stats`](plugins/skill-stats) | mod | Which skills run, which never trigger, and a hand off to skill-creator |
| [`dash-guard`](plugins/dash-guard) | mod | Refuses prose with em dashes, en dashes or double hyphens |
| [`shared-file-guard`](plugins/shared-file-guard) | mod | Refuses shell writes to shared files another session changed |
| [`fork-lineage`](plugins/fork-lineage) | mod | Shows which session a fork came from, and sends the fork's report to its parent when you approve |

## Skills

| Plugin | Kind | What it does |
|---|---|---|
| [`project-workflow`](plugins/project-workflow) | skills | [`create-project`](plugins/project-workflow/skills/create-project) sets up a new project folder the same way every time; [`save-context`](plugins/project-workflow/skills/save-context) saves what a session decided, changed and left open before you close it |

## Install

A plugin is a package Claude Code installs as one unit. Here a plugin holds either **skills**
(folders of instructions Claude loads when a task calls for them) or a **mod** (a small piece of
code that runs inside Claude Code and can hold, change or add to what it does). Anything that
differs between people lives in a config file or a plugin setting, and every integration beyond the
basics is optional.

Add this repo as a marketplace once, then install the plugins you want:

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install <plugin>@mehmetmutlu
```

Skills run as `/<plugin>:<skill>`, or by their short name when nothing else uses it, or just
describe the task and Claude picks them up. Mods need Claude Code 2.1.287 or later and run with your
permissions, so read a mod's code before you install it.

If you installed `create-project` or `save-context` from the old `mutlumehmet-agent-skills`
marketplace, remove it and install `project-workflow@mehmetmutlu` instead.

**Skills without the plugin system** (anywhere that reads a skills folder): copy or symlink a skill
folder into your skills directory.

```bash
git clone https://github.com/mutlumehmet/claude-plugins.git
ln -s "$PWD/claude-plugins/plugins/project-workflow/skills/<skill>" ~/.claude/skills/<skill>
```

## Contributing

Issues and pull requests are welcome. The rules every plugin follows are in [`CLAUDE.md`](CLAUDE.md):
nothing personal in the repo, everything configurable has a default, English only.

`scripts/check-personal.sh` is a pre-commit hook that refuses commits containing anything from your
own list of personal terms (kept outside the repo). Install it with:

```bash
ln -sf ../../scripts/check-personal.sh .git/hooks/pre-commit
```

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

I'm Mehmet Mutlu, a London-based software engineer with 10+ years of building for the web, now
focused on AI. I was an early adopter of AI in day-to-day engineering and became my team's AI
advocate, building agentic workflows that were adopted by teams and professionals. Today I build
AI-native solutions for businesses with complex workflows, and AI tools for teams, engineers,
designers and professionals. This repo is where I share the pieces that proved useful day to day.

- Portfolio: [mehmetmutlu.dev](https://www.mehmetmutlu.dev)
- LinkedIn: [Mehmet Mutlu](https://www.linkedin.com/in/mehmet-mutlu-03aa7319a/)
- X: [@findmutlu](https://x.com/findmutlu)
- GitHub: [@mutlumehmet](https://github.com/mutlumehmet)

If a plugin here saves you some time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).

## License

[MIT](LICENSE)
