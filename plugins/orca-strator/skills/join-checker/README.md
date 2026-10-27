# join-checker

Part of [`orca-strator`](../../README.md), an Orca Strator plugin.

![orca-strator: conduct runs the fleet and its crons, lanes and checkers report to it, and a session near full context hands over to a fresh one](../../../../docs/images/orca-strator-flow.png)

Makes this session a checker: it works through the preview ledger oldest first, checks each merged change once where the row says, as the project's test accounts, writes pass or fail with what it saw, and reports fails to the orchestrator at once.

## Use

```
/orca-strator:join-checker
/orca-strator:join-checker notes/handoff-checker-a-2.md
```

The project config, templates, and what it reads and writes: see the [plugin README](../../README.md).

## Install

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install orca-strator@mehmetmutlu
```

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev). If it saves you time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).
