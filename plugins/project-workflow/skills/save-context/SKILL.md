---
name: save-context
description: Saves what a working session decided, changed, learned or left open, so the next conversation starts with it already in context. Discovers what the project keeps (STATUS.md, CLAUDE.md, the agent's memory files, registers, context folders), maps each item from the conversation to the one place it belongs, shows the user the plan in one list, writes it after approval (or straight away when the config turns approval off), hands items to other skills that own a destination, and commits only the files it touched without pushing. Works in any project. Use at the end of a session, or as a checkpoint before switching to a different task. Triggers on "save context", "save-context", "wrap up", "wrap-up", "close the session", "did you update everything", "update status and memory", "save the context", "before we close", "before I close this", "handoff", "checkpoint", "make sure the next session knows".
allowed-tools:
  - Read
  - AskUserQuestion
  - Edit(**/STATUS.md)
  - Edit(**/CLAUDE.md)
  - Write(**/memory/*.md)
  - Edit(**/memory/*.md)
  - Bash(ls:*)
  - Bash(git rev-parse:*)
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git add:*)
  - Bash(git commit:*)
---

# Save context before closing a session

The goal is one thing: **a fresh session, reading only what the project already tells it to read,
must know everything from this conversation that matters later.** Anything that only mattered
inside this conversation stays out.

Pre-approved tools are kept narrow on purpose: reading, edits to STATUS.md, CLAUDE.md and the
memory folder, and the read and commit git commands. Anything else (a register, another skill, a
push) asks the user first, which is the intended behaviour, not an error.

## Step 0: Load the config (optional)

The config lives at `$SAVE_CONTEXT_CONFIG` if set, otherwise `~/.config/save-context/config.yaml`.

Read that file with the Read tool if it exists (expand `~` to the home folder).

Every key is optional and the skill works with no file at all, so there is no setup round. If the
file is missing, use the defaults below and carry on. `config.example.yaml` next to this file
documents each key.

| Key | Default | Effect |
|---|---|---|
| `tasks_skill` | empty | Skill that records dated promises and to-dos (for example a Notion or Todoist task skill). Empty: such items go to STATUS.md under next steps |
| `commit` | `true` | Commit the touched files at the end. `false`: leave them uncommitted and say so. Pushing never happens either way |
| `confirm` | `true` | Show the plan and wait for approval (Step 4). `false`: write everything straight away with no question, for users who say "save context" and walk away from the session |

## Step 1: Discover what this project keeps

Do not assume a layout. Find it.

Run these from the project folder (where the session started):

```bash
git rev-parse --show-toplevel
git status --short
ls
```

`ROOT` is the first line, or the current folder if it is not a git repo. The per-project memory
folder is `<config dir>/projects/<ROOT with every / replaced by ->/memory`, where the config dir is
`$CLAUDE_CONFIG_DIR` or `~/.claude`; list it with `ls`. That is where Claude Code keeps per-project memory. If the environment uses a different memory
location or format (its system prompt will say), follow that instead.

Then read, in this order:

1. The project's `CLAUDE.md` (and any nested one it points to). It names the files that carry
   state, the reading order, language rules, and which files are canonical vs mirrors or
   superseded. **Its rules override this skill** (for example: shared docs in one language and
   private notes in another; a folder that is an export and must not be edited; counts verified by
   a script).
2. `STATUS.md` if it exists.
3. `MEMORY.md` in the memory directory, plus any memory file whose description touches what this
   session worked on.
4. Every other context file the CLAUDE.md reading order names (registers, release logs, "where we stand"
   summaries, context folders such as `context/`, `docs/`, `notes/`). Only the ones this session
   could have made stale.

Note which files were already modified or untracked before you started. They are not yours to
commit (Step 6).

If the project has no STATUS.md and no CLAUDE.md, say so in the plan and propose creating
STATUS.md only. Never invent a CLAUDE.md without asking.

## Step 2: Harvest the conversation

Go through the whole conversation, including anything compacted into a summary, and list every
item of these kinds:

- **Decisions** made, reversed, or deferred, with the reason.
- **State changes**: things built, fixed, deployed, sent, closed, measured. Include identifiers a
  later session needs (dates, ids, URLs, PR numbers, counts).
- **New facts** about the project, the system, people, or constraints.
- **Corrections and preferences** the user gave about how to work. These become memory.
- **Open threads**: what is next, what is blocked and on whom, what was promised to someone.
- **Traps discovered**: things that looked one way and were another.

Then drop anything a fresh session can already get from the code, git log, or existing files, and
anything that only mattered for this conversation.

## Step 3: Route each item

| Item | Goes to |
|---|---|
| Where things stand, what is next, open threads, blockers | `STATUS.md` |
| How the user wants the agent to work: corrections, confirmed approaches | memory, type `feedback` |
| Lasting non-obvious project facts, constraints, traps | memory, type `project` or `reference` |
| A lasting rule or decision that every session must obey | `CLAUDE.md` (rare; routine progress never goes here) |
| A row in a project register (findings, decisions, incidents) | the register, through its owning skill if one exists |
| Something that shipped this session: a capability, a fix, a hardening, or a document delivered to someone | the project's release log, if it has one, through its owning skill if one exists |
| A summary or context file this session made stale | that file, edited in place |
| A dated promise to someone, a thing to do later | `tasks_skill` if set, otherwise STATUS.md next steps |

Rules for routing:

- **Owning skills first.** A skill owns a destination when its description says it writes there
  (a findings register, a task list, a ticket tracker). List the item as "hand to <skill>" and
  invoke that skill after approval (it is not pre-approved, so Claude Code asks first). Never hand-roll what a skill does, because it may keep two
  places in sync or apply checks you would skip.
- **One home per fact.** If the project separates registers from tasks (a fact vs a promise), keep
  each item in exactly one place.
- **A release log is not a copy of the register.** The register says what is wrong and whether it
  is fixed; the release log says what shipped, on what date, in which category, and whose work it
  was. A fixed finding can earn a line in both, and its owning skill usually writes both. Work that
  is not a finding at all, such as a plan, a specification, an audit or a runbook, has no register
  row, so the release log is its only dated record and the easiest thing to lose. Catch it here.
- **Record whose work it was.** Every release log line names who built the thing, so the log can
  answer "what did I ship last month" even when other people work in the same repo.
- **Update, don't duplicate.** If an existing memory or STATUS line covers it, change that line.
  Delete memories this session proved wrong. Fix a stale line rather than appending a contradicting
  one below it.
- **Absolute dates.** Turn "today", "tomorrow", "Thursday" into real dates.
- **Superseded files** keep their banner and are not edited back into life.

## Step 4: Show the plan, once

Present one compact list, grouped by destination, each line saying what will change:

```
STATUS.md
  - "Now": cutover moved to 14 Oct, with the reason
  - "Next": waiting on the client for sign-off
Memory
  - new feedback: recommend one option, not a menu (feedback_recommend_one.md)
  - update project_env_count.md: 8 environments, not 6
Register (via findings-log)
  - Red: nightly backups not running since 3 Sep
Nothing to save
  - the typo fix in a throwaway script
```

Always include the "Nothing to save" group, so the user can pull something back in. If there is
nothing to save, say "Nothing new to save, everything is already recorded" and stop.

Ask with `AskUserQuestion`: write all / let me adjust / skip. Do not write before the answer. This
step is the point of the skill: the user sees what will be remembered, and can catch a wrong or
missing item while the conversation is still fresh.

**When `confirm: false`:** do not show the plan and do not ask anything. Saying "save context"
already was the approval, and the user has often left the session by then, so a question would sit
unanswered and nothing would get saved. Go straight to Step 5 and treat it as "write all". The plan
list moves into the Step 7 report instead, so the user still sees what was remembered when they come
back. The same applies to everything after this point: never stop to ask. When an item is unsure,
save it (the user can delete a line more easily than recover a lost fact); when a handoff to another
skill would itself need the user's input, skip that handoff and record the item in STATUS.md as
pending, as Step 5 describes.

## Step 5: Write

Order matters, because STATUS.md should describe what actually happened, not what was planned:

1. **Run the owning skills first** (register rows, tasks). They often assign something the other
   files should cite, such as a register ref or a task link.
2. **Then write the files**, citing those results. If a handoff was declined, failed, or could not
   run, put it in STATUS.md under next steps as still pending (for example "backup finding not yet
   in the register"). Never write that something is "tracked in the task list" or "in the register"
   unless that handoff actually succeeded, because the next session will trust the sentence and not
   check.

While writing:

- **Re-read each file immediately before editing it.** Another session may have written to it since
  Step 1. Address table columns by header, not position. If the project has a check script for a
  file (its CLAUDE.md will name it), run it after editing.
- Follow the project's language rules per file.
- **Touch only the lines this session changed.** Do not restyle, reflow or "fix" untouched lines,
  even to apply a style rule; it hides the real change in the diff and can collide with another
  session's edit.
- STATUS.md: keep it a current picture, not a diary. Rewrite the sections that changed; move
  finished items out of "next" instead of piling up history.
- Memory files, one fact per file, named `<type>_<slug>.md`:

  ```markdown
  ---
  name: <short-kebab-case-slug>
  description: <one-line summary, used to decide relevance during recall>
  metadata:
    type: user | feedback | project | reference
  ---

  <the fact>

  **Why:** <reason>  (feedback and project types)
  **How to apply:** <what to do differently>
  ```

  Link related memories with `[[slug]]`, and add or update a one-line pointer in `MEMORY.md`:
  `- [Title](file.md): hook`.

## Step 6: Commit, never push

Skip this step if `commit: false` or the folder is not a git repo. Memory lives outside the repo
and is not committed.

```bash
git status --short
git diff --stat
```

- Stage **only the files this run touched**, by name. Never `git add -A`. Files that were already
  modified or untracked before you started (Step 1) belong to the user or another session: leave
  them, and mention them in the report.
- If a file you touched also carries someone else's uncommitted changes, do not commit it; say so.
- Commit message: one line on what the session did, in the repo's usual style, plus any attribution
  lines the environment asks for.
- Never push.

## Step 7: Report

Three or four lines: what was written where, the commit hash, anything left uncommitted and why,
and anything handed to another skill that is still waiting on the user. With `confirm: false`, put
the full Step 4 list here (including "Nothing to save"), since the user never saw it. Then stop.

Keep the plan and the report short, one line per item, and follow the user's own style rules from
their global instructions.
