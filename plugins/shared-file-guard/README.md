# shared-file-guard

A Claude Code mod for running several sessions on the same project. It refuses a shell command that
would write a shared file (STATUS.md, CLAUDE.md, MEMORY.md, or the files you name) when this session
never read it, or another session changed it since. Part of [claude-plugins](../../README.md).

## What it does

- The Edit and Write tools already refuse a file that changed since it was read. This closes the
  shell gap: heredocs, `python3` scripts, `sed -i`, `tee`, `mv` and `cp`.
- The refusal names the file and tells Claude to read it again, merge, then write.
- A `cat` or `grep` counts as a read; a session's own writes do not block its next one; creating a
  file that does not exist yet is allowed.
- `/shared-file-guard` lists the files this session has seen; `/shared-file-guard off|on`.
- If the mod fails, the command runs as normal.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `watched_files` | `STATUS.md,CLAUDE.md,MEMORY.md` | Comma separated file names; `*` matches any run of name characters, such as `*register*.md` |

## What it reads and does

- **Reads**: which shared files (the project's status, instructions, memory and register files) this session read and when they last changed on disk, and the command line of each shell command.
- **Does**: refuses a shell write to a shared file that another session changed since this one read it, and logs a line saying so.
- **Hooks**: `tool.call` on Read, Edit and Write only records what was read. `tool.call` on Bash may refuse that one command; it never changes it. `command.run` answers its own `/shared-file-guard` command and no other.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).
- **Never**: sends anything anywhere (no network calls, no telemetry).

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install shared-file-guard@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.
Settings are asked for at install, or later with `/plugin configure shared-file-guard@mehmetmutlu`.

## Known gaps

- Paths built inside a script, and relative paths after a `cd` in the same command, are not seen.
- It compares date and size, not a hash.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
