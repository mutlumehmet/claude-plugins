# claude-forks contract (v1)

A small file contract that lets independent tools agree on which Claude Code session was forked
from which, and carry a fork's report back to its parent. fork-lineage (this plugin) is one such
tool; a session dashboard or a launcher that opens forks can be another.

No tool requires the other. Each reads and writes these files on its own; if the files are missing,
each falls back to its own detection. Anyone installing only one of them gets the full behaviour of
that one. Version 1, agreed 5 October 2026.

## Root

`~/.claude-forks/` (override: `CLAUDE_FORKS_DIR`). No account folder: session ids are UUIDs and unique
across accounts, so every record carries `configDir` instead.

```
~/.claude-forks/
  links/<childId>.json
  reports/<childId>-<ts>.md
  inbox/<parentId>/<childId>-<ts>.json
```

`<ts>` is the creation time as `YYYYMMDDTHHMMSSZ` (UTC), so names sort in time order.

## links/<childId>.json

```json
{
  "v": 1,
  "childId": "…",
  "parentId": "…",
  "configDir": "/Users/me/.claude",
  "cwd": "/Users/me/Projects/x",
  "createdAt": "2026-10-05T15:00:00Z",
  "detectedBy": "forkedFrom",
  "state": "handed_back",
  "handedBackAt": "2026-10-05T16:00:00Z",
  "notNeededAt": null,
  "reportPath": "reports/<childId>-<ts>.md"
}
```

- `detectedBy`: how the parent was found, most reliable first:
  1. `forkedFrom`: the transcript's own `forkedFrom.sessionId` field. It is filled on some sessions
     and absent on others (25 of 62 linked sessions on one machine, 5 October 2026), so it is
     used when present, never relied on.
  2. `launch`: the tool that launched the fork recorded parent id, custom title and launch time, and
     the fork's first message uuid exists in that parent.
  3. `uuid`: shared message uuids. A fork copies its parent's messages with the same uuids.
     - **Candidates:** every transcript in the same config dir, in any project folder, that holds the
       fork's first message uuid (not "same first uuid": a fork of a compacted session starts mid way).
     - **Older:** a candidate must be older than the fork by file birth time (copied lines keep the
       parent's timestamps). When two births are within 5 seconds (a copied config dir gives every
       file a fresh birth time), the older is the one whose first message of its own, past what they
       share, is earlier. Real quick forks were 30 seconds apart.
     - **Score:** most shared uuids, then the longest shared prefix, then the oldest. The count alone
       ties a fork of a fresh fork with its grandparent; the prefix splits them. The prefix alone
       fails when the parent was rewound or compacted. The oldest settles siblings, which tie with the
       real parent, because a parent is always born first.
     - **Measured** 5 October 2026 against the transcript field, with the field ignored: 25 of 25
       (full rule). A simpler rule (count, then oldest) got 45 of 47.
- A tool may write a link only to cache what it detected. If a link file exists and the tool's own
  detection disagrees, the more reliable `detectedBy` wins; on equal reliability, keep the file.
- Titles are never stored: every tool reads the current title (last `custom-title` line) at display
  time, so renames never break a link.

## States

| State | Meaning | Stored? |
|---|---|---|
| `live` | the fork has a running process | no, derived |
| `ended` | the fork's process is gone, no decision yet | no, derived |
| `handed_back` | a report was approved and queued for the parent | yes, with `handedBackAt` |
| `not_needed` | the user said no report is needed (or they did it by hand) | yes, with `notNeededAt` |

A fork is a **reminder candidate** when it is `ended`, has at least one prompt of its own (a prompt
uuid its parent does not hold), and has no stored state.

## Report

The report is written by the fork's own Claude, in the fork, from this prompt, used word for word by
every tool:

```
Summarise what we decided, changed and left open in this fork, for the parent session. Short bullets.
```

The prompt may be preceded by one briefing line naming the fork, its parent and where the fork's
own work starts, then a blank line; the prompt itself stays word for word. Without it the model once
reported as the parent, misled by the parent's name in the copied history (first real test,
5 October 2026), and once ended its report with a question of its own ("Reply yes to send..."),
so the line asks for the report alone (second test, 5 October 2026). Every tool sends:

```
You are the fork "<fork title>" (session <id>), forked from the parent session "<parent title>" (session <id>). This fork's own work starts at the prompt "<first own prompt, 160 chars>"; everything before it was the parent's. Report only what happened in this fork, and reply with the report alone.
```

The first own prompt is the fork's first human prompt whose uuid the parent does not hold; when there
is none, the middle sentence is left out. A tool finding the reply looks for the prompt anywhere in
the message, not only at its start.

The reply is saved to `reports/<childId>-<ts>.md` only after the user has seen and approved it.
Nothing in this contract is automatic: a report is only ever created and sent on the user's action.

## inbox/<parentId>/<childId>-<ts>.json

```json
{
  "v": 1,
  "childId": "…",
  "parentId": "…",
  "reportPath": "reports/<childId>-<ts>.md",
  "createdAt": "2026-10-05T16:00:00Z",
  "deliveredAt": null,
  "deliveredBy": null
}
```

`deliveredBy`: `hook` | `resume` | `clipboard` | `sendmessage`.

Delivery paths:

- **hook** (fork-lineage): the parent's `UserPromptSubmit` hook (live parent, at its next prompt) or
  `SessionStart` hook (on resume) adds the report as context once.
- **resume** (a launcher, parent closed): `claude --resume <parentId> "<report>"` in a new terminal.
  This sends at once, so only after approval.
- **sendmessage** (fork-lineage, parent live): `$.session.send({ to: { sessionId: parentId } })`, addressed
  by session id, so no name mapping. If it reports not delivered, the entry stays for the hook.
- **clipboard** (a dashboard, parent live, mod not installed): report on the clipboard and the parent's
  terminal brought to the front; the user pastes.

## Retention

Agreed 5 October 2026. Each tool may run this cleanup, at most once a day (fork-lineage at session start,
a long running tool at its own start and then daily). Running it twice is harmless.

"Transcript gone" means no `<configDir>/projects/*/<sessionId>.jsonl` in **any** config dir named in
the links (plus the tool's own accounts), not only the running account.

1. A **link** whose child's transcript is gone is deleted, with that child's reports.
2. A **delivered** inbox entry is deleted when its child's or parent's transcript is gone, or when it
   was delivered more than 30 days ago.
3. An **undelivered** inbox entry is never deleted, and neither is the report it points to.
4. Empty `inbox/<parentId>/` folders are removed.
5. Files with `v` greater than the tool knows are left alone.

## Rules

1. **Deliver once.** Whoever delivers sets `deliveredAt` and `deliveredBy` before or at delivery.
   Every tool skips an inbox entry whose `deliveredAt` is set. A hook that finds an undelivered entry
   claims it by writing `deliveredAt` first, then injects.
2. **Atomic writes.** Write `<file>.tmp`, then rename over the target.
3. **Unknown fields are kept and ignored.** Read, change only your fields, write back the rest.
4. **`v`** is the contract version. A tool that sees a higher `v` than it knows reads what it
   understands and does not write that file.
5. **Never touch Claude Code's own files.** Transcripts and `.claude.json` are read only.
6. **Content stays local.** Reports hold conversation content (sometimes client content). Nothing
   under `~/.claude-forks/` is committed or sent anywhere.
