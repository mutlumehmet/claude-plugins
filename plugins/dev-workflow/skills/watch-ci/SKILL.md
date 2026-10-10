---
name: watch-ci
description: Watches GitHub CI for a pull request, a branch, a commit or a merge until every check on that commit has truly finished (GitHub Actions runs, check runs from other CI apps, and commit statuses such as a deploy preview), then reports GREEN or RED by itself, so the user never has to come back and say "merged" or ask "is it done?". Use this whenever a PR has been opened or pushed, whenever you hand the user a merge command to run, after any merge to the default branch, after a `gh run rerun`, or whenever anyone asks "is CI green", "what is the state of CI", "watch the CI", "watch the build", "tell me when it finishes", "let me know when the deploy is done". Prefer it over hand-written polling loops: those hit the 600 s foreground limit and miss workflows that start late.
allowed-tools:
  - Bash
  - Read
---

# Watch CI

Without this skill, watching CI means a polling loop written on the spot, run in the
foreground, cut off at 600 s, and checked only when the user asks. So the user ends up
telling the session "merged" and then asking "what is the state?". This skill replaces
that with one script run as a **background job**. Claude Code notifies the session when a
background job exits, so the result arrives on its own.

The script: `${CLAUDE_PLUGIN_ROOT}/skills/watch-ci/scripts/watch.sh`

## How to run it

Always with the Bash tool's `run_in_background: true`. In the foreground it would be cut
off at 600 s, and a CI run with end to end tests easily takes 20 minutes or more.

| Moment | Command |
|---|---|
| You just gave the user a merge command for PR N | `watch.sh N --merge` (waits for the merge itself, then watches the merge commit) |
| A PR was opened or pushed | `watch.sh N` |
| Something just merged, or after a rerun on the default branch | `watch.sh` |
| A branch | `watch.sh <branch>` |
| One specific commit | `watch.sh <sha>` |

Options:

| Option | What it does | Default |
|---|---|---|
| `--repo owner/name` | The repository to watch | The repo of the current folder (`gh repo view`) |
| `--gate-job NAME` | A job that only fails because another job failed (a "gate" job that sums up the others). It is skipped when explaining a failure. Repeatable. | none |
| `--timeout MIN` | Give up watching CI after this many minutes | 60 |
| `--merge-timeout MIN` | Give up waiting for the merge after this many minutes | 240 |
| `--interval SEC` | Seconds between polls | 20 |

**Check which repo you mean.** The default is the repo of the folder the session runs in.
If the code being merged lives in a different repo (a notes folder that is its own repo, a
monorepo checkout elsewhere), pass `--repo` explicitly. If a project's `CLAUDE.md` names a
repo or gate jobs for this skill, use them.

**The `--merge` form is the point of the skill.** Start it in the same turn you hand over a
merge command. The user then only runs the merge; the session learns about the merge and
the result without them saying anything.

Tell the user in one line that the watch is running, then stop. Do not poll it yourself or
read the output file in between: the notification will come.

## What it waits for, and why

- Everything GitHub knows about the commit, from three sources:
  1. **Workflow runs** (GitHub Actions) reach `completed`.
  2. **Check runs** from other CI apps (CircleCI, Buildkite, Codecov, a deploy app) reach
     `completed`. Actions jobs are check runs too; they are counted once, through their run.
  3. **Commit statuses** (deploy previews and older integrations) leave `pending`.
- Two quiet polls in a row before it calls it done, because some workflows only start after
  another finishes (for example a smoke test that runs once the deploy reports).
- A rerun counts: a run that goes back to `in_progress` keeps the watch open.
- Dependabot update jobs (event `dynamic`) also run against the default branch's commit and
  are often red for reasons unrelated to the change (`security_update_not_possible`, the
  cooldown). They are listed but never decide the verdict.
- Nothing reported at all after 4 minutes means CI will never run (no workflow triggers on
  this branch, the workflow is disabled, or the Actions quota is spent). It stops there
  instead of waiting forever.

## Reading the result

The last line always starts with `WATCH RESULT:`. Exit 0 = GREEN, 1 = RED, 2 = no CI,
timeout or error.

- **GREEN**: say so in one sentence with the commit. If other sessions or agents are
  waiting on this merge, tell them now (for example with SendMessage).
- **RED (likely infrastructure)**: only a setup, install, download or cache step failed, so
  no test ran (for example a tool download returned HTTP 500). Give the user the printed
  `gh run rerun ... --failed` command to run, then start the same watch again in the
  background straight away.
- **RED**: a real check failed. Name the job and step it printed, read that job's log
  (`gh run view <id> --log-failed`), and explain before suggesting anything. For a failed
  check run or status from another app, open the link it printed. Do not rerun a real
  failure hoping it goes away.
- **NO CI / TIMEOUT / ERROR**: report it as is. Never turn it into "probably fine".

## Boundaries

The script only reads. Merges, reruns and dispatches stay with the user.

## Requirements

`gh` (GitHub CLI), signed in with read access to the repository. Bash and `awk`, present on
macOS and Linux.
