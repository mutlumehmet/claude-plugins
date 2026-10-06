import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// A disk with two repositories: /work/app (with a worktree at /work/app-feature) and /work/site.
const GIT_DIRS = new Set(['/work/app/.git', '/work/site/.git'])
const GIT_FILES: Record<string, string> = { '/work/app-feature/.git': 'gitdir: /work/app/.git/worktrees/app-feature\n' }

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
  on('fs.exists', (_$, e) => ({ value: GIT_DIRS.has(e.path) || e.path in GIT_FILES }) as never)
  on('fs.read', (_$, e) => {
    if (e.path in GIT_FILES) return { value: GIT_FILES[e.path] } as never
    throw new Error('EISDIR')
  })
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
}

async function open($: Engine, cwd: string) {
  await $.session.start({ cwd, surface: 'terminal', isInteractive: true })
}

const duckKeys = (store: Record<string, unknown>) => Object.keys(store).filter(k => k.startsWith('duck.score@')).sort()

test('each repository keeps its own score, and a worktree shares its repository\'s', { options: { mode: 'fixed', pool: 'duck' } }, async ($, on) => {
  const store: Record<string, unknown> = {}
  world(on, store)
  mock.clock(on)
  await open($, '/work/app/src')
  await $.command.run({ command: 'duck', args: 'reset' } as never)
  await $.command.run({ command: 'duck', args: 'reset yes' } as never)
  const app = duckKeys(store)
  expect(app).toHaveLength(1)
  await open($, '/work/app-feature/lib')
  await $.command.run({ command: 'duck', args: 'reset' } as never)
  await $.command.run({ command: 'duck', args: 'reset yes' } as never)
  expect(duckKeys(store)).toEqual(app)
  await open($, '/work/site')
  await $.command.run({ command: 'duck', args: 'reset' } as never)
  await $.command.run({ command: 'duck', args: 'reset yes' } as never)
  expect(duckKeys(store)).toHaveLength(2)
  // Nothing is written into the projects themselves: only store keys.
  expect(Object.keys(store).some(k => k.includes('/work/'))).toBe(false)
})

test('a score saved before scores were per project moves to the home folder\'s project', { options: { mode: 'fixed', pool: 'duck' } }, async ($, on) => {
  const store: Record<string, unknown> = { 'duck.score': { hits: 12, escaped: 3, tools: 40 } }
  world(on, store)
  mock.env(on, { HOME: '/home/me' })
  mock.clock(on)
  // Opened first in a repository: the old score goes home, and this project starts fresh.
  await open($, '/work/app')
  expect(store['duck.score']).toBeUndefined()
  expect(duckKeys(store)).toHaveLength(1)
  expect((await $.command.run({ command: 'duck', args: '' } as never)).text).toMatch(/▼ 0/)
  // Opened in the home folder: there it is.
  await open($, '/home/me')
  expect((await $.command.run({ command: 'duck', args: '' } as never)).text).toMatch(/▼ 12/)
})

test('a reset asks first, needs "reset yes" within a minute, and clears only this game', { options: { mode: 'fixed', pool: 'duck' } }, async ($, on) => {
  const store: Record<string, unknown> = {}
  world(on, store)
  const clock = mock.clock(on)
  await open($, '/work/app')
  // Seed this project's duck and dragon scores; "arcade.projects" lists the project's key.
  const project = Object.keys(store['arcade.projects'] as object)[0]!
  store[`duck.score@${project}`] = { hits: 5, escaped: 1, tools: 9 }
  store[`dragon.hoard@${project}`] = { gold: 70, meals: 3, feats: 2 }
  expect((await $.command.run({ command: 'duck', args: 'reset yes' } as never)).text).toMatch(/Nothing cleared/)
  expect((await $.command.run({ command: 'duck', args: 'reset' } as never)).text).toMatch(/reset yes/)
  await clock.advance(61_000)
  expect((await $.command.run({ command: 'duck', args: 'reset yes' } as never)).text).toMatch(/Nothing cleared/)
  await $.command.run({ command: 'duck', args: 'reset' } as never)
  expect((await $.command.run({ command: 'duck', args: 'reset yes' } as never)).text).toMatch(/cleared/)
  expect(store[`duck.score@${project}`]).toEqual({ hits: 0, escaped: 0, tools: 0 })
  expect(store[`dragon.hoard@${project}`]).toEqual({ gold: 70, meals: 3, feats: 2 })
  // "/arcade reset" clears every game of this project.
  await $.command.run({ command: 'arcade', args: 'reset' } as never)
  expect((await $.command.run({ command: 'arcade', args: 'reset yes' } as never)).text).toMatch(/Every Arcade game cleared/)
  expect(store[`dragon.hoard@${project}`]).toEqual({ gold: 0, meals: 0, feats: 0 })
})
