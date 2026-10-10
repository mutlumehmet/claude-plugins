# claude-plugins: current state

**11 October 2026 (new plugin `dev-workflow` 0.1.0, skill `watch-ci`):** a new skills group for shipping code, the public twin of the private `dev` group (code-cleanup and ux-ideation are candidates). `watch-ci` was a private, single repo copy, made generic: repo from the current folder (`gh repo view`) or `--repo`, the default branch instead of `main`, `--gate-job NAME` for a job that only sums up the others, and check runs from other CI apps read next to Actions runs and commit statuses (Actions' own check runs left out so nothing counts twice). NO CI now looks at all three sources, so a commit with only a deploy status is no longer called NO CI. No config file. Tested read only: GREEN on this repo and on a public repo with a third-party check, RED on a failed commit here, NO CI after 4 min on a repo without workflows (run as a background job, the notification arrived), and the error paths (outside a repo, unknown option, unknown commit). Moving diagram `docs/images/watch-ci-flow.gif` (and PNG), source kept outside the repo. Known gap: the terminal film for posts is not made yet.

**10 October 2026 (the sounds mod 0.1.6 and 0.1.7, pushed `abf6bd6` and `4804ea8`, CI green):** the prompt clip plays on every prompt (`/sounds rest <minutes>` adds a wait, counted from this terminal's own last prompt clip only); `/sounds default <pack>` switches every open terminal and every new one through a shared `all-terminals.json` beside `last-played`, read before each sound; `/sounds project <pack>` (and `project`, `project off`, `project clear`) gives a folder and the folders inside it its own pack through `projects.json`, so the sound says which project needs you; who wins: the terminal's own pick, then the project, then the default. `/sounds` shows status, moments, commands, packs last. 26 tests. Updating, from the docs: the `/plugin` Marketplaces tab's Update marketplace (`u`, Enter) updates the installed plugins and reloads; the shell `claude plugin marketplace update` only refreshes the listing; auto-update is off by default for this marketplace and can be enabled per marketplace in that tab.

**8 October 2026, night (the sounds mod 0.1.0, `/sounds`, new, not pushed):** sound packs for the moments that need you (prompt sent, permission prompt, a turn of 60 s or more, subagent done, failed test or build, git push, compaction). Packs: aoe (default; Age of Empires II, credited under Microsoft's Game Content Usage Rules), aoe-turk (the Turkish villager, the same rules, original Ogg files from Yusuf Kinatas's openpeon pack), terran and protoss (StarCraft, Blizzard), red-alert (Red Alert 2, EA), peon (Warcraft III, Blizzard), necromancer and diablo (Diablo II voice and effects, Blizzard), duke (Duke Nukem 3D, Gearbox), rick-and-morty (family-friendly lines, Warner Bros. Discovery, from Mr3zee's openpeon pack under CC BY-NC 4.0), rick-and-morty-uncut (the swearing lines from Mr3zee's mature pack, slurs and real-tragedy jokes left out) and meeseeks (kasperhendriks's openpeon pack, CC BY-NC 4.0), blood (Blood, Monolith, now Atari) lich, cabal, yuri, abathur, tauren, engineer, counterstrike, stronghold, sheogorath and lebowski (clean lines), all original files from openpeon packs, credited as fan use, and nasa (NASA radio on Wikimedia Commons, public domain). The game clips are the original MP3s from 101soundboards boards, unchanged, picked by title and play count; each CREDITS.md names the board, every source file and the rights holder, says it is not licensed, fan use, non-commercial, and that a pack goes on request. This was the owner's decision after being told the risk (a DMCA notice disables the whole repo, and files stay in git history). Replaced the first draft's eight CC0 packs and two voice packs the same night; the voice pack code stays with an empty `VOICE_PACKS`. `sounds/<pack>/pack.json` plus `CREDITS.md` per pack; `scripts/packs.py` writes the `FILE_PACKS` table and CI checks it. Your own packs load from `~/.config/<plugin>/packs/<name>/` and play from their bytes. `/sounds` command, `/sounds default <pack>` in the store, the terminal's pack in a module variable (no plugin name in code). 8 tests, validate passes. Banner and both README films (MP4 with sound, aoe audio in the how film) re-rendered with the new packs.

**8 October 2026, evening (`arcade` 0.10.2, update notice):** the small dim ⟳ told nobody a new version was out. Now each terminal, at `session.start` (unawaited, never on a timer), reads the Arcade's own `plugin.json` on GitHub (`raw.githubusercontent.com/<repo from our plugin.json repository>/main/plugins/arcade/.claude-plugin/plugin.json`, through `$.http.fetch`) and compares versions. Newer: atom `latest` set, the band shows a yellow `●` and a full strength `⟳ update 0.x.y` button, the ☰ menu row lights too, and a toast says so once per version per account (store key `toldVersion`). An update or an up to date answer clears it. `/arcade update check off|on` (store key `updateCheck`). Offline or GitHub down: silent. PRIVACY.md and the Arcade README name the request; the mod rule in `CLAUDE.md` changed from "never a background check" to "found at start, installed on press". 78 tests (three new; the tests wait real ticks because the check is unawaited), tsc, validate and build check pass. Pushed (`cbeed0e`, CI green), both accounts updated to 0.10.2. Seen live: a `--plugin-dir` copy lowered to 0.10.0 showed `● ⟳ update 0.10.1` and the toast. Known gap: users still on 0.10.1 have no check, so they learn of 0.10.2 only by updating by hand; the notice works from the next release on.

**8 October 2026, later (`arcade` 0.10.1, README visuals):** a ⟳ button in the row above the game (and at the foot of the ☰ menu, and `/arcade update`) runs Claude Code's own `claude plugin update arcade` (bare name; the marketplace name is on the personal list outside READMEs) through `$.process.run`, only when pressed (no background check, so PRIVACY.md still holds; a line there says what ⟳ runs), reports up to date, updated (then fills `/reload-plugins` into the prompt) or could not run. Auto-update is off by default for this marketplace, which is why the button exists; the Arcade README's Quick start says how to turn it on. 75 tests; seen live (`/arcade update` said up to date). Main README: Toolkit and Skills became two-across card grids with the tools' film GIFs at 360 px (`docs/images/*-film.gif`, from the 8 October carousel) and the skill flow PNGs; Arcade strips one per row at 800 px, measured at GitHub's README width. Possible Directory note: "runs programs".

**8 October 2026 (`arcade` 0.10.0, onboarding):** a friend's first install showed three problems: a 7 field settings screen after the scope question (the `userConfig`), a random first game (Outlaw), and nothing saying how to switch. Now: no `userConfig` at all, so install is add the marketplace, pick a scope, done; the game choice (`setting`) and the moments keys (`moments`, set with `/arcade moments <key> <value>`) live in the plugin store per config directory, with 0.9.0 `pluginConfigs` values read only as a fallback. Default is Octo Invader in every terminal (`GAMES` reordered, octopus first; default mode `fixed`). Above the game a row of small buttons, `◀ <game> ▶ ☰`, plus `☆ make default` when the game on screen is not the default; `☰` or `/arcade` opens a game menu pane (`arcade-menu`, a name plays it, ☆ sets the default); `/arcade default <game>`, `/arcade help`. A welcome toast in an account's first session and a dim hint for its first three (store key `welcome`). Controls sit above the game because a short terminal scrolls the band and cuts the bottom. Both READMEs restructured: contents line, the Arcade first in the main README with install, switching and a GIF gallery of every game (rule added to `CLAUDE.md`); the Arcade README has Quick start, The games, Switching games, Game guides in menu order, Tuning the moments. 73 tests, tsc, validate and build check pass; seen live in a 130x45 terminal through `--plugin-dir` (rendered with @xterm/headless). Known gap: the GIFs predate the buttons.

**7 October 2026 (pushed, `76b2f7e`, CI green):** `arcade` 0.9.0. No saved scores any more: every terminal starts each game, Block Town's town and Tama's pet from zero, kept in atoms until it closes (replacing the per project saves of 0.8.0). `src/save.ts` only deletes the 0.8.4 and earlier keys once at session start; resets ask first and clear this terminal only. Block Town: animals and creepers drawn last on their own layer, a mob's top pixel no longer shares a half block cell with tree leaves (the thin line across its head), no text over a mob; checked on a frame rendered offline from the game's own code. 69 tests pass, tsc clean, validates. Installed 0.9.0 (restart or `/reload-plugins` to load).

**6 October 2026, late afternoon (pushed, `94edbe0`, README GIFs `f9afc94`):** `arcade` 0.8.0. Tenth game Block Town (`/town`, `src/games/block-town.tsx`): a side view block town your agents build, kept and merged between terminals. Every game now keeps its values per project through `src/save.ts` (repository root, worktrees share the main one, keys `<key>@<hash>`, saves as changes of the stored value, scores from before 0.8.0 moved once to the home folder's project, projects forgotten after 90 days); every game exports `reset` (`/<game> reset`, then `/<game> reset yes` within a minute; `/arcade reset` for all); every game's help lists its preview moves (`PREVIEWS` in `src/arcade.tsx`). No polling between terminals, on purpose: another terminal's points show with its next save. The rule for future games is in CLAUDE.md. 0.7.0 (`d878823`, same day): ninth game Dario (`/dario`), a side scroller. 69 tests pass, validates, tsc clean, CI green; both accounts on 0.8.0. Engine lessons: atoms must be named at the read/update call site, a top-level `let` in `src/` breaks (the build makes it `const`), store values come back frozen.

**6 October 2026, evening:** `arcade` 0.6.0: eighth game, Bug Command (`/bugs`, `src/games/bug-command.tsx`), a Missile Command style strip the full width of the band: bugs fall on six cities while Claude works, finished tool calls and moments fire the counter missiles, a failed tool drops a fast bug. First Arcade game you can play along with: the sky is a `Client` (`src/clients/bug-sky.tsx`, built by `scripts/build.sh` into `hooks/bug-sky.js`) that takes clicks (fire from the nearest silo) and, after a click, keys (arrows, space, 1 2 3, Esc). It runs the game loop; the hooks side hands it session events through the `bugsFeed` atom and keeps the score it posts back (`ui.message`). Checked live in a terminal with `claude --plugin-dir` (that copy wins over the installed one). 55 tests pass, validates, tsc clean.

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
