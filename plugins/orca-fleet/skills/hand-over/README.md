# hand-over

Part of [`orca-fleet`](../../README.md), an Orca Strator plugin.

![orca-fleet: conduct runs the fleet and its crons, lanes and checkers report to it, and a session near full context hands over to a fresh one](../../../../docs/images/orca-fleet-flow.png)

Hands this session's work to a fresh one. Bare, it writes the handoff note from its role's template. With `start` it also opens the successor (`<name> #N+1`) in a new Terminal window with the note as its first prompt; the successor reports in and tells this session it took over, and this session then stops its crons.

## Use

```
/orca-fleet:hand-over          write the note, keep working
/orca-fleet:hand-over start    write the note and open the successor
```

The project config, templates, and what it reads and writes: see the [plugin README](../../README.md).

## Install

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install orca-fleet@mehmetmutlu
```

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev). If it saves you time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).
