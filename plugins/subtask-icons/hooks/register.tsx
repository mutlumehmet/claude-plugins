// subtask-icons: one small "⑂ Subtask" button under Claude's last answer. A press
// opens a picker of the answer's items; picking one puts "/subtask <the item's text>" in the prompt box and sends nothing, so
// you can add your own words ("let's do it", "but make it interactive") before
// Enter. A second press while the box already holds a /subtask adds that item
// on a new line, so several items go to one subtask.
// From the keyboard: /st opens a picker pane with every item in full (a press
// or the item's number fills it), /st 3 fills the third directly.
// A "Pin list" button beside it pins that answer's items in the band above the prompt,
// so the list stays in view however the conversation scrolls, until you unpin it or
// pin another answer; nothing pins by itself. /st pin pins the newest list from the
// keyboard. Items later sent with /subtask get a ⑂. /subtask unpin, /st unpin or the
// Unpin button clears it. The pin and the recent lists live in the host's state, so a
// later answer or a hot reload does not move or lose it.

import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { Pinned } from '../types'

// The mods API a hook receives as $
type Api = Parameters<Hook<'command.run'>>[0]

const MAX_ITEMS = 12
const LABEL_CHARS = 28
const PICKER = 'st-picker'
// Rows the pinned list shows before a "+N more" line
const PIN_ROWS = 5
// How many answers with a list stay pin candidates
const KEEP_ANSWERS = 10

const answers = atom({ plugin: 'subtask-icons', key: 'answers' } as const, [] as string[])
const pinnedAtom = atom({ plugin: 'subtask-icons', key: 'pinned' } as const, null as Pinned | null)

// label: the short icon text; title: the item's whole first line, for the picker
export type Unit = { label: string; title: string; text: string }

// Line shapes
const FENCE = /^\s*(```|~~~)/
const HEADING = /^#{1,6}\s/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const BOLD_LINE = /^\s{0,3}\*\*[^*].*\*\*:?\s*$/
const NUMBERED_BOLD = /^\s{0,3}\*\*\d+[.)]\s+.+\*\*:?\s*$/
const NUMBERED_HEADING = /^#{1,6}\s+\d+[.)]\s+/
const NUMBERED_ITEM = /^\s{0,3}\d+[.)]\s+\S/
const BULLET_ITEM = /^\s{0,1}[-*+]\s+\S/
const INDENTED = /^\s{2,}\S/

// Splits an answer into the items that get an icon: numbered items (a
// "1. ..." list item, a "**1. ...**" line or a "## 1. ..." heading, each with
// what follows it), then top-level bullets that sit outside a numbered item.
export function findUnits(answer: string): Unit[] {
  const lines = answer.split('\n')
  const at = (k: number) => lines[k] ?? ''

  // Lines inside a code fence never start an item
  const inFence: boolean[] = []
  let fenced = false
  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence.push(true)
      fenced = !fenced
    } else inFence.push(fenced)
  }

  type Span = { start: number; end: number; numbered: boolean }
  const spans: Span[] = []

  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue
    const line = at(i)
    const isSection = NUMBERED_BOLD.test(line) || NUMBERED_HEADING.test(line)
    const isNumbered = NUMBERED_ITEM.test(line)
    const isBullet = BULLET_ITEM.test(line) && !RULE.test(line)
    if (!isSection && !isNumbered && !isBullet) continue

    let end = i + 1
    while (end < lines.length) {
      const next = at(end)
      if (!inFence[end]) {
        if (HEADING.test(next) || BOLD_LINE.test(next) || RULE.test(next)) break
        if (isSection) {
          // A section runs to the next section, heading or bold line
          end++
          continue
        }
        if (NUMBERED_ITEM.test(next) || BULLET_ITEM.test(next)) break
        if (next.trim() === '') {
          // A blank line ends a list item unless indented text follows it
          const after = lines.slice(end + 1).find((l) => l.trim() !== '')
          if (after === undefined || !INDENTED.test(after)) break
        } else if (!INDENTED.test(next)) break
      }
      end++
    }
    spans.push({ start: i, end, numbered: isSection || isNumbered })
    if (isSection) i = end - 1
  }

  // Bullets inside a numbered item belong to it
  const numbered = spans.filter((s) => s.numbered)
  const kept = spans.filter(
    (s) => s.numbered || !numbered.some((n) => s.start > n.start && s.start < n.end),
  )
  // A numbered list item inside a numbered section belongs to the section
  const sections = kept.filter((s) => NUMBERED_BOLD.test(at(s.start)) || NUMBERED_HEADING.test(at(s.start)))
  const units = kept.filter((s) => !sections.some((n) => s !== n && s.start > n.start && s.start < n.end))

  return units.slice(0, MAX_ITEMS).map((s) => {
    const text = lines
      .slice(s.start, s.end)
      .join('\n')
      .replace(/\*\*/g, '')
      .trim()
      // A bullet's marker adds nothing to the subtask; a number does
      .replace(/^[-*+]\s+/, '')
    return { label: labelOf(at(s.start)), title: titleOf(at(s.start)), text }
  })
}

// The whole first line without its marker, bold or backticks
export function titleOf(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
    .replace(/^(\d+[.)]|[-*+])\s+/, '')
    .replace(/:\s*$/, '')
    .trim()
}

function fit(s: string, width: number): string {
  return s.length > width ? s.slice(0, Math.max(1, width - 1)).trimEnd() + '…' : s
}

// The first line without its marker, bold, backticks or trailing colon, cut short
export function labelOf(line: string): string {
  const clean = line
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
    .replace(/^(\d+[.)]|[-*+])\s+/, '')
    .replace(/:\s*$/, '')
    .split(/:\s/)[0]
    ?.trim() ?? ''
  return clean.length > LABEL_CHARS ? clean.slice(0, LABEL_CHARS - 1).trimEnd() + '…' : clean
}

// What the prompt box holds after a press: a new /subtask, one more item on a
// /subtask already there, or a /subtask in front of what was typed
export function composeDraft(draft: string, item: string): string {
  if (draft.trim() === '') return '/subtask ' + item + ' '
  if (/^\/subtask\b/.test(draft.trimStart())) return draft.trimEnd() + '\n' + item + ' '
  return '/subtask ' + item + '\n' + draft.trim() + ' '
}

// True for the text block that ends the last answer
export function isLastBlock(blockText: string, answer: string): boolean {
  const block = blockText.trim()
  return block.length > 0 && answer.trim().endsWith(block)
}

// Module variables: a hot reload clears them, which only hides the button until
// the next answer; the pin and its candidates are in the host's state
let lastAnswer = ''
let isWorking = false

// The items a /subtask text names: an item counts as sent when the text holds its title
export function sentItems(units: Unit[], text: string): number[] {
  const body = text.toLowerCase()
  return units.flatMap((u, i) => (u.title && body.includes(u.title.toLowerCase()) ? [i] : []))
}

// Which answer a /subtask was taken from: the newest one whose items the text
// names, else the newest one that has a list. Candidates run oldest to newest.
export function pickAnswer(candidates: readonly string[], text: string): string | null {
  for (let k = candidates.length - 1; k >= 0; k--) {
    const answer = candidates[k] ?? ''
    if (sentItems(findUnits(answer), text).length > 0) return answer
  }
  return candidates[candidates.length - 1] ?? null
}

// Adds an answer with a list to the candidates, newest last, keeping the last few
export function remember(candidates: readonly string[], answer: string): string[] {
  if (findUnits(answer).length === 0) return [...candidates]
  return [...candidates.filter((a) => a !== answer), answer].slice(-KEEP_ANSWERS)
}

// The newest answer with a list: the last one, or an earlier one when the last had none
async function listAnswer($: Api): Promise<string> {
  if (findUnits(lastAnswer).length > 0) return lastAnswer
  const all = await read($, answers)
  return all[all.length - 1] ?? ''
}

// Pins this answer's items; pinning the answer already pinned keeps its marks
async function pinAnswer($: Api, answer: string): Promise<boolean> {
  if (findUnits(answer).length === 0) return false
  await update($, pinnedAtom, (old) => (old && old.answer === answer ? old : { answer, sent: [] }))
  $.ui.invalidate('ui.render')
  return true
}

// Marks the items a /subtask names on the pinned list; the pin itself never moves here
async function markSent($: Api, args: string) {
  const pinned = await read($, pinnedAtom)
  if (!pinned) return
  const hits = sentItems(findUnits(pinned.answer), args)
  if (hits.length === 0) return
  await update($, pinnedAtom, (old) => {
    if (!old) return old
    const sent = new Set([...old.sent, ...hits])
    return { ...old, sent: [...sent].sort((a, b) => a - b) }
  })
  $.ui.invalidate('ui.render')
}

async function unpin($: Api) {
  await update($, pinnedAtom, () => null)
  $.ui.invalidate('ui.render')
}
// The items the open picker shows, fixed when /st opened it
let pickerUnits: Unit[] = []

async function fillItem($: Api, item: string) {
  const box = await $.prompt.read()
  const done = await $.prompt.fill({ text: composeDraft(box.text, item), mode: 'replace' })
  if (!done.isFilled) $.ui.toast('⑂ Could not fill the prompt box (a dialog may be open)')
}

// Opens the Subtask picker with these items; true when the pane is drawn
async function openPicker($: Api, units: Unit[]): Promise<boolean> {
  pickerUnits = units
  const opened = await $.ui.open({
    id: PICKER,
    title: 'Subtask',
    focus: true,
    closeOnEscape: true,
    rows: Math.min(units.length + 2, 16),
  })
  return opened.isPlaced
}

async function pick($: Api, item: string) {
  await $.ui.close({ id: PICKER })
  await fillItem($, item)
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'st',
      description: 'Pick an item of the last answer for /subtask, or put item N in the prompt box',
      argumentHint: '[N]',
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Subagent turns end inside the main one; only the main answer counts
    if (!e.agentId) {
      isWorking = false
      lastAnswer = e.reason === 'answer' ? e.answer : ''
      if (findUnits(lastAnswer).length > 0) {
        const answer = lastAnswer
        await update($, answers, (old) => remember(old, answer))
      }
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // /subtask belongs to Claude Code; the mod watches it to mark pinned items sent,
  // and answers only "unpin"
  on('command.run', { command: 'subtask' }, async ($, e, next) => {
    const args = String(e.args ?? '').trim()
    if (args === 'unpin') {
      await unpin($)
      return { text: 'Unpinned the list.' }
    }
    await markSent($, args)
    return next(e)
  })

  on('command.run', { command: 'st' }, async ($, e) => {
    const arg = String(e.args ?? '').trim()
    if (arg === 'unpin') {
      await unpin($)
      return { text: 'Unpinned the list.' }
    }
    if (arg === 'pin') {
      return { text: (await pinAnswer($, await listAnswer($))) ? 'Pinned the list.' : 'No answer with a list to pin.' }
    }
    const units = findUnits(await listAnswer($))
    if (units.length === 0) return { text: 'The last answer has no items.' }
    const n = Number.parseInt(String(e.args ?? '').trim(), 10)
    if (!Number.isInteger(n)) {
      if (await openPicker($, units)) return {}
      // Where no pane can be drawn, the list in full as text
      return { text: units.map((u, i) => i + 1 + '. ' + u.title).join('\n') + '\n\n/st N puts item N in the prompt box.' }
    }
    if (n < 1 || n > units.length) return { text: 'No item ' + n + '. The last answer has ' + units.length + '.' }
    // Wait for the box to clear of the "/st N" just sent before filling it
    const item = units[n - 1]?.text ?? ''
    $.clock.after(150, () => fillItem($, item))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: 'st-picker' }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const width = Math.max(10, e.props.bodyColumns - 2)
    return (
      <Box flexDirection="column">
        <Text dimColor>{fit('Pick an item, or type its number. Esc closes.', width)}</Text>
        {pickerUnits.map((u, i) => (
          <Button
            key={'pick-' + (i + 1)}
            plain
            {...(i < 9 ? { hotkey: String(i + 1) } : {})}
            {...(i === 0 ? { autoFocus: true as const } : {})}
            onPress={() => pick($, u.text)}
          >
            {fit(i + 1 + '. ' + u.title, width)}
          </Button>
        ))}
      </Box>
    )
  })

  // The pinned list sits on top of the band, above whatever else is there
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const pinned = await read($, pinnedAtom)
    if (!pinned || e.props.hasSurvey) return below
    const units = findUnits(pinned.answer)
    if (units.length === 0) return below
    const { Box, Button, Text } = $.ui.resolve(e)
    // A column at the right end of the band, like the Arcade games, so the rest of the band keeps its place.
    const columns = e.props.bodyColumns ?? 80
    const width = Math.max(24, Math.min(44, Math.floor(columns / 3)))
    const shown = units.slice(0, PIN_ROWS)
    const more = units.length - shown.length
    const sent = new Set(pinned.sent)
    const list = (
      <Box flexDirection="column" flexShrink={0} width={width} marginLeft={2}>
        <Box flexDirection="row">
          <Text dimColor>{'⑂ Pinned  '}</Text>
          <Button key="pin-unpin" plain dimColor onPress={() => unpin($)}>
            Unpin
          </Button>
        </Box>
        {shown.map((u, i) => (
          // Each item is a button: a press puts /subtask <item> in the prompt box, as the picker does.
          <Button key={'pin-' + (i + 1)} plain dimColor onPress={() => fillItem($, u.text)}>
            {fit((sent.has(i) ? '⑂ ' : '  ') + (i + 1) + '. ' + u.title, width)}
          </Button>
        ))}
        {more > 0 && <Text key="pin-more" dimColor>{fit('   +' + more + ' more (/st lists them all)', width)}</Text>}
      </Box>
    )
    if (!below) return <Box flexDirection="row" justifyContent="flex-end">{list}</Box>
    return (
      <Box flexDirection="row" alignItems="flex-end">
        <Box flexGrow={1} flexDirection="column">
          {below}
        </Box>
        {list}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const own = await next(e)
    if (isWorking || e.surface === 'vscode' || e.surface === 'mobile') return own
    if (!isLastBlock(e.props.text, lastAnswer)) return own
    const units = findUnits(lastAnswer)
    if (units.length === 0) return own

    // Two quiet buttons: Subtask opens the picker, Pin keeps this list in the band
    const { Box, Button, Text } = $.ui.resolve(e)
    const answer = lastAnswer
    const pinned = await read($, pinnedAtom)
    const isPinned = pinned?.answer === answer
    return (
      <Box flexDirection="column">
        {own}
        <Box flexDirection="row">
          <Button key="st-open" plain dimColor onPress={async () => {
            if (!(await openPicker($, units))) $.ui.toast('⑂ Use /st to list the items')
          }}>
            {'⑂ Subtask (' + units.length + ')'}
          </Button>
          <Text dimColor>{'   '}</Text>
          <Button key="st-pin" plain dimColor onPress={() => (isPinned ? unpin($) : pinAnswer($, answer))}>
            {isPinned ? 'Unpin list' : 'Pin list'}
          </Button>
        </Box>
      </Box>
    )
  })
}
