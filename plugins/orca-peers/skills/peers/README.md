# peers

Part of **Orca Strator**, a set of small plugins for running many Claude Code sessions at once.

![orca-peers: reads every account, drops ended sessions, lists each one with the address to message it](../../../../docs/images/orca-peers-flow.png)

Lists every live Claude Code session on this machine, **in every account**, with the address you
message it at. Claude Code's own peer list shows only the account you are in; SendMessage to a
`uds:` address works across accounts. This closes that gap.

```
default   my-app          Lane 1                  busy     uds:/tmp/cc-socks/37240.sock
default   my-app          orchestrator            idle     uds:/tmp/cc-socks/34319.sock  (this session)
personal  side-project    refactor the parser     waiting  uds:/tmp/cc-socks/48790.sock
```

## Install

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install orca-peers@mehmetmutlu
```

Then ask "list the peers" or run `/orca-peers:peers`.

## How it works

Each running Claude Code session keeps a small record at `<config dir>/sessions/<pid>.json`. The
skill reads those records for every account, drops the ones whose process has ended (or whose
process id now belongs to a newer process), and takes each title from the session's own
transcript. It reads only and never writes to a config dir. No server, no login tokens.

## First run and config

Works with no config: it finds `~/.claude` and every `~/.claude-<name>` folder with a `sessions/`
folder, and `$CLAUDE_CONFIG_DIR`. Account ids are `default` and `<name>`.

Optional, `~/.config/orca-strator/config.yaml` (shared by the Orca Strator plugins):

| Key | Required | Default | What it does |
|---|---|---|---|
| `accounts_file` | no | none | A JSON file listing your accounts, to name them and to include config dirs in other places: `{"accounts": {"work": {"configDir": "~/.claude"}, "personal": {"configDir": "~/.claude-personal"}}}` |

## It will never

Write to a Claude Code config dir, read login tokens, or message anyone by itself.

## Requirements

macOS or Linux, Python 3.8+, Claude Code with cross-session messaging (SendMessage to `uds:` addresses).
The record format is Claude Code's own and undocumented; a future version may change it.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev). If it saves you time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).
