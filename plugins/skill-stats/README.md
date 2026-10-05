# skill-stats

A Claude Code mod that shows how often each of your skills runs, which never trigger, which reach
Claude without their description, and hands a weak description to skill-creator. Part of
[claude-plugins](../../README.md).

## What it does

- **`/skill-stats`**: a table of your skills: uses found in past transcripts, uses since the mod
  loaded, last seen, listing tokens, and whether Claude sees the description or only the name.
  `/skill-stats all` adds every plugin and built in skill.
- **`/skill-fix <skill>`**: puts a skill-creator request for that skill's description in the prompt
  box, with the facts above. It never sends it.
- Both answer without a Claude turn, so they cost no tokens.

"Your skills" are the ones in a skills folder, plus the plugin skills from the marketplaces you name.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `config_dirs` | this account | Comma separated Claude Code config dirs whose transcripts count, for several accounts on one machine |
| `own_marketplaces` | empty | Comma separated marketplace names whose plugin skills count as yours |
| `source_dirs` | empty | Comma separated folders where your skills' source lives, so `/skill-fix` points at the file to edit and not the installed copy |

## What it reads and does

- **Reads**: skill names in your local Claude Code transcripts (`projects/*.jsonl` under your config directory, or the folders in `config_dirs`) and those files' dates, the skills listed in this session with their size, and the marketplaces in your settings.
- **Does**: shows use counts in `/skill-stats`; `/skill-fix` fills the prompt box with a skill-creator request and never sends it.
- **Hooks**: `skill.prompt` counts a skill as used and passes its prompt on unchanged. `command.run` answers its own `/skill-stats` and `/skill-fix` commands and no other.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).
- **Never**: sends anything anywhere (no network calls, no telemetry).

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install skill-stats@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.
Settings are asked for at install, or later with `/plugin configure skill-stats@mehmetmutlu`.

## Known gaps

- History comes from transcripts, which Claude Code deletes after `cleanupPeriodDays`.
- "Name only" is measured from listing tokens, not from a documented field.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
