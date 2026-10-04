# secret-guard

A Claude Code mod that masks secrets in tool output before Claude reads them, then asks whether
Claude may read that one result unmasked. Part of [claude-plugins](../../README.md).

## What it does

When a tool result (a `cat .env`, an `env`, a config file) holds something that looks like a secret,
the copy Claude reads is masked first, for example `password=[MASKED secret-value, 12 chars]`, and a
dialog asks you what to do. The dialog names the tool and the kinds and counts it found, never the
values:

- **Keep it masked**: Claude reads the masked copy.
- **Show it raw**: Claude reads the original, for this one result only.
- **Always mask this session, don't ask**: later finds are masked with a short notice instead of a
  question, until the session ends.

It fails closed: a dismissed dialog, a typed answer, a non-interactive run (`claude -p`) or an error
in the mod all keep the result masked.

## What it recognises

Private key blocks, Anthropic, OpenAI, GitHub, AWS access key, Google API key, Google OAuth token,
Slack, Stripe, JWT, `Bearer ...`, and `key = value` lines where the key is api key, secret, token,
password, access key, client secret or auth (the key name stays, only the value is masked).

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install secret-guard@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

## Known gaps

- Only tool output is masked. A secret written into a command, or pasted into the prompt, stays
  readable.
- The screen and the session transcript on disk keep the original; only the copy the model reads is
  masked.
- Patterns, not a scanner: an unusual token format can be missed, and a harmless `token: x` line can
  be masked (that is why it asks).

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
