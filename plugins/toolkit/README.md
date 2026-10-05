# toolkit

The Claude Code Toolkit in one install. This plugin holds no code of its own: it lists small mods
for long sessions as dependencies, so installing it installs them all. Part of [claude-plugins](../../README.md).

| Mod | What it does |
|---|---|
| [`subtask-icons`](../subtask-icons) | A `⑂` button under the last answer that puts `/subtask <item>` in the prompt box |
| [`context-alarm`](../context-alarm) | Warns as the context fills up and suggests `/save-context` before compaction |
| [`answer-buttons`](../answer-buttons) | Plain English, Shorter and Plain & short buttons under the last answer |
| [`skill-stats`](../skill-stats) | Which skills run, which never trigger, and a hand off to skill-creator |
| [`dash-guard`](../dash-guard) | Refuses prose with em dashes, en dashes or double hyphens |
| [`shared-file-guard`](../shared-file-guard) | Refuses shell writes to shared files another session changed |
| [`fork-lineage`](../fork-lineage) | Shows which session a fork came from, and sends the fork's report to its parent when you approve |

Installing the toolkit also installs [`project-workflow`](../project-workflow) (the `create-project` and
`save-context` skills), which `context-alarm` depends on.

## Install

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install toolkit@mehmetmutlu
```

To pick only some, install each by name, for example `/plugin install dash-guard@mehmetmutlu`.

## Good to know

- **Removing `toolkit` leaves the mods installed.** Claude Code keeps plugins installed as
  dependencies until you clean them up: run `claude plugin prune` after uninstalling `toolkit`, or
  uninstall the mods you no longer want by name.
- **Settings** stay per mod: each mod's README lists its settings, set in `/plugin`.
- **What each mod reads and does** is in its README. None of them sends anything anywhere or collects
  telemetry.
- Needs Claude Code 2.1.287 or later.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
