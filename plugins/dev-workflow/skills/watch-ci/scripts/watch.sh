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
#                       when explaining a failure. Repeatable.
#   --timeout MIN       give up after MIN minutes of watching CI (default 60)
#   --merge-timeout MIN give up waiting for the merge after MIN (default 240)
#   --interval SEC      poll interval (default 20)
#
# Exit: 0 GREEN, 1 RED, 2 NO CI / TIMEOUT / ERROR. The last line always
# starts with "WATCH RESULT:".

set -uo pipefail
REPO=""; TIMEOUT=60; MTIMEOUT=240; INTERVAL=20; MERGE=0; TARGET=""; GATES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2;;
    --gate-job) GATES+=("$2"); shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    --merge-timeout) MTIMEOUT="$2"; shift 2;;
    --interval) INTERVAL="$2"; shift 2;;
    --merge) MERGE=1; shift;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    -*) echo; echo "WATCH RESULT: ERROR unknown option $1 (see --help)"; exit 2;;
    *) TARGET="$1"; shift;;
  esac
done
say() { echo "[$(date -u +%H:%M:%S)] $*"; }
result() { echo; echo "WATCH RESULT: $*"; }
is_gate() { local g; for g in ${GATES[@]+"${GATES[@]}"}; do [ "$1" = "$g" ] && return 0; done; return 1; }
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
start=$(date +%s); end=$(( start + TIMEOUT*60 )); stable=0; last=""
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
  if [ "$runs" = "__ERR__" ]; then say "GitHub API error, retrying."; sleep "$INTERVAL"; continue; fi

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
    if [ "$stable" -ge 2 ]; then break; fi
  else
    stable=0
  fi
  [ "$(date +%s)" -ge "$end" ] && { result "TIMEOUT $LABEL still running after $TIMEOUT min ($waiting not finished)"; exit 2; }
  sleep "$INTERVAL"
done

mins=$(( ($(date +%s) - start) / 60 ))
# Dependabot update jobs (event "dynamic") also run against the default
# branch's commit. Their red is usually security_update_not_possible or the
# cooldown, not this change, so they are listed but never decide the verdict.
dep=$(printf '%s\n' "$runs" | awk -F'\t' 'NF && $6=="dynamic"')
runs=$(printf '%s\n' "$runs" | awk -F'\t' 'NF && $6!="dynamic"')
nruns=$(printf '%s' "$runs" | grep -c . || true)
if [ -n "$dep" ]; then
  echo "Dependabot runs on this commit (not part of the verdict):"
  printf '%s\n' "$dep" | awk -F'\t' '{printf "    %-55s %s\n", $2, $4}'
fi
bad=$(printf '%s\n' "$runs" | awk -F'\t' 'NF && !($4=="success" || $4=="skipped" || $4=="neutral")')
badck=$(printf '%s\n' "$checks" | awk -F'\t' 'NF && !($3=="success" || $3=="skipped" || $3=="neutral")')
badst=$(printf '%s\n' "$stats" | awk -F'\t' 'NF && $2!="success"')
if [ -z "$bad" ] && [ -z "$badck" ] && [ -z "$badst" ]; then
  result "GREEN $LABEL: $nruns workflow runs, $nchecks other checks and $nstats statuses all passed (watched ${mins} min)."
  exit 0
fi

echo
echo "Failures:"
flaky=1
while IFS=$'\t' read -r id name _ concl attempt _ev; do
  [ -z "$id" ] && continue
  echo "  workflow '$name' $concl (run $id, attempt $attempt)"
  jobs=$(gh api "repos/$REPO/actions/runs/$id/jobs?per_page=100" \
    --jq '.jobs[] | select(.conclusion=="failure" or .conclusion=="timed_out" or .conclusion=="cancelled") | "\(.id)\t\(.name)\t\(.conclusion)\t\([.steps[] | select(.conclusion=="failure") | .name] | join(", "))"' 2>/dev/null)
  while IFS=$'\t' read -r jid jname jconcl steps; do
    [ -z "$jid" ] && continue
    echo "    job '$jname' $jconcl, failed step: ${steps:-unknown}"
    # A gate job only fails because an upstream job failed; it says nothing new.
    is_gate "$jname" && continue
    # A failure in a setup / download / cache step means no test ran: likely infrastructure.
    if ! printf '%s' "$steps" | grep -qiE 'set ?up|setup|install|download|cache|checkout|restore'; then flaky=0; fi
  done <<< "$jobs"
  [ -z "$jobs" ] && flaky=0
  echo "    rerun failed jobs: gh run rerun $id --failed --repo $REPO"
done <<< "$bad"
if [ -n "$badck" ]; then
  flaky=0
  printf '%s\n' "$badck" | awk -F'\t' '{print "  check " $1 " " $3 " (" $4 ") " $5}'
fi
if [ -n "$badst" ]; then
  flaky=0
  printf '%s\n' "$badst" | awk -F'\t' '{print "  status " $1 " " $2 " " $3}'
fi

if [ "$flaky" -eq 1 ]; then
  result "RED (likely infrastructure) $LABEL: only setup/download/cache steps failed, so no test ran. Rerun the failed jobs."
else
  result "RED $LABEL: a real check failed, read the job log before rerunning."
fi
exit 1
