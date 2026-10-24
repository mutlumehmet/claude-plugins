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
n=$(cat "$FAKE/poll" 2>/dev/null || echo 0)
pick() { local i=$n; while [ "$i" -gt 0 ]; do [ -f "$FAKE/$1.$i" ] && { cat "$FAKE/$1.$i"; return; }; i=$((i-1)); done; [ -n "${2:-}" ] && echo "$2"; }
case "$*" in
  *"/commits/$SHA "*|*"/commits/$SHA") echo "$SHA";;
  *"actions/runs?head_sha"*) n=$((n+1)); echo "$n" > "$FAKE/poll"; pick runs;;
  *"/jobs"*) cat "$FAKE/jobs" 2>/dev/null;;
  *"actions/runs/"*) echo "feature/x";;
  *"/branches/"*) cat "$FAKE/head" 2>/dev/null || echo "$SHA";;
  *check_name*) pick gate "0 0";;
  *"/check-runs"*) ;;
  *"/status"*) printf 'Vercel\tsuccess\thttps://example.test\n';;
  *) echo "fake gh: unexpected $*" >&2; exit 1;;
esac
GH
chmod +x "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH" SHA

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

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
