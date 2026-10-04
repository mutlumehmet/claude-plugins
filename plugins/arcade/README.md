# arcade

The Claude Code Arcade in one install. This plugin holds no code of its own: it lists the five game
mods as dependencies, so installing it installs all five. Part of [claude-plugins](../../README.md).

| Game | What it is |
|---|---|
| [`dragon-lair`](../dragon-lair) | A pixel dragon that acts out what Claude does and breathes fire when you ship |
| [`jackpot`](../jackpot) | A slot machine: every finished turn pulls the lever |
| [`outlaw`](../outlaw) | An Atari duel: your gunslinger fires at the good moments, the bug fires when a tool fails |
| [`tama`](../tama) | A Tamagotchi your work feeds, or it packs its bags |
| [`tetris`](../tetris) | Tetris where Claude's tools drop the pieces |

Every game is played by your work, coding or not: small moments (a turn done, a file saved), medium
ones (a commit, a skill run, a message sent) and big ones (a merge, a deploy, a finished task list, a
PDF made). Each game spots them on its own, so each also works installed alone.

## Install

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install arcade@mehmetmutlu
```

To try a single game instead, install it by name, for example `/plugin install dragon-lair@mehmetmutlu`.

## Good to know

- **The games share the line above the prompt.** With all five showing, that line gets crowded. Keep
  one or two out at a time and hide the rest: `/dragon hide`, `/jackpot hide`, `/outlaw hide`,
  `/tama hide`, `/tetris hide` (the same command brings each back).
- **Removing `arcade` leaves the games installed.** Claude Code keeps plugins installed as
  dependencies until you clean them up: run `claude plugin prune` after uninstalling `arcade`, or
  uninstall the games you no longer want by name.
- **What the games read and do** is in each game's README. None of them sends anything anywhere or
  collects telemetry.
- Needs Claude Code 2.1.287 or later.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
