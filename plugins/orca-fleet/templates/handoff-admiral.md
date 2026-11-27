# Handover: <old name> to <new name> (<date>, <time>)

Written at <percent>% context. Start with `/orca-fleet:admiral <this file>`.

## Read first
1. The rules file (`<rules>`): who may merge what, and whether the person's yes in the Admiral window counts.
2. The Admiral orders file (`<admiral.files.orders>`), newest first.
3. The open-items file (`<openItems>`), rows <first id> to <last id>.

## Fleets
| Fleet | Label | Orchestrator | Address | Context | State | Waiting on the person |
|---|---|---|---|---|---|---|
| <v1> | <V1 build> | <v1 orchestrator #26> | uds:... | <n>% | running | <item> |

## Shared
- Merge lock: <free, or held by whom for which PR>.
- Claims in flight: <migration 0198 by Lane 38 (v1)>.
- Checker pool: <Checker A #17 · demo checks, uds:..., queue n rows>.
- Budgets: <CI spend, account limits>.

## Asked by the person in this window, not finished
Built from this session's own transcript: every message the person typed since the last note.
One row each, nothing compressed into another table. Every row has an open-items id.
| Asked at | What they asked, in their words | State now | Who owns it (session, lane, PR) | Open item |
|---|---|---|---|---|
| <11:38> | <"Ryan wants me to share screenshots on ticket system..."> | <cause found, fix sent, not taken> | <Orchestrator onboarding #3 (unread)> | <S9-1348> |

## Sent to other sessions, not yet confirmed
Every piece of work this session, or a subagent it started, passed to another session since the last
note, until the receiver replied that it took it (named the lane or PR). A row leaves only on that reply.
| What (open item id) | Sent to | Sent at | Receiver state then | Confirmed? |
|---|---|---|---|---|
| <S9-1348 ticket screenshot fix> | <Orchestrator onboarding #3, uds:...> | <11:38> | <waiting on the person> | <no> |

## My transcript (backup)
`~/.claude-<seat>/projects/<project slug>/<sessionId>.jsonl` (sessionId from `~/.claude-<seat>/sessions/<pid>.json`).
Subagent output: `<same folder>/<sessionId>/subagents/`. Any seat on this machine can read it.

## Loops
| Cron | Prompt | Owner | Why |
|---|---|---|---|
| `28 * * * *` | `/orca-fleet:admiral rollup` | Admiral | hourly roll-up |

## Clashes and decisions in flight
<two fleets on the same files, an order of merges agreed, a pause in force>
