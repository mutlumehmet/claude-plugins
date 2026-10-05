// fork-lineage: knows which session this one was forked from, and carries a
// fork's report back to its parent, only when the person asks.
//
// - The band shows `⑂ fork of <parent title>` with a `↑ report to parent` button
//   while the fork has prompts of its own that were never reported, and
//   `⑂ N forks` on a parent. Titles are read live, so renames never break it.
// - /lineage prints the family tree; /report-parent does what the button does.
// - A parent with a waiting report shows a blinking `📬 N reports waiting` and a
//   Read button: pressed, the report shows in the transcript and joins the
//   conversation with no turn run. Unpressed, it rides along with the next prompt.
// - A report is written by the fork's own model from the contract's prompt, shown,
//   and sent only after the person picks Send: live to the parent session by id,
//   else into the parent's inbox, which this mod's prompt.submit hook adds to the
//   parent's next prompt (claimed first, so it arrives once).
// - Never automatic. At 80% and 90% context an unreported fork gets a toast.
// - Once a day it deletes the files of sessions whose transcript Claude Code has
//   removed, and inbox entries delivered over 30 days ago; never an undelivered one.
//
// Files follow the claude-forks contract v1 (CONTRACT.md beside the README);
// hooks/lineage.py does every read of transcripts and every write.

import type { EngineInterface, Register } from 'claude-code'

const PROMPT =
  'Summarise what we decided, changed and left open in this fork, for the parent session. Short bullets.'
const REMIND_AT = [80, 90]
const PRUNE_KEY = 'last-prune'
const BLINK_MS = 800
const DAY_MS = 86_400_000

type Row = {
  id: string
  title: string | null
  parentId: string | null
  detectedBy: string | null
  born: number
  ownPrompts: number
  lastOwnPromptAt: string | null
  firstOwnPrompt?: string | null
  state: string | null
  handedBackAt: string | null
  notNeededAt: string | null
}
type Lineage = { self: Row; parent: Row | null; children: Row[]; family: Row[] }

let lineage: Lineage | null = null
let waiting = 0
let isLit = false
let blink: { cancel: () => void } | null = null
let isReading = false
// Reports read with the button that the conversation refused: they go with the next prompt
let unsent: string[] = []
let reminded = 0
let isBusy = false

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'lineage', description: 'Show which session this one was forked from, and its forks' })
    await $.command.register({ name: 'report-parent', description: 'Write a report of this fork, show it, and send it to the parent session if you approve' })
    try {
      await prune($)
    } catch {}
    await refresh($)
    if (waiting > 0) {
      $.ui.toast(waiting + ' fork report' + (waiting > 1 ? 's' : '') + ' waiting: press Read in the band')
    }
    return next(e)
  })

  // A parent's inbox: reports from its forks ride along with the next prompt
  on('prompt.submit', async ($, e, next) => {
    const reports = [...unsent, ...(await claimReports($))]
    unsent = []
    if (reports.length === 0) return next(e)
    $.ui.toast(reports.length + ' fork report' + (reports.length > 1 ? 's' : '') + ' added to this prompt')
    return next({ ...e, context: [...(e.context ?? []), ...reports] })
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    await refresh($)
    await remind($)
    return result
  })

  on('command.run', { command: 'lineage' }, async ($) => {
    await refresh($)
    return { text: tree() }
  })

  on('command.run', { command: 'report-parent' }, async ($) => {
    await report($)
    return { text: '' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !lineage) return below
    const { Box, Button, Text } = $.ui.resolve(e)
    const parent = lineage.parent
    const kids = lineage.children.length
    if (!parent && kids === 0 && waiting === 0) return below
    const width = e.props.bodyColumns
    const name = parent ? clip(parent.title ?? parent.id.slice(0, 8), Math.max(12, width - 40)) : ''
    const line = (
      <Box>
        {parent ? <Text color="magenta">{'⑂ fork of '}</Text> : null}
        {parent ? <Text bold>{name}</Text> : null}
        {parent && isPending() ? <Text>{'  '}</Text> : null}
        {parent && isPending() ? (
          <Button key="report" label={isBusy ? 'writing report…' : '↑ report to parent'} onPress={() => report($)} />
        ) : null}
        {parent && !isPending() ? <Text dimColor>{'  ' + doneLabel()}</Text> : null}
        {kids > 0 ? <Text dimColor>{(parent ? '  · ' : '') + '⑂ ' + kids + ' fork' + (kids > 1 ? 's' : '')}</Text> : null}
        {waiting > 0 ? <Text color={isLit ? 'yellow' : undefined} bold={isLit} dimColor={!isLit}>{'  📬 ' + waiting + ' report' + (waiting > 1 ? 's' : '') + ' waiting '}</Text> : null}
        {waiting > 0 ? (
          <Button key="read" label={isReading ? 'reading…' : 'Read'} onPress={() => readNow($)} />
        ) : null}
      </Box>
    )
    if (!below) return line
    return (
      <Box flexDirection="column">
        {below}
        {line}
      </Box>
    )
  })
}

async function paths($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? home + '/.claude'
  const forksDir = (await $.env.get('CLAUDE_FORKS_DIR')) ?? home + '/.claude-forks'
  return {
    configDir: configDir.replace(/\/+$/, ''),
    forksDir,
    script: $.plugin.root + '/hooks/lineage.py',
    id: await $.session.id(),
    cwd: await $.session.cwd(),
  }
}

async function helper($: EngineInterface, args: string[], stdin?: string): Promise<any> {
  const p = await paths($)
  const run = await $.process.run(['python3', p.script, ...args], { stdin, timeoutMs: 30000 })
  if (run.exitCode !== 0) {
    $.ui.log('fork-lineage: ' + args[0] + ' failed: ' + run.stderr.trim().split('\n').pop(), { to: 'debug' })
    return null
  }
  try {
    return JSON.parse(run.stdout)
  } catch {
    return null
  }
}

async function refresh($: EngineInterface) {
  const p = await paths($)
  const shown = await helper($, ['show', p.configDir, p.forksDir, p.id])
  lineage = shown && shown.self ? (shown as Lineage) : null
  const w = await helper($, ['waiting', p.forksDir, p.id])
  waiting = w && Array.isArray(w.waiting) ? w.waiting.length : 0
  if (waiting > 0 && !blink) blink = $.clock.every(BLINK_MS, () => flash($))
  if (waiting === 0 && blink) {
    blink.cancel()
    blink = null
    isLit = false
  }
  $.ui.invalidate('ui.render')
}

// The waiting line blinks until the reports are read
function flash($: EngineInterface) {
  isLit = !isLit
  $.ui.invalidate('ui.render')
}

// Read pressed: each waiting report is shown in the transcript and added to the
// conversation as a user row the model reads, with no turn run. Claimed first,
// so it never arrives twice; the next prompt finds nothing left to add.
async function readNow($: EngineInterface) {
  if (isReading) return
  isReading = true
  $.ui.invalidate('ui.render')
  try {
    const reports = await claimReports($)
    for (const text of reports) {
      logLines($, text)
      try {
        const added = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
        if ('deny' in added) unsent.push(text)
      } catch {
        unsent.push(text)
      }
    }
    if (reports.length) $.ui.toast(reports.length + ' fork report' + (reports.length > 1 ? 's' : '') + ' read and added to the conversation')
  } finally {
    isReading = false
    await refresh($)
  }
}

// At most once a day: drop the files of sessions whose transcript is gone
async function prune($: EngineInterface) {
  const now = await $.clock.now()
  let last = 0
  try {
    last = Number(await $.store.get(PRUNE_KEY)) || 0
  } catch {}
  if (last && now - last < DAY_MS) return
  const p = await paths($)
  await helper($, ['prune', p.forksDir, p.configDir])
  try {
    await $.store.set(PRUNE_KEY, now)
  } catch {}
}

// A fork with prompts of its own after its last report, and not marked not needed
function isPending(): boolean {
  const me = lineage?.self
  if (!me || !lineage?.parent || me.ownPrompts === 0) return false
  if (me.state === 'not_needed') return false
  if (!me.handedBackAt) return true
  return !!me.lastOwnPromptAt && me.lastOwnPromptAt > me.handedBackAt
}

function doneLabel(): string {
  const me = lineage?.self
  if (me?.state === 'not_needed') return 'no report needed'
  if (me?.handedBackAt) return '✓ reported'
  return 'nothing to report yet'
}

async function remind($: EngineInterface) {
  if (!isPending()) return
  const { context } = await $.session.usage()
  const pct = context.percent ?? 0
  const level = REMIND_AT.filter((x) => pct >= x).pop() ?? 0
  if (level > reminded) {
    reminded = level
    $.ui.toast('Context at ' + level + '%: this fork has not reported to its parent yet. Press ↑ report to parent in the band')
  }
}

async function report($: EngineInterface) {
  if (isBusy) return
  await refresh($)
  const parent = lineage?.parent
  if (!lineage || !parent) {
    $.ui.toast('This session is not a fork, so there is no parent to report to')
    return
  }
  isBusy = true
  $.ui.invalidate('ui.render')
  try {
    const reply = await $.model.fork({ prompt: briefing(lineage.self, parent) + '\n\n' + PROMPT })
    if (!reply.isAnswered) {
      $.ui.toast('No report written (' + reply.reason + ')')
      return
    }
    const title = parent.title ?? parent.id.slice(0, 8)
    logLines($, 'Report for the parent "' + title + '":\n' + reply.text)
    let choice = 'Cancel'
    try {
      choice = await $.ui.ask('Send this report to the parent session "' + title + '"?', {
        header: 'Report',
        options: ['Send to parent', 'Not needed', 'Cancel'],
      })
    } catch {}
    const p = await paths($)
    if (choice === 'Send to parent') {
      const sent = await $.session.send({ to: { sessionId: parent.id }, text: frame(lineage.self, reply.text) })
      await helper(
        $,
        ['handback', p.forksDir, p.id, parent.id, p.configDir, p.cwd, sent.isDelivered ? 'sendmessage' : '-'],
        reply.text,
      )
      $.ui.toast(
        sent.isDelivered
          ? 'Report sent to "' + title + '"'
          : 'Parent is not running: the report waits in its inbox for its next prompt',
      )
    } else if (choice === 'Not needed') {
      await helper($, ['not-needed', p.forksDir, p.id, parent.id, p.configDir, p.cwd])
      $.ui.toast('Marked: no report needed')
    }
  } finally {
    isBusy = false
    await refresh($)
  }
}

// The fork's transcript opens with the parent's conversation (and often the parent's
// name), so the model is told outright which side it is on before the contract prompt
function briefing(me: Row, parent: Row): string {
  const own = me.firstOwnPrompt ? ' This fork\'s own work starts at the prompt "' + me.firstOwnPrompt + '"; everything before it was the parent\'s.' : ''
  return (
    'You are the fork "' + (me.title ?? me.id) + '" (session ' + me.id + '), forked from the parent session "' +
    (parent.title ?? parent.id) + '" (session ' + parent.id + ').' + own + ' Report only what happened in this fork, and reply with the report alone.'
  )
}

// A transcript line takes no line breaks (they show as a replacement glyph), so a
// report is logged one line at a time, blank lines left out
function logLines($: EngineInterface, text: string) {
  for (const line of text.replace(/\r/g, '').split('\n')) if (line.trim()) $.ui.log(line)
}

function frame(me: Row, text: string): string {
  return 'Report from your fork "' + (me.title ?? me.id.slice(0, 8)) + '" (session ' + me.id + '):\n\n' + text.trim()
}

// The parent side: claim each waiting report and hand its text to the model
async function claimReports($: EngineInterface): Promise<string[]> {
  if (waiting === 0) return []
  const p = await paths($)
  const out = await helper($, ['claim', p.forksDir, p.id])
  waiting = 0
  $.ui.invalidate('ui.render')
  if (!out || !Array.isArray(out.reports)) return []
  const titles = new Map((lineage?.family ?? []).map((r) => [r.id, r.title]))
  return out.reports.map(
    (r: { childId: string; text: string }) =>
      'Report from your fork "' + (titles.get(r.childId) ?? r.childId.slice(0, 8)) + '" (session ' + r.childId + '):\n\n' + r.text.trim(),
  )
}

function tree(): string {
  if (!lineage) return 'No lineage: this session has no transcript yet.'
  const rows = lineage.family
  const ids = new Set(rows.map((r) => r.id))
  const kids = new Map<string | null, Row[]>()
  for (const r of rows) {
    const key = r.parentId && ids.has(r.parentId) ? r.parentId : null
    kids.set(key, [...(kids.get(key) ?? []), r])
  }
  const out: string[] = []
  const walk = (r: Row, depth: number) => {
    const label = r.title ?? r.id.slice(0, 8)
    const state = r.state === 'handed_back' ? ' ✓ reported' : r.state === 'not_needed' ? ' · not needed' : ''
    const you = r.id === lineage!.self.id ? '   ← this session' : ''
    out.push((depth ? '  '.repeat(depth - 1) + '└ ' : '') + label + '  (' + r.id.slice(0, 8) + ')' + state + you)
    for (const k of kids.get(r.id) ?? []) walk(k, depth + 1)
  }
  for (const r of kids.get(null) ?? []) walk(r, 0)
  if (rows.length === 1) out.push('No forks: this session was not forked from another, and has no forks.')
  return out.join('\n')
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
