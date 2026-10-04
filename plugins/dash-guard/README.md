# dash-guard

A Claude Code mod that refuses prose Claude writes with an em dash, an en dash or a double hyphen
used as punctuation, and tells Claude which lines to rewrite. Part of
[claude-plugins](../../README.md).

## What it does

- Checks Write and Edit on Markdown and text files, and any MCP tool you name (a document, an
  email, a message).
- Leaves code alone: code files, fenced blocks, inline code, HTML comments, and CLI flags such as
  `git reset --hard`.
- Lines that already had a dash before the edit are not reported, so old files can still be edited.
- `/dash-guard off|on` for the session.
- It is a style rule, not a safety check: if the mod fails, the write goes through.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `banned` | all three | Comma separated: `em`, `en`, `double` |
| `tools` | empty | A regular expression of MCP tool names to check too, such as `^mcp__notion__.*(create\|update).*$` |

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install dash-guard@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.
Settings are asked for at install, or later with `/plugin configure dash-guard@mehmetmutlu`.

## Known gaps

- Chat replies are not checked, only what is written to files and tools.
- A shell heredoc (`cat > file`) goes around it.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
