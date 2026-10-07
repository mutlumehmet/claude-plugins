# claude-plugins

A Claude Code plugin marketplace (formerly the `agent-skills` collection). Each plugin
lives in its own folder under `plugins/` and holds either skills (folders of instructions Claude loads
when a task calls for them) or one mod (a hooks module that runs inside Claude Code). Self-contained. Fixed context lives in this file, current state in `STATUS.md`.

**To see where things stand, read `STATUS.md` first.**

## Folder layout

| Path | Contents |
|---|---|
| `.claude-plugin/marketplace.json` | The catalogue: every plugin, `"source": "./plugins/<name>"` |
| `plugins/<plugin>/.claude-plugin/plugin.json` | The plugin's manifest: name, version, description, author, settings |
| `plugins/<plugin>/README.md` | The plugin's own page |
| `plugins/<plugin>/skills/<name>/SKILL.md` | A skill: YAML frontmatter (`name`, `description`) and instructions |
| `plugins/<plugin>/skills/<name>/...` | Anything the skill needs: scripts, templates, reference files, its README, `config.example.yaml` |
| `plugins/<plugin>/hooks/` and `tests/` | A mod: `hooks.json` naming one hooks module, the module, and `claude plugin test` tests |

## Rules for every skill in this repo

- **Nothing personal, ever.** No email addresses, usernames, local paths, account names, client or
  project names, tokens, or anything that only makes sense on one person's machine. A value that
  differs between users belongs in the skill's config file, which lives outside the repo
  (`~/.config/<skill>/config.yaml`) and is never committed. Examples use neutral placeholders.
- **Works with no config.** Every setting has a sensible default. Optional integrations (a second
  GitHub account, a cloud storage folder, a project registry) are skipped cleanly when not
  configured, and the README says they are optional.
- **First run sets itself up.** A configurable skill checks whether its config file exists. If not, it
  detects what it can (cloud storage folders, `gh` accounts), asks only for the rest, and writes the
  file. It never asks again unless told to reconfigure.
- **English only**, in skill text, templates, triggers and docs.
- **No em dashes, en dashes or double hyphens** in anything written. Use commas, colons, parentheses
  or a new sentence.
- **Each plugin, and each skill, has its own README** (`plugins/<plugin>/README.md`, `plugins/<plugin>/skills/<name>/README.md`) covering what it does, first run,
  every config key (what it is for, required or optional, default, example), optional
  integrations, what it will never do, requirements and its exact install commands. GitHub shows it
  when someone opens the folder.
- **Every skill README opens with a visual**, right under the intro: a flow diagram or cover in
  `docs/images/<name>-flow.png`, in the same style as the others. It is required, not optional; a
  skill is not ready to publish without it. Make it once and reuse it for the skill's social posts.
- **Every README ends with an About section** that shows `docs/images/site-banner.png` linked to
  the author's site (in a plugin README the path is `../../docs/images/site-banner.png`, in a skill README `../../../../docs/images/site-banner.png`), then a line
  with the author, the site and the sponsor links. The site URL is in `CLAUDE.local.md`.
- **The main `README.md` stays short:** banner, intro, one table row per skill (name linking to its
  folder, one-line description), generic install, contributing, about, license. Skill details never
  go into the main README.
- Never commit `.env`, config files with real values, or OS junk (`.DS_Store`).

## Rules for every mod

- One mod per plugin (Claude Code accepts one hooks module per plugin).
- **The Arcade's games are one plugin.** Claude Code follows `$` only into functions declared in
  the module's own file and takes each event once per plugin, so the games live in
  `plugins/arcade/src/` and `plugins/arcade/scripts/build.sh` joins them into `hooks/arcade.jsx`
  (esbuild, pinned). Edit `src/`, rebuild, commit both; CI fails when they differ. A new game goes
  into the Arcade, never into a plugin of its own (see the Arcade README, "How it is built").
- **Arcade games keep nothing between sessions, and every game can be reset.** Decided 7 October
  2026, replacing the per project saves of 0.8.0 (6 October 2026): every terminal starts each game,
  the town and the pet from zero, and they last until it closes. A game keeps its state in atoms
  only and never calls `$.store`; `plugins/arcade/src/save.ts` only deletes what 0.8.4 and earlier
  saved (add a key to `OLD_KEYS` there if a game ever stops using one). Atoms are updated at the
  call site (`update($, score, old => ...)`): the engine's scan refuses a module that passes an
  atom to a helper. Every game exports `reset`, wired into `resetGame` in `src/arcade.tsx`, which
  asks first (`/<game> reset`, then `/<game> reset yes` within a minute) and clears this terminal
  only. Counting must not depend on the game being shown. No top-level `let` in `src/`: the build
  turns top-level `var` into `const`.
- `claude plugin validate` and `claude plugin test` pass before every push; CI runs both.
- **What the Anthropic Directory refuses** (found on the Arcade, 6 October 2026), though Claude Code
  accepts it: a `userConfig` field with `options` (use a plain string and document the values), and
  any variable, parameter or function named like the hook API's own names (`on`, `$`, a hook's
  `next`) used as something else anywhere in the bundled module: the directory then cannot follow
  the real `on` and `$`. Check the plugin's page on claude.ai/directory/manage after each push.
- Dialogs that guard an action list the safe choice first, so a reflexive Enter refuses.
- Everything the mod shows is English. Tests use neutral sample data.
- Bump `version` in `plugin.json` on every change, so installed copies update.

## Adding or updating a skill

1. Put it in `plugins/<plugin>/skills/<kebab-case-name>/` with a `SKILL.md` whose `description` says what it does and
   when to use it, with concrete trigger phrases.
2. Scan for anything personal before committing (see the rule above). A useful check:
   `grep -rniE "@|/Users/|/home/|token|secret" plugins/<plugin>`.
3. Test it on a throwaway target before calling it done.
4. Make the visual (`docs/images/<name>-flow.png`), write the README with it at the
   top and the About banner at the end, add the skill's row to the main README table, add it to
   `.claude-plugin/marketplace.json`, update the banner's skill chips if they list skills, and update
   `STATUS.md`.
