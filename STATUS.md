# claude-plugins: current state

Last updated: **5 October 2026**. The Claude Code Arcade added: five game mods (`dragon-lair`,
`jackpot`, `outlaw`, `tama`, `tetris`), each with its own copy of the shared moment detector
(`shared/arcade/milestones.ts`, copied by `scripts/sync-arcade-milestones.sh`, checked in CI). Not
pushed yet. Open before launch: the `arcade` and `toolkit` meta plugins (install through
`dependencies` not yet verified from the marketplace), the banner, GIFs, and a live check of every
game. The sections below predate the plugin layout.

Last updated: **1 October 2026**. Two skills: `create-project` (public since 30 September 2026) and
`save-context` (added 1 October 2026, tested with no config, a full config and `commit: false`).

## At a glance

| Item | State |
|---|---|
| Repository | Public, with social preview image, description and topics |
| Funding | GitHub Sponsors and Buy Me a Coffee (`.github/FUNDING.yml`) |
| License | MIT, added |
| README | Written: index, install, config reference, optional integrations |
| `create-project` | Written and tested: configurable storage, GitHub accounts, languages, optional account tool and registry |
| Personal-content check | `scripts/check-personal.sh`, installed as a pre-commit hook |
| `save-context` | Written and tested: optional `tasks_skill` and `commit` settings, works with no config |
| Plugin marketplace manifest | Added, passes `claude plugin validate` |

## Next actions

1. Add the next skill.

## Decision log

- **30 September 2026:** One collection repository for all skills rather than one repository per
  skill, following the common pattern (Anthropic's and Vercel's skill collections). Installing once
  brings every skill, and larger standalone tools get their own repositories.
- **30 September 2026:** MIT license. English only. Per-user values live in a config file outside the
  repo, so the published skill and its author's own copy share the same code.
- **1 October 2026:** `save-context` added. Banner re-rendered with its chip.
- **30 September 2026:** Made public. Install commands from the README tested on a clean setup:
  marketplace add, plugin install, and a plain clone all work.
