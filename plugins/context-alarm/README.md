# context-alarm

A Claude Code mod that warns when the context window fills up and suggests saving the session's
decisions with `/save-context` before automatic compaction summarises them away. Part of
[claude-plugins](../../README.md).

## What it does

- **At 80%** (the `warn_percent` setting, 50 to 95): a notice, a status line under the prompt
  (`Context 83% · /save-context suggested`) and `/save-context` suggested in the empty prompt box.
- **10 points higher**: one more notice that automatic compaction is close.
- **Before an automatic compaction** without a save: a last notice. The compaction still runs.
- **After `/save-context` runs**: the suggestions stop and the status line says so.
- **`/context-alarm`**: shows how full the context is and the thresholds.

It installs `project-workflow` from the same marketplace as a dependency, which provides
`/save-context`.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install context-alarm@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

## Known gaps

- On the turn that crosses the threshold the prompt suggestion can be missed (the new percent
  arrives after the turn ends); the notice and status line still show.
- If one turn jumps past both thresholds, only the second notice shows.
- Nothing is drawn in the VS Code chat panel.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
