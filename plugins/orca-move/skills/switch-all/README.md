# switch-all

Part of [`orca-move`](../../README.md), an [Orca Strator](../../README.md) plugin.

![orca-move: tells the others and saves its crons, exits only with an empty prompt box, resumes in the twin account, and announces its new address](../../../../docs/images/orca-move-flow.png)

Moves every live session of this account to a twin account. It runs preflight on the target seat first (logins, MCP servers, trust, Chrome) and waits until it is clean, shows a dry run of `move-all`, and hands you one `!` line that ends each idle or waiting session and reopens it in a new Terminal window, in seconds, even when the account is already out of quota. A session waiting on a question asks it again on arrival. Busy sessions get a short wait; a session waiting on a permission prompt is skipped unless you add `--force`. Then it checks with peers that everyone arrived. This session moves last. Asking each session to run `switch` itself stays as the fallback.

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
