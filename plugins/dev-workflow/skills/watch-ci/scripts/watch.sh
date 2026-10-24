#!/usr/bin/env bash
# Watch everything GitHub knows about one commit (Actions runs, check runs
# from other CI apps, and commit statuses such as a deploy preview) until it
# has all finished, then print GREEN or RED. Built to run as a background
# job: the session is notified when this process exits, so nobody has to
# come back and ask "is it done?".
#
# Usage:
#   watch.sh                        watch the newest commit on the default branch
#   watch.sh <PR number>            watch the PR's head commit
#   watch.sh <PR number> --merge    wait until the PR is merged, then watch
#                                   the merge commit on its base branch
#   watch.sh <branch>               watch the newest commit on that branch
#   watch.sh <sha>                  watch one commit
# Options:
#   --repo owner/name   repository (default: the repo of the current folder)
#   --gate-job NAME     a job that only fails because another job failed
#                       (a "ci gate" that sums up the others); it is skipped
#                       when explaining a failure, and GREEN needs it to have
#                       passed on the commit (missing = keep waiting).
#                       Repeatable.
#   --superseded-step NAME
#                       a gate-job step that fails only because a newer
#                       commit exists (e.g. "only main's HEAD may deploy").
#                       If that step is the ONLY failure, the verdict is
#                       SUPERSEDED, not RED. Repeatable.
#                       A cancelled run (or a gate that failed only because
#                       the suite was cancelled) is SUPERSEDED too when the
#                       branch now points at a newer commit; with no newer
#                       commit, a cancel is RED.
#   --gated-status NAME a commit status that fails only because the gate
#                       job failed (e.g. a deploy that waits for the gate).
#                       While a gate job failed, it adds nothing to the
#                       verdict; otherwise it is a real failure. Repeatable.
#   --timeout MIN       give up after MIN minutes of watching CI (default 60)
#   --merge-timeout MIN give up waiting for the merge after MIN (default 240)
#   --interval SEC      poll interval (default 20)
#
# Exit: 0 GREEN, 1 RED, 2 NO CI / TIMEOUT / ERROR, 3 SUPERSEDED. The last line always
# starts with "WATCH RESULT:".

set -uo pipefail
REPO=""; TIMEOUT=60; MTIMEOUT=240; INTERVAL=20; MERGE=0; TARGET=""; GATES=(); SUPERSEDED=(); GATED=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2;;
    --gate-job) GATES+=("$2"); shift 2;;
    --superseded-step) SUPERSEDED+=("$2"); shift 2;;
    --gated-status) GATED+=("$2"); shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    --merge-timeout) MTIMEOUT="$2"; shift 2;;
    --interval) INTERVAL="$2"; shift 2;;
    --merge) MERGE=1; shift;;
    -h|--help) sed -n '2,41p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    -*) echo; echo "WATCH RESULT: ERROR unknown option $1 (see --help)"; exit 2;;
    *) TARGET="$1"; shift;;
  esac
done
say() { echo "[$(date -u +%H:%M:%S)] $*"; }
result() { echo; echo "WATCH RESULT: $*"; }
is_gate() { local g; for g in ${GATES[@]+"${GATES[@]}"}; do [ "$1" = "$g" ] && return 0; done; return 1; }
# Is there a newer commit than the one watched? The superseded step can also
# fail for another reason (it could not read the branch head, say), and a run
# can be cancelled by hand, so confirm it independently: the PR's head (when a
# PR is watched before merge) or the run's branch must now point at a
# different commit. Any doubt counts as "no". Sets NEWER to the newer sha.
NEWER=""
newer_exists() {
  local br head=""
  if [ -n "${PR:-}" ] && [ "$MERGE" -eq 0 ]; then
    head=$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid 2>/dev/null) || head=""
  fi
  if [ -z "$head" ]; then
    br=$(gh api "repos/$REPO/actions/runs/$1" --jq .head_branch 2>/dev/null) || return 1
    [ -n "$br" ] || return 1
    head=$(gh api "repos/$REPO/branches/$br" --jq .commit.sha 2>/dev/null) || return 1
  fi
  [ -n "$head" ] && [ "$head" != "$SHA" ] || return 1
  NEWER="$head"
}
# Gate jobs that have not passed on $SHA, quoted and space separated (empty
# when all passed). An Actions job is a check run named after the job; with
# filter=latest a rerun replaces its earlier attempt.
gates_not_passed() {
  local g out ok n
  for g in ${GATES[@]+"${GATES[@]}"}; do
    out=$(gh api -X GET "repos/$REPO/commits/$SHA/check-runs" -f check_name="$g" -f filter=latest \
      --jq '(.check_runs | map(select(.status=="completed" and .conclusion=="success")) | length | tostring) + " " + (.check_runs | length | tostring)' 2>/dev/null) || out="0 0"
    read -r ok n <<< "$out"
    if [ "${n:-0}" -eq 0 ] || [ "${ok:-0}" -ne "$n" ]; then printf "'%s' " "$g"; fi
  done
}
# Split the latest poll into the lists the verdict reads: dep (Dependabot
# runs), vruns (every other run) and the failures bad, badck, badst.
classify() {
  dep=$(printf '%s\n' "$runs" | awk -F'\t' 'NF && $6=="dynamic"')
  vruns=$(printf '%s\n' "$runs" | awk -F'\t' 'NF && $6!="dynamic"')
  bad=$(printf '%s\n' "$vruns" | awk -F'\t' 'NF && !($4=="success" || $4=="skipped" || $4=="neutral")')
  badck=$(printf '%s\n' "$checks" | awk -F'\t' 'NF && !($3=="success" || $3=="skipped" || $3=="neutral")')
  badst=$(printf '%s\n' "$stats" | awk -F'\t' 'NF && $2!="success"')
}
is_gated_status() { local g; for g in ${GATED[@]+"${GATED[@]}"}; do [ "$1" = "$g" ] && return 0; done; return 1; }
is_superseded_step() { local g; for g in ${SUPERSEDED[@]+"${SUPERSEDED[@]}"}; do [ "$1" = "$g" ] && return 0; done; return 1; }
command -v gh >/dev/null || { result "ERROR gh (GitHub CLI) is not installed"; exit 2; }

if [ -z "$REPO" ]; then
  REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || REPO=""
  [ -z "$REPO" ] && { result "ERROR no repository: run inside a GitHub repo folder or pass --repo owner/name"; exit 2; }
fi

if [ -z "$TARGET" ]; then
  TARGET=$(gh api "repos/$REPO" --jq .default_branch 2>/dev/null) || { result "ERROR cannot read $REPO (check gh auth status)"; exit 2; }
fi

LABEL="$TARGET"
if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  PR="$TARGET"; LABEL="PR #$PR"
  if [ "$MERGE" -eq 1 ]; then
    say "Waiting for $LABEL to be merged (up to $MTIMEOUT min)."
    end=$(( $(date +%s) + MTIMEOUT*60 ))
    while :; do
      st=$(gh pr view "$PR" --repo "$REPO" --json state,mergeCommit,baseRefName \
        --jq '"\(.state) \(.baseRefName) \(.mergeCommit.oid // "")"' 2>/dev/null) || st="ERR - "
      read -r state base SHA <<< "$st"
      [ "$state" = "MERGED" ] && break
      [ "$state" = "CLOSED" ] && { result "ERROR $LABEL was closed without merging"; exit 2; }
      [ "$(date +%s)" -ge "$end" ] && { result "TIMEOUT $LABEL not merged within $MTIMEOUT min"; exit 2; }
      sleep "$INTERVAL"
    done
    LABEL="$LABEL merge commit ${SHA:0:8} on $base"
    say "Merged. Now watching $LABEL."
  else
    SHA=$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid 2>/dev/null) || { result "ERROR cannot read $LABEL in $REPO"; exit 2; }
    LABEL="$LABEL head ${SHA:0:8}"
  fi
else
  SHA=$(gh api "repos/$REPO/commits/$TARGET" --jq .sha 2>/dev/null) || { result "ERROR unknown branch or commit $TARGET in $REPO"; exit 2; }
  [[ "$SHA" == "$TARGET"* ]] && LABEL="commit ${SHA:0:8}" || LABEL="$TARGET ${SHA:0:8}"
fi

say "Watching $LABEL in $REPO (timeout $TIMEOUT min)."
start=$(date +%s); end=$(( start + TIMEOUT*60 )); stable=0; last=""; seen=""; gatelast=""
timed_out() { [ "$(date +%s)" -ge "$end" ] && { result "TIMEOUT $LABEL $1 after $TIMEOUT min"; exit 2; }; }
while :; do
  # 1. GitHub Actions workflow runs.
  runs=$(gh api "repos/$REPO/actions/runs?head_sha=$SHA&per_page=100" \
    --jq '.workflow_runs[] | "\(.id)\t\(.name)\t\(.status)\t\(.conclusion // "")\t\(.run_attempt)\t\(.event)"' 2>/dev/null) || runs="__ERR__"
  # 2. Check runs from other CI apps. Actions jobs are check runs too, so
  #    those are left out here: they are already counted through their run.
  checks=$(gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
    --jq '.check_runs[] | select(.app.slug != "github-actions") | "\(.name)\t\(.status)\t\(.conclusion // "")\t\(.app.slug)\t\(.details_url // "")"' 2>/dev/null | sort -u) || checks=""
  # 3. Commit statuses (deploy previews and older integrations).
  stats=$(gh api "repos/$REPO/commits/$SHA/status" \
    --jq '.statuses[] | "\(.context)\t\(.state)\t\(.target_url // "")"' 2>/dev/null | sort -u) || stats=""
  if [ "$runs" = "__ERR__" ]; then say "GitHub API error, retrying."; timed_out "GitHub API kept failing"; sleep "$INTERVAL"; continue; fi

  # The runs-by-commit list sometimes comes back empty, or short, for a few
  # minutes while CI is still going (seen 22 Oct 2026: 2 runs, then 0 for two
  # polls, then 2 again, and the quiet polls printed a false GREEN). A run once
  # seen does not go away, so a list without it is a bad read: log it, poll
  # again, and never count it as quiet.
  ids=$(printf '%s\n' "$runs" | awk -F'\t' 'NF {print $1}')
  missing=$(comm -23 <(printf '%s\n' "$seen" | awk 'NF') <(printf '%s\n' "$ids" | awk 'NF' | sort -u) | wc -l | tr -d ' ')
  if [ "$missing" -gt 0 ]; then
    say "GitHub listed $(printf '%s' "$ids" | grep -c . || true) workflow runs, but $missing seen earlier are missing: a bad read, not a finish. Polling again."
    stable=0; timed_out "workflow runs kept going missing from GitHub's list"; sleep "$INTERVAL"; continue
  fi
  seen=$(printf '%s\n%s\n' "$seen" "$ids" | awk 'NF' | sort -u)

  nruns=$(printf '%s' "$runs" | grep -c . || true)
  nchecks=$(printf '%s' "$checks" | grep -c . || true)
  nstats=$(printf '%s' "$stats" | grep -c . || true)
  open=$(printf '%s\n' "$runs" | awk -F'\t' 'NF && $3!="completed"' | wc -l | tr -d ' ')
  copen=$(printf '%s\n' "$checks" | awk -F'\t' 'NF && $2!="completed"' | wc -l | tr -d ' ')
  pend=$(printf '%s\n' "$stats" | awk -F'\t' 'NF && $2=="pending"' | wc -l | tr -d ' ')
  total=$(( nruns + nchecks + nstats )); waiting=$(( open + copen + pend ))
  snap="$runs|$checks|$stats"
  if [ "$snap" != "$last" ]; then
    say "workflow runs: $nruns, other checks: $nchecks, statuses: $nstats, still running: $waiting"
    printf '%s\n' "$runs" | awk -F'\t' 'NF {printf "    run    %-42s %s %s (attempt %s)\n", $2, $3, $4, $5}'
    printf '%s\n' "$checks" | awk -F'\t' 'NF {printf "    check  %-42s %s %s (%s)\n", $1, $2, $3, $4}'
    printf '%s\n' "$stats" | awk -F'\t' 'NF {printf "    status %-42s %s\n", $1, $2}'
    last="$snap"
  fi

  if [ "$total" -eq 0 ] && [ $(( $(date +%s) - start )) -gt 240 ]; then
    result "NO CI nothing reported on $LABEL after 4 min (no workflow ran for this branch, the workflow is disabled, or the Actions quota is spent). Green will never arrive."
    exit 2
  fi

  if [ "$total" -gt 0 ] && [ "$waiting" -eq 0 ]; then
    # Some workflows start only after another finishes (for example a check
    # that runs once the deploy reports). Require two quiet polls in a row.
    stable=$((stable+1))
    if [ "$stable" -ge 2 ]; then
      # A failure decides now. A pass needs every --gate-job to have passed:
      # a gate that has not reported yet means CI is not done.
      classify
      [ -n "$bad$badck$badst" ] && break
      gwait=$(gates_not_passed); gwait="${gwait% }"
      [ -z "$gwait" ] && break
      [ "$gwait" != "$gatelast" ] && say "Everything listed has finished, but gate job $gwait has not passed on this commit yet. Waiting."
      gatelast="$gwait"
      timed_out "gate job $gwait never passed"
      sleep "$INTERVAL"; continue
    fi
  else
    stable=0
  fi
  timed_out "still running ($waiting not finished)"
  sleep "$INTERVAL"
done

mins=$(( ($(date +%s) - start) / 60 ))
# Dependabot update jobs (event "dynamic") also run against the default
# branch's commit. Their red is usually security_update_not_possible or the
# cooldown, not this change, so they are listed but never decide the verdict.
classify
nruns=$(printf '%s' "$vruns" | grep -c . || true)
if [ -n "$dep" ]; then
  echo "Dependabot runs on this commit (not part of the verdict):"
  printf '%s\n' "$dep" | awk -F'\t' '{printf "    %-55s %s\n", $2, $4}'
fi
if [ -z "$bad" ] && [ -z "$badck" ] && [ -z "$badst" ]; then
  # Backstop: the loop never ends on a list missing a run it saw, so this
  # cannot happen; if it ever does, it is not green.
  if [ -z "$runs" ] && [ -n "$seen" ]; then
    result "ERROR $LABEL: GitHub lists no workflow runs although it listed them earlier. Not green; watch again."
    exit 2
  fi
  gnote=""; [ -n "${GATES[*]+x}" ] && gnote=", gate job passed"
  result "GREEN $LABEL: $nruns workflow runs, $nchecks other checks and $nstats statuses all passed$gnote (watched ${mins} min)."
  exit 0
fi

echo
echo "Failures:"
flaky=1
# superseded=1 when a gate job failed only at a --superseded-step, or a run was
# only cancelled and a newer commit exists; real=1 when anything else failed.
# SUPERSEDED is reported only if nothing real failed. cancel_alone=1 when a run
# was only cancelled but no newer commit exists (RED: nothing replaced it).
superseded=0; real=0; gate_failed=0; cancel_alone=0
while IFS=$'\t' read -r id name _ concl attempt _ev; do
  [ -z "$id" ] && continue
  echo "  workflow '$name' $concl (run $id, attempt $attempt)"
  # Per run: did its gate fail on its own rule, did any other job fail, how many
  # jobs were cancelled, was it superseded.
  gate_own=0; nongate=0; run_sup=0; ncancel=0
  jobs=$(gh api "repos/$REPO/actions/runs/$id/jobs?per_page=100" \
    --jq '.jobs[] | select(.conclusion=="failure" or .conclusion=="timed_out" or .conclusion=="cancelled") | "\(.id)\t\(.name)\t\(.conclusion)\t\([.steps[] | select(.conclusion=="failure") | .name] | join(", "))"' 2>/dev/null)
  while IFS=$'\t' read -r jid jname jconcl steps; do
    [ -z "$jid" ] && continue
    echo "    job '$jname' $jconcl, failed step: ${steps:-unknown}"
    if is_gate "$jname"; then
      gate_failed=1
      if [ "$jconcl" = "failure" ] && is_superseded_step "$steps" && newer_exists "$id"; then
        superseded=1; run_sup=1
      else
        gate_own=1
      fi
      # A gate job otherwise only fails because an upstream job failed; it says nothing new.
      continue
    fi
    # A cancelled job failed nothing: it was stopped (a newer push, or by hand).
    # Whether that is SUPERSEDED or RED is decided for the whole run below.
    if [ "$jconcl" = "cancelled" ]; then ncancel=$((ncancel+1)); continue; fi
    real=1; nongate=1
    # A failure in a setup / download / cache step means no test ran: likely infrastructure.
    if ! printf '%s' "$steps" | grep -qiE 'set ?up|setup|install|download|cache|checkout|restore|start [^,]*(stack|services?|containers?|database)'; then flaky=0; fi
  done <<< "$jobs"
  # A run cancelled before any job started lists no jobs: count it as one cancel.
  if [ -z "$jobs" ]; then
    if [ "$concl" = "cancelled" ]; then ncancel=1; else flaky=0; real=1; fi
  fi
  # Only cancelled jobs, plus a gate that ran anyway (if: always()) and failed
  # because the suite was cancelled: superseded when a newer commit exists,
  # RED otherwise (a cancel without a successor replaced nothing).
  if [ "$ncancel" -gt 0 ] && [ "$nongate" -eq 0 ]; then
    if newer_exists "$id"; then
      echo "    cancelled, and $(printf '%s' "$NEWER" | cut -c1-8) is newer on the branch: superseded"
      superseded=1; continue
    fi
    echo "    cancelled, and no newer commit exists on the branch"
    cancel_alone=1; flaky=0
    echo "    rerun failed jobs: gh run rerun $id --failed --repo $REPO"
    continue
  fi
  # A gate that failed with no failed upstream job failed on its own rule: real, never infrastructure.
  if [ "$gate_own" -eq 1 ] && [ "$nongate" -eq 0 ]; then real=1; flaky=0; fi
  # A run whose only failure is a confirmed superseded gate gets no rerun hint.
  if [ "$run_sup" -eq 1 ] && [ "$gate_own" -eq 0 ] && [ "$nongate" -eq 0 ]; then continue; fi
  echo "    rerun failed jobs: gh run rerun $id --failed --repo $REPO"
done <<< "$bad"
if [ -n "$badck" ]; then
  flaky=0; real=1
  printf '%s\n' "$badck" | awk -F'\t' '{print "  check " $1 " " $3 " (" $4 ") " $5}'
fi
if [ -n "$badst" ]; then
  # A --gated-status only echoes the gate: it decides nothing while a gate job
  # failed (that failure is the verdict), and is a real failure otherwise.
  while IFS=$'\t' read -r ctx _st _url; do
    [ -z "$ctx" ] && continue
    if is_gated_status "$ctx" && [ "$gate_failed" -eq 1 ]; then continue; fi
    flaky=0; real=1
  done <<< "$badst"
  printf '%s\n' "$badst" | awk -F'\t' '{print "  status " $1 " " $2 " " $3}'
fi

if [ "$superseded" -eq 1 ] && [ "$real" -eq 0 ] && [ "$cancel_alone" -eq 0 ]; then
  nnote=""; [ -n "$NEWER" ] && nnote=" (${NEWER:0:8})"
  result "SUPERSEDED $LABEL: not a failure. A newer commit$nnote exists and its own run decides; watch that one. Never rerun or revert this."
  exit 3
fi
if [ "$cancel_alone" -eq 1 ] && [ "$real" -eq 0 ]; then
  result "RED $LABEL: CI was cancelled and no newer commit exists on the branch, so nothing replaced it. Find out why it was cancelled before rerunning."
  exit 1
fi
if [ "$flaky" -eq 1 ]; then
  result "RED (likely infrastructure) $LABEL: only setup, download, cache or service-start steps failed, so no test ran. Rerun the failed jobs."
else
  result "RED $LABEL: a real check failed, read the job log before rerunning."
fi
exit 1
