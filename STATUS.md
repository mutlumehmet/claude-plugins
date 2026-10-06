# claude-plugins: current state

**6 October 2026:** `fork-lineage` 0.2.1. The report briefing now lists the prompts typed in the fork (from `lineage.py show`, `ownPromptList`, at most 150 prompts of 200 characters each). Reason: in a long fork that had been compacted, the summary mixed the parent's history with the fork's work, and the model guessed the boundary both ways. One report left out the fork's work from before compaction, and another claimed the parent's work as the fork's. New test: the briefing carries the list; it fails on 0.2.0. 7 tests pass, validates, check-personal clean.

**5 October 2026, late evening (pushed, dcff7f2):** new mod `fork-lineage` 0.2.0 (`plugins/fork-lineage`, moved here from the private marketplace): band line with a fork's parent and a report button, `/lineage`, `/report-parent`, blinking Read for a waiting report; file contract in its `CONTRACT.md`. Added to `toolkit` 0.2.0 as the seventh tool, to the main README, marketplace and PRIVACY.md; banner and social preview re-rendered with "7 tools" and "7 games" (social preview not uploaded yet). Stills and GIFs rendered offline from the mod's own hooks (the offline render tool, scenes `fork-lineage*`). 6 tests pass, validates, check-personal clean. Pushing this makes the open Directory forms need Re-validate.

**5 October 2026, evening:** `arcade` 0.5.0: `/arcade <game>` now swaps only this terminal; `/arcade <game> all` pins it for every terminal (the old `/arcade <game>`). 47 tests pass, validates. Pushed (`5b93c60`), installed 0.5.0 in both accounts; open terminals need `/reload-plugins`.

Last updated: **5 October 2026, afternoon**, on branch `arcade-one-plugin` (worktree
`~/Projects/claude-plugins-arcade`, not merged, not pushed). Seventh game: Duck Hunt (`/duck`,
`src/games/duck-hunt.tsx`), a full width marsh like the octopus's city: moments shoot ducks down,
a failed tool lets one fly away and the dog laughs. Frames checked as text from its own code in a
scratch harness; not yet seen in a live terminal. 45 tests pass. The first six games (dragon-lair, jackpot,
outlaw, tama, tetris, octo-invader) are one plugin, `arcade` 0.2.0: settings `mode` (random,
rotate, fixed, all, off) and `pool` choose which games a new terminal shows, `/arcade` shows and
changes it (`/arcade tetris`, `/arcade pool dragon tetris`, `/arcade next`), `/<game> hide|show`
is this terminal only. One moment detector (`src/milestones.ts`) feeds every game, so
`shared/arcade/` and `scripts/sync-arcade-milestones.sh` are gone; CI checks
`plugins/arcade/scripts/build.sh --check` instead. 37 tests pass, every plugin validates, `tsc`
clean. The six single game plugins are removed from the marketplace; their Directory submissions
are to be withdrawn and `arcade` resubmitted. Scores of the single games do not carry over.

Before that, 5 October 2026: the marketplace held 14 plugins: one skills plugin
(`project-workflow`), the Claude Code Toolkit (six mods), the Claude Code Arcade (five game mods) and
two meta plugins, `toolkit` and `arcade`, that install each collection in one go through
`dependencies` (verified in an isolated install on 5 October 2026: installing a meta plugin installs
its dependencies; uninstalling it leaves them, `claude plugin prune` cleans up). Banner re-rendered
with "6 tools" and "5 games" chips; `docs/images/social-preview.png` is the 1280 by 640 copy for
GitHub's social preview, not uploaded yet. Nothing from 5 October is pushed yet. Launch is planned
for 6 October 2026.

## At a glance

| Item | State |
|---|---|
| Repository | Public, MIT, GitHub Sponsors and Buy Me a Coffee (`.github/FUNDING.yml`) |
| Marketplace | `.claude-plugin/marketplace.json`, passes `claude plugin validate` |
| Skills | `project-workflow`: `create-project`, `save-context` |
| Claude Code Toolkit | `subtask-icons`, `context-alarm`, `answer-buttons`, `skill-stats`, `dash-guard`, `shared-file-guard`; meta plugin `toolkit` |
| Claude Code Arcade | `arcade` 0.2.0: six games in one plugin (`src/` built into `hooks/arcade.js` by `scripts/build.sh`) |
| CI | `.github/workflows/plugins.yml`: the Arcade build is current, validate the marketplace and every plugin, test every mod |
| Personal-content check | `scripts/check-personal.sh`, installed as a pre-commit hook |

## Open before launch (6 October 2026)

1. Push the 5 October commits.
2. Upload `docs/images/social-preview.png` as the repository's social preview.
3. Record the GIFs and add them to the Arcade and Toolkit READMEs.
4. Install from the marketplace in a clean setup and check every game live, light and dark theme.

## Decision log

- **5 October 2026:** Two collections, the Claude Code Toolkit and the Claude Code Arcade, each with a
  code-free meta plugin that installs it in one command. Every game also installs alone: the moment
  detector is copied into each game rather than shared through a dependency, so a single install
  never misses it.
- **5 October 2026:** Arcade games added. Turkish praise words left out of the built-in list (the
  repo's personal check refuses Turkish letters); users add their own with the `praise_words` setting.
- **4 October 2026:** Renamed from `agent-skills` to `claude-plugins` and turned into a public
  marketplace; mods added as plugins.
- **1 October 2026:** `save-context` added. Banner re-rendered with its chip.
- **30 September 2026:** One collection repository for all skills rather than one repository per
  skill, following the common pattern (Anthropic's and Vercel's skill collections).
- **30 September 2026:** MIT license. English only. Per-user values live in a config file outside the
  repo, so the published skill and its author's own copy share the same code.
- **30 September 2026:** Made public. Install commands from the README tested on a clean setup:
  marketplace add, plugin install, and a plain clone all work.
