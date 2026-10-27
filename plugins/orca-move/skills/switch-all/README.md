# switch-all

Part of [`orca-move`](../../README.md), an [Orca Strator](../../README.md) plugin.

![orca-move: tells the others and saves its crons, exits only with an empty prompt box, resumes in the twin account in the same tab, and announces its new address](../../../../docs/images/orca-move-flow.png)

Moves every live session of this account to a twin account. It lists them, asks you once, then asks each session to run `switch` itself (at most three at a time, so each saves its own crons and tells its own peers), and moves this session last.

## Use

```
/orca-move:switch-all
/orca-move:switch-all workb
```

How the whole move works, setup, what it reads and writes, and what it never does: see the [plugin README](../../README.md).

## Install

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install orca-move@mehmetmutlu
```

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev). If it saves you time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).
