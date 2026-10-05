import { expect, mock, test } from 'claude-code/testing'
// @ts-ignore: the test kit loads .tsx paths; tsc wants allowImportingTsExtensions
import { composeDraft, findUnits, labelOf, pickAnswer, remember } from '../hooks/register.tsx'

// Shapes like real answers: numbered bold sections, numbered lists, bullets, fences
const NUMBERED_SECTIONS = [
  'In short: it works.',
  '',
  '**1. Session bridge (most useful)**',
  '- `$.prompt.read()` can read the draft.',
  '- `$.prompt.submit` can send a command.',
  '',
  '**2. Message send guard**',
  '`tool.call` holds the sends.',
  '',
  '**Limits:**',
  '- Nothing draws in the VS Code panel.',
  '',
  'Suggestion: number 2 first.',
].join('\n')

const NUMBERED_LIST = [
  '**Suggested order:**',
  '1. **Dash guard:** refuses an em dash.',
  '   The rule repeats in 5 skills.',
  '2. **Ask first buttons:** Haiku scans the answer.',
  '',
  '**Others, briefly:**',
  '- **Browser send guard:** asks before Submit.',
  '- **Context full reminder:** an 80% warning.',
  '',
  '```',
  '- not an item',
  '1. not an item either',
  '```',
].join('\n')

test('numbered bold sections are items, with their bullets inside them', () => {
  const units = findUnits(NUMBERED_SECTIONS)
  expect(units.map((u) => u.label)).toEqual(['Session bridge (most useful)', 'Message send guard', 'Nothing draws in the VS Cod…'])
  expect(units[0]?.text).toBe('1. Session bridge (most useful)\n- `$.prompt.read()` can read the draft.\n- `$.prompt.submit` can send a command.')
  expect(units[1]?.text).toBe('2. Message send guard\n`tool.call` holds the sends.')
})

test('numbered list items and outside bullets are items; code fences are not', () => {
  const units = findUnits(NUMBERED_LIST)
  expect(units.map((u) => u.label)).toEqual(['Dash guard', 'Ask first buttons', 'Browser send guard', 'Context full reminder'])
  expect(units[0]?.text).toBe('1. Dash guard: refuses an em dash.\n   The rule repeats in 5 skills.')
})

test('an answer with no list gets no items, and the count is capped', () => {
  expect(findUnits('Just a sentence.\n\nAnd another.')).toEqual([])
  const many = Array.from({ length: 20 }, (_, i) => '- item ' + i).join('\n')
  expect(findUnits(many).length).toBe(12)
})

test('labelOf strips markers, bold, backticks and the part after a colon', () => {
  expect(labelOf('- **`/reminders`:** VM listesi')).toBe('/reminders')
  expect(labelOf('## 3. Project band')).toBe('Project band')
})

test('composeDraft starts a subtask, adds to one, or puts one in front', () => {
  expect(composeDraft('', 'A')).toBe('/subtask A ')
  expect(composeDraft('/subtask A ', 'B')).toBe('/subtask A\nB ')
  expect(composeDraft('let us do it', 'A')).toBe('/subtask A\nlet us do it ')
})

function message(text: string) {
  return {
    plugin: 'subtask-icons',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    viewport: { columns: 100, rows: 30 },
    props: { text, isFirstOfReply: true },
  } as const
}

function engine(on: any, filled: string[], draft = '') {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('turn.start', ($: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', ($: unknown, e: any) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
}

test('the last answer gets one Subtask button that opens the picker, and a pick fills the prompt box', async ($, on) => {
  const filled: string[] = []
  const opened: string[] = []
  engine(on, filled)
  on('ui.open', ($: unknown, e: any) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: NUMBERED_LIST, durationMs: 5, isAborted: false, reason: 'answer' })

  const ui = await $.ui.mount(message(NUMBERED_LIST))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(await ui.find({ key: 'st-open' })).toBeDefined()
  expect(await ui.find({ key: 'st-0' })).toBeUndefined()
  await ui.press({ key: 'st-open' })
  expect(opened).toEqual(['st-picker'])
  await ui.unmount()

  const pane = await $.ui.mount({
    plugin: 'subtask-icons', surface: 'terminal', component: 'Pane', requestId: 'st-picker',
    viewport: { columns: 100, rows: 30 },
    props: { title: 'Subtask', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as any)
  await pane.press({ key: 'pick-3' })
  expect(filled).toEqual(['/subtask Browser send guard: asks before Submit. '])
})

test('no button while Claude is working', async ($, on) => {
  engine(on, [])
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: NUMBERED_LIST, durationMs: 5, isAborted: false, reason: 'answer' })
  await $.turn.start({ turnId: 't2', text: 'q' })
  const ui = await $.ui.mount(message(NUMBERED_LIST))
  expect(await ui.find({ key: 'st-open' })).toBeUndefined()
})

test('/st lists the items in full where no pane can open, and /st 2 fills item 2 after the box clears', async ($, on) => {
  const filled: string[] = []
  const clock = mock.clock(on)
  engine(on, filled, '')
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'narrow' } }))
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: NUMBERED_SECTIONS, durationMs: 5, isAborted: false, reason: 'answer' })

  const list = await $.command.run({ command: 'st', args: '' } as any)
  expect(list.text).toContain('2. Message send guard')

  await $.command.run({ command: 'st', args: '2' } as any)
  expect(filled).toEqual([])
  await clock.advance(200)
  expect(filled).toEqual(['/subtask 2. Message send guard\n`tool.call` holds the sends. '])

  const none = await $.command.run({ command: 'st', args: '9' } as any)
  expect(none.text).toBe('No item 9. The last answer has 3.')
})

test('/st with no number opens the picker; a press closes it and fills that item', async ($, on) => {
  const filled: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  engine(on, filled, '')
  on('ui.open', ($: unknown, e: any) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($: unknown, e: any) => {
    closed.push(e.id)
    return { value: undefined }
  })
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: NUMBERED_SECTIONS, durationMs: 5, isAborted: false, reason: 'answer' })

  const r = await $.command.run({ command: 'st', args: '' } as any)
  expect(r.text).toBeUndefined()
  expect(opened).toEqual(['st-picker'])

  const ui = await $.ui.mount({
    plugin: 'subtask-icons',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'st-picker',
    viewport: { columns: 100, rows: 30 },
    props: { title: 'Subtask', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as any)
  expect(await ui.find({ key: 'pick-3' })).toBeDefined()
  expect(await ui.find({ key: 'pick-4' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: '2. Message send guard' })).toBeDefined()
  await ui.press({ key: 'pick-2' })
  expect(closed).toEqual(['st-picker'])
  expect(filled).toEqual(['/subtask 2. Message send guard\n`tool.call` holds the sends. '])
})

function band() {
  return {
    plugin: 'subtask-icons',
    surface: 'terminal',
    component: 'AbovePrompt',
    viewport: { columns: 100, rows: 30 },
    props: { hasSurvey: false, isWorking: false, bodyColumns: 100 },
  } as any
}

test('/subtask alone pins nothing; the Pin list button pins, /subtask marks the item, /subtask unpin clears it', async ($, on) => {
  const forked: string[] = []
  engine(on, [])
  on('command.run', { command: 'subtask' }, ($: unknown, e: any) => {
    forked.push(e.args)
    return { text: 'forked' }
  })
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: NUMBERED_LIST, durationMs: 5, isAborted: false, reason: 'answer' })

  await $.command.run({ command: 'subtask', args: 'Dash guard: refuses an em dash.' } as any)
  const empty = await $.ui.mount(band())
  expect(await empty.find({ key: 'pin-unpin' })).toBeUndefined()
  await empty.unmount()

  const msg = await $.ui.mount(message(NUMBERED_LIST))
  expect(await msg.find({ key: 'st-pin' })).toBeDefined()
  await msg.press({ key: 'st-pin' })
  await msg.unmount()

  await $.command.run({ command: 'subtask', args: 'Ask first buttons: Haiku scans the answer.' } as any)
  expect(forked.length).toBe(2)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ key: 'pin-unpin' })).toBeDefined()
  expect(await ui.find({ key: 'pin-1', text: /^  1\. Dash guard/ })).toBeDefined()
  expect(await ui.find({ key: 'pin-2', text: /^⑂ 2\. Ask first buttons/ })).toBeDefined()
  await ui.unmount()

  const r = await $.command.run({ command: 'subtask', args: 'unpin' } as any)
  expect(r.text).toBe('Unpinned the list.')
  expect(forked.length).toBe(2)
  const after = await $.ui.mount(band())
  expect(await after.find({ key: 'pin-unpin' })).toBeUndefined()
})

test('a long list shows the first rows and a +N more line; the Unpin button clears it', async ($, on) => {
  engine(on, [])
  const many = Array.from({ length: 8 }, (_, i) => '- item ' + (i + 1)).join('\n')
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: many, durationMs: 5, isAborted: false, reason: 'answer' })
  const pinned = await $.command.run({ command: 'st', args: 'pin' } as any)
  expect(pinned.text).toBe('Pinned the list.')
  const ui = await $.ui.mount(band())
  expect(await ui.find({ key: 'pin-5' })).toBeDefined()
  expect(await ui.find({ key: 'pin-6' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '   +3 more (/st lists them all)' })).toBeDefined()
  await ui.press({ key: 'pin-unpin' })
  await ui.unmount()
  const after = await $.ui.mount(band())
  expect(await after.find({ key: 'pin-unpin' })).toBeUndefined()
})

const OTHER_LIST = ['Two options:', '1. **Rename the band:** shorter label.', '2. **Move the stats:** one row up.'].join('\n')

test('a pinned list stays put through later answers, with or without a list', async ($, on) => {
  engine(on, [])
  on('command.run', { command: 'subtask' }, () => ({ text: 'forked' }))
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: NUMBERED_LIST, durationMs: 5, isAborted: false, reason: 'answer' })
  await $.command.run({ command: 'st', args: 'pin' } as any)
  await $.turn.start({ turnId: 't2', text: 'q' })
  await $.turn.complete({ turnId: 't2', answer: 'Noted, the records are updated.', durationMs: 5, isAborted: false, reason: 'answer' })
  await $.turn.start({ turnId: 't3', text: 'q' })
  await $.turn.complete({ turnId: 't3', answer: OTHER_LIST, durationMs: 5, isAborted: false, reason: 'answer' })
  await $.command.run({ command: 'subtask', args: 'Rename the band: shorter label.' } as any)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ key: 'pin-1', text: /^  1\. Dash guard/ })).toBeDefined()
  expect(await ui.find({ key: 'pin-1', text: /Rename the band/ })).toBeUndefined()
})

test('the pin candidates live in the host state, so a reload keeps them', { plugins: [{
  name: 'state-reader',
  register: (on: any) => {
    on('command.run', { command: 'peek' }, async ($: any) => {
      const { value } = await $.state.get({ plugin: 'subtask-icons', key: 'answers' })
      return { text: String((value ?? []).length) }
    })
  },
}] }, async ($, on) => {
  engine(on, [])
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: NUMBERED_LIST, durationMs: 5, isAborted: false, reason: 'answer' })
  await $.turn.start({ turnId: 't2', text: 'q' })
  await $.turn.complete({ turnId: 't2', answer: 'No list here.', durationMs: 5, isAborted: false, reason: 'answer' })
  const peek = await $.command.run({ command: 'peek', args: '' } as any)
  expect(peek.text).toBe('1')
})

test('matching picks the answer the /subtask was taken from, else the newest list', () => {
  const candidates = remember(remember(remember([], NUMBERED_SECTIONS), NUMBERED_LIST), OTHER_LIST)
  expect(candidates.length).toBe(3)
  expect(pickAnswer(candidates, 'Session bridge (most useful)')).toBe(NUMBERED_SECTIONS)
  expect(pickAnswer(candidates, 'Dash guard: refuses an em dash.')).toBe(NUMBERED_LIST)
  expect(pickAnswer(candidates, 'something else entirely')).toBe(OTHER_LIST)
  expect(remember(candidates, 'no list').length).toBe(3)
  const many = Array.from({ length: 12 }, (_, i) => '- only item ' + i).reduce((c, a) => remember(c, a), [] as string[])
  expect(many.length).toBe(10)
})

test('a pinned item is a button: a press puts /subtask with that item in the prompt box', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: '- first thing\n- second thing', durationMs: 5, isAborted: false, reason: 'answer' })
  await $.command.run({ command: 'st', args: 'pin' } as any)
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'pin-2' })
  await ui.unmount()
  expect(filled.length).toBe(1)
  expect(filled[0]).toContain('/subtask')
  expect(filled[0]).toContain('second thing')
})
