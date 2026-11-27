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
#   --interval SEC      poll interval in seconds (default 60)
#   --no-dedupe         poll GitHub even if another watcher already watches
#                       the same commit
#
# One watcher per commit: once the commit is known, the first watcher on a
# (repo, commit, options) becomes the leader and polls GitHub; any later
# watcher on the same key, from any session or account of the same user on
# this machine, follows it without calling the API and prints the leader's
# result with the same exit code. If the leader dies, a follower takes over.
# State lives in $WATCH_CI_STATE_DIR (default ${TMPDIR:-/tmp}/watch-ci).
#
# Exit: 0 GREEN, 1 RED, 2 NO CI / TIMEOUT / ERROR, 3 SUPERSEDED. The last line always
# starts with "WATCH RESULT:".

set -uo pipefail
REPO=""; TIMEOUT=60; MTIMEOUT=240; INTERVAL=60; MERGE=0; TARGET=""; GATES=(); SUPERSEDED=(); GATED=(); DEDUPE=1
# Our own names, never values inherited from the environment.
unset SHA PR; SHA=""; PR=""
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
    --no-dedupe) DEDUPE=0; shift;;
    -h|--help) sed -n '2,49p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
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

# --- One watcher per commit --------------------------------------------------
# Several sessions often watch the same commit (on 27 Nov 2026, 38 watchers on
# one Mac, six on one commit, spent the 5,000 calls an hour GitHub allows a
# user). The leader holds a symlink "leader" -> "<pid>-<nonce>" (ln -s is
# atomic); followers read files only. The leader writes "result.<token>"
# (exit code, then its full output) with an atomic rename before it lets go.
STATE_BASE="${WATCH_CI_STATE_DIR:-${TMPDIR:-/tmp}/watch-ci}"; STATE_BASE="${STATE_BASE%/}"
KEYDIR=""; TOKEN="$$-$(date +%s)-$RANDOM"
key_dir() { # $1 = sha. Options that change the verdict are part of the key.
  local opts
  opts=$(printf '%s\n' "g:${GATES[@]+${GATES[*]}}" "s:${SUPERSEDED[@]+${SUPERSEDED[*]}}" "t:${GATED[@]+${GATED[*]}}" | cksum | awk '{print $1}')
  printf '%s/%s/%s/%s' "$STATE_BASE" "$(printf '%s' "$REPO" | tr 'A-Z/' 'a-z_')" "$(printf '%s' "$1" | tr 'A-Z' 'a-z')" "$opts"
}
lock_owner() { readlink "$KEYDIR/leader" 2>/dev/null; }
token_alive() { local pid="${1%%-*}"; [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; }
live_leader() { local o; o=$(lock_owner) && [ -n "$o" ] && token_alive "$o"; }
# Replace a dead leader's lock. A short "takeover" mutex (mkdir is atomic)
# makes sure two followers never both remove a lock and each create one.
take_over() { # $1 = the dead token seen
  local rc=1
  if ! mkdir "$KEYDIR/takeover" 2>/dev/null; then
    # A takeover mutex older than 2 min belongs to a process that died in it.
    [ -n "$(find "$KEYDIR/takeover" -maxdepth 0 -mmin +2 2>/dev/null)" ] && rmdir "$KEYDIR/takeover" 2>/dev/null
    return 1
  fi
  if [ "$(lock_owner)" = "$1" ] && ! token_alive "$1"; then
    rm -f "$KEYDIR/leader"; ln -s "$TOKEN" "$KEYDIR/leader" 2>/dev/null && rc=0
  fi
  rmdir "$KEYDIR/takeover" 2>/dev/null
  return $rc
}
kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill -TERM "$1" 2>/dev/null; }
release() { [ "$(lock_owner)" = "$TOKEN" ] && rm -f "$KEYDIR/leader"; rm -f "$KEYDIR/code.$TOKEN" "$KEYDIR/log.$TOKEN"; }
# Wait for the leader with token $1. Prints its result and exits with its
# code; returns 1 if it went away without one (the caller then takes over).
follow() {
  local owner="$1" fpoll="$INTERVAL" fend r
  [ "$fpoll" -gt 5 ] 2>/dev/null && fpoll=5; [ "$fpoll" -lt 1 ] 2>/dev/null && fpoll=0.1
  fend=$(( $(date +%s) + TIMEOUT*60 ))
  say "Another watcher (pid ${owner%%-*}) already watches $LABEL in $REPO. Following it: no GitHub API calls from this one."
  while :; do
    r="$KEYDIR/result.$owner"
    if [ -f "$r" ]; then
      tail -n +2 "$r"; exit "$(head -n 1 "$r")"
    fi
    if [ "$(lock_owner)" != "$owner" ] || ! token_alive "$owner"; then
      [ -f "$r" ] && continue
      say "The watcher it followed (pid ${owner%%-*}) stopped without a result. Taking over."
      return 1
    fi
    [ "$(date +%s)" -ge "$fend" ] && { result "TIMEOUT $LABEL: the watcher it followed (pid ${owner%%-*}) had no result after $TIMEOUT min"; exit 2; }
    sleep "$fpoll"
  done
}
# Lead: run the watch, stream its output, store the result for followers.
lead() {
  local code
  trap 'for c in $(pgrep -P $$ 2>/dev/null); do kill_tree "$c"; done; release; exit 130' TERM INT HUP
  { ( watch_commit ); echo $? > "$KEYDIR/code.$TOKEN"; } 2>&1 | tee "$KEYDIR/log.$TOKEN" &
  wait $!
  code=$(cat "$KEYDIR/code.$TOKEN" 2>/dev/null) || code=2; [ -n "$code" ] || code=2
  { echo "$code"; cat "$KEYDIR/log.$TOKEN"; } > "$KEYDIR/result.$TOKEN.tmp" && mv -f "$KEYDIR/result.$TOKEN.tmp" "$KEYDIR/result.$TOKEN"
  release
  exit "$code"
}
# ------------------------------------------------------------------------------

LABEL="$TARGET"
# A full commit sha that a live leader already watches needs no API call.
if [ "$DEDUPE" -eq 1 ] && [ "$MERGE" -eq 0 ] && [[ "$TARGET" =~ ^[0-9a-fA-F]{40}$ ]]; then
  KEYDIR=$(key_dir "$TARGET")
  live_leader && { SHA=$(printf '%s' "$TARGET" | tr 'A-F' 'a-f'); LABEL="commit ${SHA:0:8}"; }
fi
if [ -n "${SHA:-}" ]; then
  :
elif [[ "$TARGET" =~ ^[0-9]+$ ]]; then
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

watch_commit() {
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
}

# A PR head or branch is resolved once, here: a later push makes a new commit,
# so a new watch on the same PR keys a new lock (the newer sha).
if [ "$DEDUPE" -eq 0 ] || ! mkdir -p "$(key_dir "$SHA")" 2>/dev/null; then watch_commit; fi
KEYDIR=$(key_dir "$SHA")
# Results older than 6 hours are no use to anyone: clear them out.
find "$STATE_BASE" -type f -name 'result.*' -mmin +360 -delete 2>/dev/null
tries=0
while :; do
  ln -s "$TOKEN" "$KEYDIR/leader" 2>/dev/null && lead
  owner=$(lock_owner) || owner=""
  # Neither a lock of ours nor a readable one: the state dir is unusable, so
  # watch without dedupe rather than spin.
  if [ -z "$owner" ]; then tries=$((tries+1)); [ "$tries" -ge 50 ] && watch_commit; sleep 0.1; continue; fi
  if token_alive "$owner"; then
    follow "$owner"
  else
    take_over "$owner" && { say "A watcher on this commit (pid ${owner%%-*}) is gone without a result. Taking over."; lead; }
    sleep 0.2
  fi
done
