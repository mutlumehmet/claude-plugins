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

## Run it through the skill every time

Invoke this skill each time you watch CI, even if you ran `watch.sh` earlier in the same
conversation. Take the script path from the base directory shown when the skill loads.

The installed path contains the plugin's version (`.../dev-workflow/<version>/...`). A path
remembered from earlier, or carried over in a summary after the context was compacted, keeps
pointing at the old version once the plugin updates, so the watch runs an outdated script or
fails on a missing file. Invoking the skill also reloads these instructions, which may have
changed since you last read them.

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
| `--gate-job NAME` | A job that only fails because another job failed (a "gate" job that sums up the others). It is skipped when explaining a failure, and GREEN needs it to have passed on the commit: a gate that has not reported keeps the watch waiting (until the timeout). Repeatable. | none |
| `--superseded-step NAME` | A step of a gate job that fails only because a newer commit exists (for example a rule that lets only the branch's newest commit deploy). If that step is the only failure, the verdict is SUPERSEDED instead of RED. Repeatable. A cancelled run needs no option: it is SUPERSEDED by itself when a newer commit exists. | none |
| `--gated-status NAME` | A commit status that fails only because the gate job failed (for example a deploy that waits for the gate before going live). While a gate job has failed it does not change the verdict, so a superseded or infrastructure failure keeps its own verdict; otherwise it is a real failure. Repeatable. | none |
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
- A workflow run, once seen, never disappears. GitHub's list of runs for a commit sometimes
  comes back empty or short for a few minutes while CI is still going; such a poll is logged
  as a bad read and never counts as quiet, so it cannot produce a GREEN.
- With `--gate-job`, GREEN also needs that job to have passed on the commit. A failure
  anywhere still reports RED at once.
- Dependabot update jobs (event `dynamic`) also run against the default branch's commit and
  are often red for reasons unrelated to the change (`security_update_not_possible`, the
  cooldown). They are listed but never decide the verdict.
- Nothing reported at all after 4 minutes means CI will never run (no workflow triggers on
  this branch, the workflow is disabled, or the Actions quota is spent). It stops there
  instead of waiting forever.

## Reading the result

The last line always starts with `WATCH RESULT:`. Exit 0 = GREEN, 1 = RED, 2 = no CI,
timeout or error, 3 = SUPERSEDED.

- **GREEN**: say so in one sentence with the commit. If other sessions or agents are
  waiting on this merge, tell them now (for example with SendMessage).
- **RED (likely infrastructure)**: only a setup, install, download, cache or service-start step
  (such as starting a local database stack) failed, so no test ran (for example a tool download returned HTTP 500). Give the user the printed
  `gh run rerun ... --failed` command to run, then start the same watch again in the
  background straight away.
- **RED**: a real check failed. Name the job and step it printed, read that job's log
  (`gh run view <id> --log-failed`), and explain before suggesting anything. For a failed
  check run or status from another app, open the link it printed. Do not rerun a real
  failure hoping it goes away.
- **SUPERSEDED**: not a failure. Either the only thing that failed is the
  `--superseded-step`, or the run was **cancelled** (for example by a newer push to the same
  branch, with `cancel-in-progress`), and in both cases a newer commit now heads the branch
  (or the PR). A `--gate-job` that still ran (`if: always()`) and failed only because the
  suite was cancelled counts as part of the cancel. Say so, then **watch the newer commit
  (the result prints its sha); never rerun or revert this one**: its result would describe
  code nobody will merge. Any real failure on the same commit makes the verdict RED instead.
- **RED (cancelled, no newer commit)**: the run was cancelled but the branch still points at
  this commit, so nothing replaced it (cancelled by hand, or a newer push was force-pushed
  away). Find out why before rerunning.
- **NO CI / TIMEOUT / ERROR**: report it as is. Never turn it into "probably fine".

## Boundaries

The script only reads. Merges, reruns and dispatches stay with the user.

## Requirements

`gh` (GitHub CLI), signed in with read access to the repository. Bash and `awk`, present on
macOS and Linux.
