import { expect, mock, test } from 'claude-code/testing'

const PARENT = { id: 'p0000000-0000', title: 'checkout refactor', parentId: null, detectedBy: null, born: 1, ownPrompts: 4, lastOwnPromptAt: null, state: null, handedBackAt: null, notNeededAt: null }
const FORK = { id: 'f0000000-0000', title: 'payment tests', parentId: PARENT.id, detectedBy: 'uuid', born: 2, ownPrompts: 2, lastOwnPromptAt: '2026-10-05T10:00:00Z', state: null, handedBackAt: null, notNeededAt: null }

const BAND = {
  plugin: 'fork-lineage',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  viewport: { columns: 120, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 110, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// The helper script, answered per subcommand
function helper(on: any, me: string, answers: Record<string, unknown>, calls: string[][] = [], store: Record<string, unknown> = {}) {
  mock.env(on, { HOME: '/home/m', CLAUDE_CONFIG_DIR: '/home/m/.claude' })
  const clock = mock.clock(on)
  on('store.get', ($: any, e: any) => ({ value: store[e.key] }))
  on('store.set', ($: any, e: any) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }) as any)
  on('session.id', () => ({ value: me }))
  on('session.cwd', () => ({ value: '/home/m/Projects/x' }))
  on('session.start', () => ({ cwd: '/home/m/Projects/x' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine'] }) as any)
  on('process.run', ($: any, e: any) => {
    calls.push(e.argv)
    const out = answers[e.argv[2]] ?? {}
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } } as any
  })
  return clock
}

test('a fork with prompts of its own shows its parent and the report button', async ($, on) => {
  helper(on, FORK.id, { show: { self: FORK, parent: PARENT, children: [], family: [PARENT, FORK] }, waiting: { waiting: [] } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/home/m/Projects/x' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'checkout refactor' })).toBeDefined()
  expect(await ui.find({ type: 'Button', label: '↑ report to parent' } as any)).toBeDefined()
})

test('a reported fork with nothing new shows reported, no button', async ($, on) => {
  const done = { ...FORK, state: 'handed_back', handedBackAt: '2026-10-05T11:00:00Z' }
  helper(on, FORK.id, { show: { self: done, parent: PARENT, children: [], family: [PARENT, done] }, waiting: { waiting: [] } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/home/m/Projects/x' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /✓ reported/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', label: '↑ report to parent' } as any)).toBeUndefined()
})

test('a session that is neither fork nor parent draws nothing of its own', async ($, on) => {
  const solo = { ...PARENT, ownPrompts: 1 }
  helper(on, solo.id, { show: { self: solo, parent: null, children: [], family: [solo] }, waiting: { waiting: [] } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/home/m/Projects/x' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /⑂/ })).toBeUndefined()
})

test('a parent claims a waiting report and adds it to the next prompt once', async ($, on) => {
  const calls: string[][] = []
  helper(
    on,
    PARENT.id,
    {
      show: { self: PARENT, parent: null, children: [FORK], family: [PARENT, FORK] },
      waiting: { waiting: [FORK.id] },
      claim: { reports: [{ childId: FORK.id, text: '- decided X' }] },
    },
    calls,
  )
  let seen: readonly string[] | undefined
  on('prompt.submit', ($, e) => {
    seen = e.context
    return { text: e.text } as any
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/home/m/Projects/x' })
  await $.prompt.submit({ text: 'hi' } as any)
  expect(seen?.[0]).toContain('Report from your fork "payment tests"')
  expect(seen?.[0]).toContain('- decided X')
  expect(calls.filter((a) => a[2] === 'claim').length).toBe(1)
})

test('pruning runs at the first session start of the day, not the second', async ($, on) => {
  const calls: string[][] = []
  const store: Record<string, unknown> = {}
  const solo = { ...PARENT, ownPrompts: 1 }
  const clock = helper(on, solo.id, { show: { self: solo, parent: null, children: [], family: [solo] }, waiting: { waiting: [] } }, calls, store)
  await clock.set(Date.parse('2026-10-05T09:00:00Z'))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/home/m/Projects/x' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/home/m/Projects/x' })
  expect(calls.filter((a) => a[2] === 'prune').length).toBe(1)
  expect(calls.find((a) => a[2] === 'prune')?.slice(3)).toEqual(['/home/m/.claude-forks', '/home/m/.claude'])
})

test('a parent with a waiting report shows Read; pressing it shows the report once', async ($, on) => {
  const calls: string[][] = []
  const answers: Record<string, unknown> = {
    show: { self: PARENT, parent: null, children: [FORK], family: [PARENT, FORK] },
    waiting: { waiting: [FORK.id] },
    claim: { reports: [{ childId: FORK.id, text: '- decided X' }] },
  }
  helper(on, PARENT.id, answers, calls)
  // A test cannot answer session.append (the engine requires next), so the
  // report is checked where it is shown, and the append is left to fail quietly
  const logged: string[] = []
  on('ui.toast', () => ({ value: undefined }) as any)
  on('ui.log', ($, e: any) => {
    logged.push(String(e.text))
    return { value: undefined } as any
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/home/m/Projects/x' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /1 report waiting/ })).toBeDefined()
  const read = await ui.find({ type: 'Button', label: 'Read' } as any)
  expect(read).toBeDefined()
  answers.waiting = { waiting: [] }
  await ui.press({ key: 'read' })
  expect(logged.filter((t) => t === '- decided X').length).toBe(1)
  expect(logged.some((t) => t.includes('\n') || !t.trim())).toBe(false)
  expect(calls.filter((a) => a[2] === 'claim').length).toBe(1)
})
