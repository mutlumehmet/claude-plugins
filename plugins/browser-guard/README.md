# browser-guard

A Claude Code mod that holds a browser action which could submit, send, apply, pay or move a form
forward, until you pick **Continue**. Part of [claude-plugins](../../README.md).

## What it does

It watches the browser tools of Claude in Chrome, the Playwright plugin and Chrome DevTools.

- **Passes without asking**: navigation, snapshots, screenshots, reading the page, tabs, console and
  network reads, filling a field.
- **Always held**: the Enter key (it submits forms), page scripts, file uploads, accepting a page
  dialog, and clicks on an element whose label is not known.
- **Clicks with a known label**: held when the label holds a risky word (submit, send, apply, pay,
  order, checkout, confirm, publish, next, continue, delete and similar, with common endings such as
  Submits or Sending), passed otherwise.
- **Any tool it does not know is held.**

The dialog lists **Stop** first, so pressing Enter without reading refuses. Stop, a typed answer, a
dismissed dialog, a non-interactive run or an error in the mod all refuse the action.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install browser-guard@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `extra_words` | empty | Words on buttons in other languages to hold, as regex fragments separated by `\|`. Each matches as a stem with any ending, so `bestellen\|absenden` also catches `Jetzt bestellen`. Add a negative lookahead for a short stem that would over-match, for example `del(?!\\p{L})` for a button that says only "del". An invalid pattern is ignored and the English words still apply. |

Set it when installing (`/plugin install` asks), or later with `/plugin configure browser-guard@mehmetmutlu`.

## Known gaps

- A click whose description sounds harmless but lands on a submit button passes; the guard is as
  good as the label it sees.
- A dropdown that submits on change, or a GET form submitted through navigation, is not caught.
- Buttons in other languages are only recognised through `extra_words`.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
