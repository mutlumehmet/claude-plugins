#!/usr/bin/env bash
# Runs watch.sh against a fake `gh` that replays scripted GitHub answers, one
# per poll, so the watch's verdicts can be checked without a network.
# Usage: tests/watch-test.sh    (exit 0 = all cases passed)

set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WATCH="$HERE/../scripts/watch.sh"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
SHA=2a16736c0000000000000000000000000000beef
TAB=$'\t'

# The fake gh. Workflow runs come from $FAKE/runs.N (N = the poll number,
# counted on each runs request; the last file repeats). The gate check run
# answers "passed total" from $FAKE/gate.N on the same count, default "0 0".
# A run's failed jobs come from $FAKE/jobs; the branch head from $FAKE/head
# (default: the watched commit itself, so no newer commit exists).
mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "${WATCH_ID:-x} $*" >> "$FAKE/calls"
n=$(cat "$FAKE/poll" 2>/dev/null || echo 0)
pick() { local i=$n; while [ "$i" -gt 0 ]; do [ -f "$FAKE/$1.$i" ] && { cat "$FAKE/$1.$i"; return; }; i=$((i-1)); done; [ -n "${2:-}" ] && echo "$2"; }
case "$*" in
  *"/commits/$FAKE_SHA "*|*"/commits/$FAKE_SHA"|*"/commits/${FAKE_SHA:0:8} "*) echo "$FAKE_SHA";;
  *"actions/runs?head_sha"*) n=$((n+1)); echo "$n" > "$FAKE/poll"; pick runs;;
  *"/jobs"*) cat "$FAKE/jobs" 2>/dev/null;;
  *"actions/runs/"*) echo "feature/x";;
  *"/branches/"*) cat "$FAKE/head" 2>/dev/null || echo "$FAKE_SHA";;
  *check_name*) pick gate "0 0";;
  *"/check-runs"*) ;;
  *"/status"*) printf 'Vercel\tsuccess\thttps://example.test\n';;
  *) echo "fake gh: unexpected $*" >&2; exit 1;;
esac
GH
chmod +x "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH" FAKE_SHA="$SHA"
# Keep the one-watcher-per-commit state away from the real machine-wide dir.
export WATCH_CI_STATE_DIR="$TMP/state"

fails=0
run_case() { # name, expected exit, expected pattern in output, then watch.sh args
  local name="$1" want="$2" pat="$3"; shift 3
  out=$("$WATCH" "$SHA" --repo acme/shop --interval 0 --timeout 1 "$@" 2>&1); code=$?
  if [ "$code" -eq "$want" ] && grep -qE "$pat" <<< "$out"; then
    echo "ok   $name"
  else
    echo "FAIL $name (exit $code, wanted $want and /$pat/)"; printf '%s\n' "$out" | sed 's/^/     /'; fails=$((fails+1))
  fi
}
fresh() { export FAKE="$TMP/$1"; rm -rf "$FAKE"; mkdir -p "$FAKE"; }
run() { printf '%s\tCI\t%s\t%s\t1\tpush\n' "$1" "$2" "$3"; }

# 1. The 22 Oct flap: 2 runs, then an empty list twice while CI still runs,
#    then both runs again. Must not print GREEN on the empty polls.
fresh flap
{ run 1 completed success; run 2 in_progress ""; } > "$FAKE/runs.1"
: > "$FAKE/runs.2"; : > "$FAKE/runs.3"; : > "$FAKE/runs.4"
{ run 1 completed success; run 2 completed success; } > "$FAKE/runs.5"
run_case "empty run list after runs were seen is a bad read" 0 "WATCH RESULT: GREEN .*: 2 workflow runs"
grep -q "a bad read, not a finish" <<< "$out" || { echo "FAIL flap: bad read not logged"; fails=$((fails+1)); }
[ "$(grep -c 'WATCH RESULT' <<< "$out")" -eq 1 ] || { echo "FAIL flap: more than one result"; fails=$((fails+1)); }

# 2. A run dropping out of the list (2 seen, 1 listed) is a bad read too.
fresh short
{ run 1 completed success; run 2 in_progress ""; } > "$FAKE/runs.1"
run 1 completed success > "$FAKE/runs.2"; run 1 completed success > "$FAKE/runs.3"
{ run 1 completed success; run 2 completed failure; } > "$FAKE/runs.4"
run_case "a run missing from the list is a bad read" 1 "WATCH RESULT: RED"

# 3. --gate-job: everything listed is done but the gate has not reported, so
#    keep waiting; GREEN only once the gate passed.
fresh gate
run 1 completed success > "$FAKE/runs.1"
echo "1 1" > "$FAKE/gate.6"
run_case "GREEN waits for the gate job" 0 "WATCH RESULT: GREEN .*gate job passed" --gate-job "ci gate"
grep -q "gate job 'ci gate' has not passed" <<< "$out" || { echo "FAIL gate: wait not logged"; fails=$((fails+1)); }
[ "$(cat "$FAKE/poll")" -ge 6 ] || { echo "FAIL gate: GREEN before the gate passed"; fails=$((fails+1)); }

# 4. A failure still decides at once, even while the gate has not reported.
fresh gatered
run 1 completed failure > "$FAKE/runs.1"
run_case "a failure is RED without waiting for the gate" 1 "WATCH RESULT: RED" --gate-job "ci gate"

# 5. No gate given and all passed: GREEN as before.
fresh plain
run 1 completed success > "$FAKE/runs.1"
run_case "plain GREEN unchanged" 0 "WATCH RESULT: GREEN .*: 1 workflow runs, 0 other checks and 1 statuses all passed \("

# A cancelled suite (a newer push cancelled it) plus the gate that still ran
# with if: always() and failed because of it.
job() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4"; }
cancelled_suite() { { job 11 "e2e (1)" cancelled ""; job 12 "e2e (2)" cancelled ""; job 13 "ci gate" failure "check results"; } > "$FAKE/jobs"; }

# 6. Cancelled, and the branch has moved on: SUPERSEDED, no rerun hint.
fresh cancelnewer
run 1 completed cancelled > "$FAKE/runs.1"; cancelled_suite
echo 9999999900000000000000000000000000000000 > "$FAKE/head"
run_case "cancelled with a newer commit is SUPERSEDED" 3 "WATCH RESULT: SUPERSEDED .*\(99999999\)" --gate-job "ci gate"
grep -q "gh run rerun" <<< "$out" && { echo "FAIL cancelnewer: rerun hint printed"; fails=$((fails+1)); }

# 7. Cancelled, but no newer commit: a cancel without a successor is RED.
fresh cancelalone
run 1 completed cancelled > "$FAKE/runs.1"; cancelled_suite
run_case "cancelled without a newer commit is RED" 1 "WATCH RESULT: RED .*cancelled and no newer commit" --gate-job "ci gate"

# 8. Cancelled and a real failure in the same run: RED, even with a newer commit.
fresh cancelreal
run 1 completed failure > "$FAKE/runs.1"
{ job 11 "e2e (1)" failure "run tests"; job 12 "e2e (2)" cancelled ""; job 13 "ci gate" failure "check results"; } > "$FAKE/jobs"
echo 9999999900000000000000000000000000000000 > "$FAKE/head"
run_case "a real failure next to a cancel is RED" 1 "WATCH RESULT: RED .*a real check failed" --gate-job "ci gate"

# 9. A run cancelled before any job started (no jobs listed), newer commit: SUPERSEDED.
fresh cancelnojobs
run 1 completed cancelled > "$FAKE/runs.1"; : > "$FAKE/jobs"
echo 9999999900000000000000000000000000000000 > "$FAKE/head"
run_case "cancelled before any job, newer commit, is SUPERSEDED" 3 "WATCH RESULT: SUPERSEDED"

# 10. The default poll interval is 60 s: a fake `sleep` records what it is asked for.
fresh interval
run 1 completed success > "$FAKE/runs.1"
mkdir -p "$TMP/sleepbin"; printf '#!/usr/bin/env bash\necho "$1" >> "$FAKE/sleeps"\n' > "$TMP/sleepbin/sleep"; chmod +x "$TMP/sleepbin/sleep"
out=$(PATH="$TMP/sleepbin:$PATH" "$WATCH" "$SHA" --repo acme/shop --timeout 1 2>&1); code=$?
if [ "$code" -eq 0 ] && grep -qx 60 "$FAKE/sleeps" && ! grep -qvx 60 "$FAKE/sleeps"; then echo "ok   default interval is 60 s"
else echo "FAIL default interval (exit $code, sleeps: $(tr '\n' ' ' < "$FAKE/sleeps" 2>/dev/null))"; fails=$((fails+1)); fi
"$WATCH" --help | grep -q "poll interval in seconds (default 60)" || { echo "FAIL help does not say default 60"; fails=$((fails+1)); }

# Wait until a leader holds the lock for this commit (up to 10 s).
wait_leader() { local i=0; while [ "$i" -lt 100 ]; do [ -n "$(find "$WATCH_CI_STATE_DIR" -name leader -type l 2>/dev/null)" ] && return 0; sleep 0.1; i=$((i+1)); done; return 1; }
calls_by() { grep -c "^$1 " "$FAKE/calls" 2>/dev/null || true; }

# 11. Three watchers on one commit: A leads and polls; B (full sha) follows with
#     zero API calls; C (short sha) makes only the one call that resolves it.
#     Both followers end with A's verdict and exit code.
fresh follow; export WATCH_CI_STATE_DIR="$TMP/state-follow"
run 1 in_progress "" > "$FAKE/runs.1"; run 1 completed success > "$FAKE/runs.4"
WATCH_ID=A "$WATCH" "$SHA" --repo acme/shop --interval 1 --timeout 1 > "$TMP/a.out" 2>&1 & apid=$!
wait_leader || echo "     (leader lock never appeared)"
WATCH_ID=B "$WATCH" "$SHA" --repo acme/shop --interval 1 --timeout 1 > "$TMP/b.out" 2>&1 & bpid=$!
WATCH_ID=C "$WATCH" "${SHA:0:8}" --repo acme/shop --interval 1 --timeout 1 > "$TMP/c.out" 2>&1 & cpid=$!
wait "$apid"; acode=$?; wait "$bpid"; bcode=$?; wait "$cpid"; ccode=$?
ares=$(grep "WATCH RESULT" "$TMP/a.out"); nb=$(calls_by B); nc=$(calls_by C); na=$(calls_by A)
echo "     API calls: leader A=$na, follower B=$nb, follower C=$nc; exits A=$acode B=$bcode C=$ccode"
if [ "$acode" -eq 0 ] && [ "$bcode" -eq 0 ] && [ "$ccode" -eq 0 ] && [ "$na" -gt 0 ] && [ "$nb" -eq 0 ] && [ "$nc" -eq 1 ] \
  && grep -qF "$ares" "$TMP/b.out" && grep -qF "$ares" "$TMP/c.out" && grep -q "Following it: no GitHub API calls" "$TMP/b.out"; then
  echo "ok   followers reuse the leader's result; only the leader polls GitHub"
else
  echo "FAIL follow"; for f in a b c; do sed "s/^/     $f| /" "$TMP/$f.out"; done; fails=$((fails+1))
fi

# 12. A stale lock (its watcher died without a result) is taken over.
fresh stale; export WATCH_CI_STATE_DIR="$TMP/state-stale"
run 1 completed success > "$FAKE/runs.1"
"$WATCH" "$SHA" --repo acme/shop --interval 0 --timeout 1 > /dev/null 2>&1   # creates the key dir
kdir=$(dirname "$(find "$WATCH_CI_STATE_DIR" -name 'result.*' | head -n 1)")
sh -c 'exit 0' & dead=$!; wait "$dead"
ln -s "$dead-1-1" "$kdir/leader"; : > "$FAKE/calls"
out=$(WATCH_ID=D "$WATCH" "$SHA" --repo acme/shop --interval 0 --timeout 1 2>&1); code=$?
if [ "$code" -eq 0 ] && grep -q "is gone without a result. Taking over" <<< "$out" && grep -q "WATCH RESULT: GREEN" <<< "$out" \
  && [ "$(calls_by D)" -gt 0 ] && [ ! -L "$kdir/leader" ]; then echo "ok   a stale leader is taken over"
else echo "FAIL stale takeover (exit $code)"; printf '%s\n' "$out" | sed 's/^/     /'; fails=$((fails+1)); fi

# 13. The leader is stopped mid-watch: the follower takes over and finishes.
fresh killed; export WATCH_CI_STATE_DIR="$TMP/state-killed"
run 1 in_progress "" > "$FAKE/runs.1"; run 1 completed success > "$FAKE/runs.5"
WATCH_ID=A "$WATCH" "$SHA" --repo acme/shop --interval 1 --timeout 1 > "$TMP/a.out" 2>&1 & apid=$!
wait_leader
WATCH_ID=B "$WATCH" "$SHA" --repo acme/shop --interval 1 --timeout 1 > "$TMP/b.out" 2>&1 & bpid=$!
sleep 1; kill -TERM "$apid"; wait "$apid"; wait "$bpid"; bcode=$?
if [ "$bcode" -eq 0 ] && grep -q "Taking over" "$TMP/b.out" && grep -q "WATCH RESULT: GREEN" "$TMP/b.out" && [ "$(calls_by B)" -gt 0 ]; then
  echo "ok   a follower takes over when the leader is stopped"
else echo "FAIL leader stopped (B exit $bcode)"; sed 's/^/     /' "$TMP/b.out"; fails=$((fails+1)); fi

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
