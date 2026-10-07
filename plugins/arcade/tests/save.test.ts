import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// A store this test can reach into, holding what earlier versions of the Arcade saved.
function world(on: On, store: Record<string, unknown>) {
  on('store.get', (_$, e) => ({ value: structuredClone(store[e.key]) }) as never)
  on('store.set', (_$, e) => {
    store[e.key] = structuredClone(e.value)
    return { value: undefined } as never
  })
  on('store.delete', (_$, e) => {
    delete store[e.key]
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: Object.keys(store) }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('tool.call', { tool: 'Read' }, () => ({ result: {}, text: 'ok' }) as never)
}

async function open($: Engine) {
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
}

const duck = async ($: Engine) => (await $.command.run({ command: 'duck', args: '' } as never)).text ?? ''
const octopus = async ($: Engine) => (await $.command.run({ command: 'octopus', args: '' } as never)).text ?? ''

test('a new terminal starts at zero, and what earlier versions saved is deleted', { options: { mode: 'fixed', pool: 'duck' } }, async ($, on) => {
  const store: Record<string, unknown> = {
    'duck.score': { hits: 12, escaped: 3, tools: 40 },
    'duck.score@abc': { hits: 7, escaped: 1, tools: 9 },
    'town.map@abc': { plots: [], next: 0 },
    'arcade.projects': { abc: { path: '/work/app', at: 0 } },
    'days': { last: '2026-10-06', streak: 3 },
    'rotate': 'duck',
  }
  world(on, store)
  mock.clock(on)
  await open($)
  expect(await duck($)).toMatch(/▼ 0/)
  expect(Object.keys(store).sort()).toEqual(['days', 'rotate'])
})

test('the games write nothing to the store while they play', { options: { mode: 'fixed', pool: 'town' } }, async ($, on) => {
  const store: Record<string, unknown> = {}
  world(on, store)
  const clock = mock.clock(on)
  await open($)
  await $.tool.call({ tool: 'Read', file_path: '/work/app/a.ts' } as never)
  await clock.advance(2100)
  expect(await duck($)).toMatch(/⚒ 1/)
  expect(Object.keys(store).filter(k => k !== 'days' && k !== 'setting' && k !== 'rotate')).toEqual([])
})

// Slow by nature: checking that the minute runs out moves every game's frame clock a minute on,
// about 900 frames each, which takes a few seconds on a CI runner.
test('a reset asks first, needs "reset yes" within a minute, and clears only this game', { timeoutMs: 20_000, options: { mode: 'fixed', pool: 'duck' } }, async ($, on) => {
  const store: Record<string, unknown> = {}
  world(on, store)
  const clock = mock.clock(on)
  await open($)
  // A tool call counts for every game: the duck and the octopus both show it.
  await $.tool.call({ tool: 'Read', file_path: '/work/app/a.ts' } as never)
  expect(await duck($)).toMatch(/⚒ 1/)
  expect(await octopus($)).toMatch(/⚒ 1/)
  expect((await $.command.run({ command: 'duck', args: 'reset yes' } as never)).text).toMatch(/Nothing cleared/)
  expect((await $.command.run({ command: 'duck', args: 'reset' } as never)).text).toMatch(/in this terminal.*reset yes/s)
  await clock.advance(61_000)
  expect((await $.command.run({ command: 'duck', args: 'reset yes' } as never)).text).toMatch(/Nothing cleared/)
  await $.command.run({ command: 'duck', args: 'reset' } as never)
  expect((await $.command.run({ command: 'duck', args: 'reset yes' } as never)).text).toMatch(/cleared in this terminal/)
  expect(await duck($)).toMatch(/⚒ 0/)
  expect(await octopus($)).toMatch(/⚒ 1/)
  // "/arcade reset" clears every game in this terminal.
  await $.command.run({ command: 'arcade', args: 'reset' } as never)
  expect((await $.command.run({ command: 'arcade', args: 'reset yes' } as never)).text).toMatch(/Every Arcade game cleared/)
  expect(await octopus($)).toMatch(/⚒ 0/)
})
