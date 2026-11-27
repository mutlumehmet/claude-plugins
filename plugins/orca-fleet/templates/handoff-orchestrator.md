# Handover: <old name> to <new name> (<date>, <time>)

Written at <percent>% context. Start with `/orca-fleet:conduct <this file>`.

## Read first
1. The rules file (`<rules>`): who may merge what, and what always needs the person.
2. The open-items file (`<openItems>`), rows <first id> to <last id>: today's decisions. Read the file, not memory.
3. The ledger (`<ledger>`): one staging check per merged change.

## How the fleet runs
- Accounts: <which account each session is on, and the twin to move to>.
- Crons this orchestrator keeps: status (<minutes>), nudge (<minutes>).
- Merge contract: lanes send "ready to merge #N, head <sha>, SAFE"; <who merges>.
- Anything learned today that the next orchestrator must not relearn.

## Sessions
| Session | Address | Context | Doing now | Next |
|---|---|---|---|---|
| <Lane 1 #2 · label> | uds:... | <n>% | <PR, branch, sha> | <next item> |

## Waiting on the person
1. <decision or action, with the exact command or link>

## Sent to other sessions, not yet confirmed
Every piece of work this session, or a subagent it started, passed to another session since the last
note, until the receiver replied that it took it (named the lane or PR). A row leaves only on that reply.
| What (open item id) | Sent to | Sent at | Receiver state then | Confirmed? |
|---|---|---|---|---|
| <S9-1348 ticket screenshot fix> | <Orchestrator onboarding #3, uds:...> | <11:38> | <waiting on the person> | <no> |

## My transcript (backup)
`~/.claude-<seat>/projects/<project slug>/<sessionId>.jsonl` (sessionId from `~/.claude-<seat>/sessions/<pid>.json`).
Subagent output: `<same folder>/<sessionId>/subagents/`. Any seat on this machine can read it.

## Merged this sprint
<date>: #<n> #<n>

## Blockers right now
<CI, a red main, an account limit, a missing sign in>
