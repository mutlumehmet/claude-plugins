import { expect, test } from 'claude-code/testing'
// @ts-ignore: the test kit loads .tsx paths; tsc wants allowImportingTsExtensions
import { listLabel, recentLists } from '../hooks/register.tsx'

const OLDER = ['**Plan:**', '1. **Dash guard:** refuses an em dash.', '2. **Ask first buttons:** scan the answer.'].join('\n')
const NEWER = ['- Rename the band: shorter label.', '- Move the stats line.', '- Drop the old flag.'].join('\n')

function engine(on: any) {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('turn.start', ($: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
}

function band() {
  return {
    plugin: 'subtask-icons',
    surface: 'terminal',
    component: 'AbovePrompt',
    viewport: { columns: 100, rows: 30 },
    props: { hasSurvey: false, isWorking: false, bodyColumns: 100 },
  } as any
}

async function answer($: any, turnId: string, text: string) {
  await $.turn.start({ turnId, text: 'q' })
  await $.turn.complete({ turnId, answer: text, durationMs: 5, isAborted: false, reason: 'answer' })
}

test('recentLists runs newest first and skips answers without a list', () => {
  expect(recentLists([OLDER, 'no list', NEWER])).toEqual([NEWER, OLDER])
  expect(listLabel(NEWER)).toBe('Rename the band (3 items)')
})

test('/st pins lists the recent lists and /st pin 2 pins the older one', async ($, on) => {
  engine(on)
  await answer($, 't1', OLDER)
  await answer($, 't2', 'Noted.')
  await answer($, 't3', NEWER)
  const shown = await $.command.run({ command: 'st', args: 'pins' } as any)
  expect(shown.text).toMatch(/^1\. Rename the band \(3 items\)\n2\. Dash guard \(2 items\)/)
  const pinned = await $.command.run({ command: 'st', args: 'pin 2' } as any)
  expect(pinned.text).toMatch(/Pinned list 2: Dash guard/)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ key: 'pin-1', text: /Dash guard/ })).toBeDefined()
  await ui.unmount()
})

test('/st pin N past the end says how many lists there are', async ($, on) => {
  engine(on)
  await answer($, 't1', NEWER)
  const r = await $.command.run({ command: 'st', args: 'pin 5' } as any)
  expect(r.text).toMatch(/No list 5\. There are 1 recent lists/)
})
