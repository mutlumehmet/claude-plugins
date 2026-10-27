import { expect, test } from 'claude-code/testing'

const HOME = '/home/u'
const Q = HOME + '/.config/orca-strator/quota'
const NOW = Date.parse('2026-10-26T12:00:00Z')
const IN_2H = '2026-10-26T14:00:00Z'

// Stands for Claude Code: an in-memory disk, the environment, a store and toasts
function engine(on, { env = {}, files = {} } = {}) {
  const disk: Record<string, string> = { ...files }
  const store: Record<string, unknown> = {}
  const seen = { toasts: [] as string[] }
  on('env.get', ($, e) => ({ value: ({ HOME, ...env })[e.name] }))
  on('fs.read', ($, e) => (e.path in disk ? { value: disk[e.path] } : { deny: 'ENOENT' }) as never)
  on('fs.write', ($, e) => { disk[e.path] = e.text; return { value: undefined } })
  on('fs.list', ($, e) => ({
    value: Object.keys(disk).filter(p => p.startsWith(e.path + '/')).map(p => ({ name: p.slice(e.path.length + 1), kind: 'file', size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => { store[e.key] = e.value; return { value: undefined } })
  on('clock.now', () => ({ value: NOW }))
  on('command.register', () => ({ value: { command: 'quota' } }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: {}, rateLimits: [] } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.toast', ($, e) => { seen.toasts.push(e.text); return { value: undefined } })
  return { disk, seen }
}

const limits = (five: number, seven = 10) => [
  { kind: 'five_hour', percentUsed: five, resetsAt: IN_2H },
  { kind: 'seven_day', percentUsed: seven, resetsAt: '2026-10-30T00:00:00Z' },
]
const measure = ($, l) => $.session.measure({ context: {}, rateLimits: l, changed: ['rateLimits'] })
const row = (id, family, five, readAt = NOW) =>
  JSON.stringify({ id, family, readAt, windows: { five_hour: { percent: five, resetsAt: IN_2H }, seven_day: { percent: 5, resetsAt: IN_2H } } })

test('saves this account under its config dir name', async ($, on) => {
  const { disk } = engine(on, { env: { CLAUDE_CONFIG_DIR: HOME + '/.claude-b' } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await measure($, limits(42))
  const saved = JSON.parse(disk[Q + '/b.json'])
  expect(saved.windows.five_hour.percent).toBe(42)
  expect(saved.id).toBe('b')
})

test('names accounts and families from accounts_file', async ($, on) => {
  const { disk } = engine(on, {
    env: { CLAUDE_CONFIG_DIR: '~/.claude-two' },
    files: {
      [HOME + '/.config/orca-strator/config.yaml']: 'accounts_file: ~/acc.json\n',
      [HOME + '/acc.json']: JSON.stringify({ accounts: { work: { configDir: '~/.claude' }, twin: { configDir: '~/.claude-two', twinOf: 'work' } } }),
    },
  })
  await measure($, limits(5))
  const saved = JSON.parse(disk[Q + '/twin.json'])
  expect(saved.family).toBe('work')
})

test('warns once past the threshold, naming the twin with most room', async ($, on) => {
  const { seen } = engine(on, {
    files: {
      [Q + '/b.json']: row('b', 'b', 3),
      [Q + '/default.json']: row('default', 'default', 80),
    },
  })
  await measure($, limits(80))
  expect(seen.toasts).toEqual([])
  await measure($, limits(91))
  await measure($, limits(93))
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toContain('default is at 91% of its 5h limit')
  await measure($, limits(20))
  await measure($, limits(95))
  expect(seen.toasts.length).toBe(2)
})

test('/quota lists every account, this one starred', async ($, on) => {
  engine(on, { files: { [Q + '/personal.json']: row('personal', 'personal', 12, NOW - 2 * 3600000) } })
  await measure($, limits(42))
  const r = await $.command.run({ command: 'quota', args: '' })
  expect(r.text).toContain('* default')
  expect(r.text).toContain('5h 42% (resets in 2h 0m)')
  expect(r.text).toContain('personal')
  expect(r.text).toContain('(2h 0m ago)')
})

test('the band shows every account', async ($, on) => {
  engine(on, { files: { [Q + '/personal.json']: row('personal', 'personal', 12) } })
  await measure($, limits(95))
  const band = { plugin: 'orca-accounts', component: 'AbovePrompt', props: { hasSurvey: false } } as const
  const ui = await $.ui.mount({ ...band, surface: 'terminal' } as never)
  expect((await ui.find({ type: 'Text', text: /default 5h 95%/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /personal 5h 12%/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('a passed reset reads as 0', async ($, on) => {
  engine(on, { files: { [Q + '/old.json']: JSON.stringify({ id: 'old', family: 'old', readAt: NOW - 9e6, windows: { five_hour: { percent: 99, resetsAt: '2026-10-26T11:00:00Z' } } }) } })
  await measure($, limits(1))
  const r = await $.command.run({ command: 'quota', args: '' })
  expect(r.text).toContain('old       5h 0% (reset)')
})

test('the band dims a reading older than an hour and shows its age', async ($, on) => {
  engine(on, {
    files: {
      [Q + '/twin.json']: row('twin', 'twin', 3, NOW - 19 * 3600000),
      [Q + '/personal.json']: row('personal', 'personal', 12, NOW - 10 * 60000),
    },
  })
  await measure($, limits(40))
  const band = { plugin: 'orca-accounts', component: 'AbovePrompt', props: { hasSurvey: false } } as const
  const ui = await $.ui.mount({ ...band, surface: 'terminal' } as never)
  const old = await ui.find({ type: 'Text', text: /twin 5h 3%/ })
  expect(old?.text).toContain('(19h)')
  expect(old?.props.dimColor).toBe(true)
  const fresh = await ui.find({ type: 'Text', text: /personal 5h 12%/ })
  expect(fresh?.text).not.toContain('(')
  await ui.unmount()
})

test('/quota warn sets the threshold and talks back', async ($, on) => {
  const { seen } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(seen.toasts.length).toBe(1)
  expect((await $.command.run({ command: 'quota', args: 'warn 70' })).text).toBe('Warning changed: this account now warns at 70%.')
  expect((await $.command.run({ command: 'quota', args: 'warn 70' })).text).toBe('Already warning at 70%.')
  expect((await $.command.run({ command: 'quota', args: 'warn 7' })).text).toContain('50 to 99')
  await measure($, limits(75))
  expect(seen.toasts.length).toBe(2)
  expect(seen.toasts[1]).toContain('75% of its 5h limit')
})

test('/quota hide, show and unknown words', async ($, on) => {
  engine(on)
  expect((await $.command.run({ command: 'quota', args: 'hide' })).text).toContain('Band folded')
  expect((await $.command.run({ command: 'quota', args: 'hide' })).text).toBe('The band is already folded.')
  expect((await $.command.run({ command: 'quota', args: 'show' })).text).toBe('Band open.')
  const r = await $.command.run({ command: 'quota', args: 'banana' })
  expect(r.text).toContain('Unknown: banana')
  expect(r.text).toContain('/quota warn <50-99>')
})
