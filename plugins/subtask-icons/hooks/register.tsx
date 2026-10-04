// subtask-icons: one small "⑂ Subtask" button under Claude's last answer. A press
// opens a picker of the answer's items; picking one puts "/subtask <the item's text>" in the prompt box and sends nothing, so
// you can add your own words ("let's do it", "but make it interactive") before
// Enter. A second press while the box already holds a /subtask adds that item
// on a new line, so several items go to one subtask.
// From the keyboard: /st opens a picker pane with every item in full (a press
// or the item's number fills it), /st 3 fills the third directly.

import type { Hook, Register } from 'claude-code'

// The mods API a hook receives as $
type Api = Parameters<Hook<'command.run'>>[0]

const MAX_ITEMS = 12
const LABEL_CHARS = 28
const PICKER = 'st-picker'

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

// Module variables: a hot reload clears them, which only hides the icons
// until the next answer
let lastAnswer = ''
let isWorking = false
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
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('command.run', { command: 'st' }, async ($, e) => {
    const units = findUnits(lastAnswer)
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

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const own = await next(e)
    if (isWorking || e.surface === 'vscode' || e.surface === 'mobile') return own
    if (!isLastBlock(e.props.text, lastAnswer)) return own
    const units = findUnits(lastAnswer)
    if (units.length === 0) return own

    // One quiet button; the items are picked in the pane it opens
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {own}
        <Button key="st-open" plain dimColor onPress={async () => {
          if (!(await openPicker($, units))) $.ui.toast('⑂ Use /st to list the items')
        }}>
          {'⑂ Subtask (' + units.length + ')'}
        </Button>
      </Box>
    )
  })
}
