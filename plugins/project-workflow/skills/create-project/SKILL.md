---
name: create-project
description: Sets up a new project folder the same way every time, for code or for a folder of notes and documents, so any later agent session can find its way around without being told. Asks the few questions that change the layout (code or notes, docs language, heavy files, git remote, what is sensitive, optionally which account), then creates the folder, an optional assets/ symlink into synced cloud storage that git never sees, CLAUDE.md for what never changes and STATUS.md for where things stand, and optionally a private GitHub repo on the right account. Use whenever a new project folder is being started, for work or personal life. Triggers on "create a project", "new project", "set up a project folder", "scaffold a project", "start a new folder for", "make this a project", "set this up like my other projects".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - AskUserQuestion
---

# Create a project

Sets up a new folder under the projects root that looks and behaves like the user's other
projects, so a future session can find its way around without being told.

Everything that differs between people (where projects live, which cloud folder holds heavy files,
which GitHub accounts exist, optional integrations) comes from a config file. The rest of this skill
is the same for everyone.

## Step 0: Load the config, or set it up once

The config lives at `$CREATE_PROJECT_CONFIG` if set, otherwise `~/.config/create-project/config.yaml`.

```bash
CFG="${CREATE_PROJECT_CONFIG:-$HOME/.config/create-project/config.yaml}"; test -f "$CFG" && cat "$CFG"
```

- **It exists:** read it and go to Step 1. Do not ask setup questions again.
- **It does not exist:** this is the first run. Set it up, then continue with the project the user
  asked for. `config.example.yaml` next to this file documents every key.

First-run setup. Detect first, ask only what detection cannot answer, in one question round:

1. **Projects root.** Suggest `~/Projects`.
2. **Cloud storage for heavy files.** List the synced folders that exist:
   `ls ~/Library/CloudStorage/ 2>/dev/null` (macOS: OneDrive, Google Drive, Dropbox), plus
   `~/Library/Mobile Documents/com~apple~CloudDocs` (iCloud Drive), `~/Dropbox`, `~/OneDrive`,
   `~/Google Drive` if present. Offer each, plus "none". If one is chosen, suggest
   `<that folder>/project-assets` as `storage.path` and set `storage.label` to its name.
3. **GitHub.** Run `gh auth status 2>&1`. Record the logged-in accounts in `github.accounts`. If
   there is more than one, ask which is the default for new repos. If `gh` is missing or logged
   out, leave `github` empty: projects get local git only until they set it up.
4. **Doc languages.** Ask which languages they write project docs in. Default: English.
5. **Optional integrations.** Ask once whether they use a per-folder Claude account tool or keep a
   single file listing all their projects. Most people do not: default to leaving both empty.

Write the answers to `$CFG` (create the folder with `mkdir -p`), keeping the comments from
`config.example.yaml`. Show the user the file path and say they can edit it any time, or ask to
"reconfigure create-project" to run this again.

Treat every key as optional. A missing or empty value means: use the default, or skip that step.

## Step 1: Ask these, in one question round where possible

Do not scaffold before the answers are in. Each of these changes the output.

1. **Name and location.** Default `<projects_root>/<kebab-case-name>`. The name also becomes the
   storage folder name and the GitHub repo name, so settle it before anything is created.
2. **Kind:** a dossier (notes, records and documents), code, or a hybrid (code that also
   accumulates heavy media). For code, ask the stack and prefer a real scaffold command
   (`npx create-next-app@latest`, `uv init`, `cargo new`) over hand-made files.
3. **Language of `CLAUDE.md` and `STATUS.md`**, from `languages` (first one suggested). If it is not
   English and `offer_claude_language` is true, also ask whether the agent should answer in that
   language inside this folder, which means writing `language` into `.claude/settings.local.json`.
   In Claude Code that one key also sets voice dictation; say so.
4. **Assets folder:** yes or no, and which subfolders. Only offer this when `storage.path` is set.
   Say yes whenever the project will accumulate PDFs, scans, receipts, contracts, exports, audio or
   video. Say no for pure code with no binaries.
5. **Git:** none, local only, or a GitHub repo (only if `gh` is set up). Default to
   `github.visibility`, which should normally be private. Never create a public repo unless the user
   explicitly asks for it: project folders routinely carry personal and financial context.
6. **Sensitivity.** What will this project hold that must never reach a remote (bank details, tax
   numbers, medical records, employment correspondence, client contracts, credentials)? The answer
   decides what goes in `assets/` versus the tracked tree, and it goes into `CLAUDE.md` as a rule.
7. **Claude account** (only if `claude_accounts.command` is set): which of `claude_accounts.accounts`
   this folder belongs to.

Worth asking when it is not obvious from the above:

8. **Topic subfolders.** For a dossier, the top-level folders are the spine of the project. Get them
   from the user rather than inventing a taxonomy. Each one mirrors into `assets/`.
9. **Lifespan.** A folder should live exactly as long as the work or obligation it holds (a tax
   obligation can outlive the job that created it). If the new project's lifespan differs from a
   neighbouring one, that is the reason it is separate, and it is worth a paragraph in `CLAUDE.md`.
10. **A companion skill.** Recurring work in a dossier (a monthly invoice, a quarterly return) tends
    to become a skill of its own. If the user describes one, offer it, but do not write it as part of
    this scaffold.
11. **`.mcp.json`.** Only if the project talks to a service through an MCP server.

## Conventions

**`assets` is always a symlink and always gitignored.** It points into
`<storage.path>/<project>/assets`, is machine-specific, and holds the sensitive material. Nothing
under it may be committed, and `CLAUDE.md` must say so in words.

**`setup-assets.sh` is committed, executable, and idempotent.** It recreates the symlink on a fresh
clone and creates the subfolders, which mirror the repo's own folder names. `scaffold.sh` writes it.

**GitHub account check.** `gh repo create` silently uses whichever account is active. If
`github.accounts` lists more than one account, check before creating:

```bash
gh auth status
```

If the active account is not `github.default`, switch first:

```bash
gh auth switch --hostname github.com --user <github.default>
```

Then `gh repo create <name> --<visibility> --source=. --remote=origin --push`, default branch
`main`, and confirm the owner with `gh repo view --json owner,isPrivate`. Undoing a repo created
under the wrong account needs the `delete_repo` token scope, which is usually not granted, so check
first rather than fix later. With a single account, skip the check.

**`.gitignore` floor:** `assets`, `.DS_Store`, `.AppleDouble`, `.LSOverride`, `~$*`, `.env`,
`.claude/settings.local.json`. The last one is personal and machine-specific by definition; the
committed `.claude/settings.json` is the one a project may share.

**Per-project language.** `.claude/settings.local.json` with `{"language": "<language>"}` scopes the
setting to that folder alone: settings load user, then project, then local, so it never touches the
user's global settings or any other project. Never write `language` into global settings.

## The two documents

`CLAUDE.md` holds what does not change. `STATUS.md` holds what does. The split is the whole point:
a session reads `STATUS.md` first to find out where things stand, and `CLAUDE.md` only when it needs
background. Say that explicitly at the top of `CLAUDE.md`.

**Templates.** If `templates_dir` is set and contains `CLAUDE.<language>.md` / `STATUS.<language>.md`
(language in lower case), use those. Otherwise use `templates/CLAUDE.md` and `templates/STATUS.md`
next to this file, translated into the chosen language if it is not English.

`CLAUDE.md` needs, at minimum:

- One paragraph on what the folder is for, and why it is a separate folder.
- **Folder layout table:** each top-level folder and what belongs in it.
- The `assets/` rule, including `./setup-assets.sh` for a fresh clone (if there is an assets folder).
- **Who and what:** the parties, references, numbers, dates.
- Working rules specific to the project.

`STATUS.md` needs:

- **Last updated** with an absolute date.
- An at-a-glance table of state.
- Next actions, ordered.
- A decision log, so the reasoning behind a layout choice survives.

Large dossiers can nest this: each topic folder gets its own `CLAUDE.md` and `STATUS.md` and the root
keeps a routing index. Do that when there are more than about four substantial topics, not by default.

## Steps

1. **Load the config** (Step 0) and **ask the questions** (Step 1). Confirm the exact path before
   creating anything.
2. **Check the name is free**, in the projects root and, if an assets folder is wanted, in
   `storage.path`. If a folder exists, stop and ask; never merge into or overwrite an existing project.
3. **For a code project, run the real scaffold first** and layer the conventions on top. Do not
   hand-write a framework's files.
4. **Run `scaffold.sh`** (next to this file) with the answers. Read it first so you know what it does.

   ```bash
   bash <skill-dir>/scaffold.sh --name <name> --path <projects_root> \
     [--folders "a b"] [--storage-base "<storage.path>" --assets "a b"] \
     [--git none|local|private|public] [--env] [--mcp] [--claude-lang <language>]
   ```

   It creates folders, `.gitignore` and `setup-assets.sh`, runs it, and initialises git. It never
   creates a remote.
5. **Write `CLAUDE.md` and `STATUS.md`** from the templates, in the chosen language. Fill in only
   what the user actually said.
6. **Mark unknowns as unknown.** Never invent a company number, tax reference, rate, deadline,
   address or date to make a table look finished. Write "unknown" (in the docs' language) and note
   where the real value comes from. A plausible wrong figure in a tax or contract folder is worse
   than a gap.
7. **Commit**, message in the project's language, with whatever attribution the session requires.
8. **Create the remote** if asked (see the GitHub account check), then verify: `gh repo view --json
   isPrivate,owner`, `git ls-files` to confirm nothing sensitive is tracked, and
   `git check-ignore -v assets` if there is an assets folder.
9. **Assign the Claude account** (only if `claude_accounts.command` is set): run the command with
   `{path}` and `{account}` filled in, then confirm it took effect.
10. **Add a row to the registry** (only if `registry.file` is set): one row for the new folder,
    filling `registry.columns`, committed separately if that file lives in its own repo. Run
    `registry.check_command` afterwards if it is set.
11. **Report** the tree, the repo URL and privacy, any account assignment and registry row, and the
    list of things left blank for the user to fill in. Then stop. Do not start populating the
    project with content.

## Things to get right

| Trap | What to do |
|---|---|
| **Committing `assets/`.** | Confirm `git check-ignore -v assets` before the first push, and `git ls-files` after. This is the one mistake that leaks bank details to a remote. |
| **Creating a public repo.** | Private unless the user explicitly says public. |
| **Repo lands under the wrong GitHub account.** | With more than one account, run `gh auth status` and switch to `github.default` before `gh repo create`, then confirm the owner. |
| **An assets symlink that points at nothing.** | `scaffold.sh` creates the target folder itself. Verify with `ls -la assets/` that it resolves to a real directory. |
| **Inventing facts to fill a table.** | Mark unknown, say where the value comes from. |
| **Guessing the language.** | Ask. Mixing languages inside one project reads badly. |
| **Writing `language` into global settings.** | It belongs in the project's `.claude/settings.local.json` only. |
| **Inventing a folder taxonomy for a dossier.** | The subfolders are the user's mental model of the work. Ask. |
| **Relative dates.** | Absolute always: "September 2026", not "last month". Documents get `YYYY-MM-DD-short-description.pdf`. |
| **Overwriting an existing folder.** | Stop and ask. |
| **Asking setup questions every time.** | Only when the config file is missing, or the user asks to reconfigure. |
| **Scaffolding before the questions are answered.** | The answers change the layout, so a redo means deleting work. |

## Out of scope

- **Populating the project.** This skill creates the shell. Content comes after.
- **Writing companion skills.** Offer, then do it as a separate job.
- **Deploying.**
- **Moving an existing project into this shape.** Doable with the same conventions, but check what
  is already tracked in git before adding an `assets` ignore rule, because history is not fixed by a
  `.gitignore` entry.
