# peers

Part of **Orca Strator**, a set of small plugins for running many Claude Code sessions at once.

![orca-peers: reads every account, drops ended sessions, lists each one with the address to message it](../../../../docs/images/orca-peers-flow.png)

Lists every live Claude Code session on this machine, **in every account**, with the address you
message it at. Claude Code's own peer list shows only the account you are in; SendMessage to a
`uds:` address works across accounts. This closes that gap.

```
default   my-app          Lane 1                  busy      87%  uds:/tmp/cc-socks/37240.sock  HAND OVER
default   my-app          orchestrator            idle      31%  uds:/tmp/cc-socks/34319.sock  (this session)
personal  side-project    refactor the parser     waiting   72%  uds:/tmp/cc-socks/48790.sock  PREPARE HANDOVER
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

The percent column is each session's **context use**: how full its context window was at its last
reply (that reply's input tokens, cache reads and cache writes, from the transcript, out of the
model's window). It survives account moves and shows long before Claude Code's own warning. At
70% the row says `PREPARE HANDOVER`, at 85% `HAND OVER`. `·` means no reply yet. With `--json`
each row carries `context: {used, window, percent, flag}` for scripts and scheduled checks.

## First run and config

Works with no config: it finds `~/.claude` and every `~/.claude-<name>` folder with a `sessions/`
folder, and `$CLAUDE_CONFIG_DIR`. Account ids are `default` and `<name>`.

Optional, `~/.config/orca-strator/config.yaml` (shared by the Orca Strator plugins):

| Key | Required | Default | What it does |
|---|---|---|---|
| `context_window` | no | 1000000 when the account's `settings.json` model ends in `[1m]` or the session already went past 200000, else 200000 | The context window in tokens, for every session |
| `accounts_file` | no | none | A JSON file listing your accounts, to name them and to include config dirs in other places: `{"accounts": {"work": {"configDir": "~/.claude"}, "personal": {"configDir": "~/.claude-personal"}}}` |

## It will never

Write to a Claude Code config dir, read login tokens, or message anyone by itself.

## Requirements

macOS or Linux, Python 3.8+, Claude Code with cross-session messaging (SendMessage to `uds:` addresses).
The record format is Claude Code's own and undocumented; a future version may change it.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev). If it saves you time, you can [sponsor me on GitHub](https://github.com/sponsors/mutlumehmet) or [buy me a coffee](https://buymeacoffee.com/mutlumehmet).
