import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin } from './start'

// The games this terminal shows, read from /arcade's list (● shown, ○ not).
async function showing($: Engine) {
  const text = (await $.command.run({ command: 'arcade', args: '' } as never)).text ?? ''
  return [...text.matchAll(/^● .* \((\w+)\)/gm)].map(m => m[1])
}

function world(on: On, entries?: Record<string, unknown>) {
  mock.store(on, entries as never)
  on('ui.toast', () => ({ value: undefined }))
}

test('fixed shows the first game of the pool and nothing else', { options: { mode: 'fixed', pool: 'outlaw, tama' } }, async ($, on) => {
  world(on)
  await begin($, on)
  expect(await showing($)).toEqual(['outlaw'])
})

test('all shows every game in the pool; an empty pool is every game', { options: { mode: 'all', pool: '' } }, async ($, on) => {
  world(on)
  await begin($, on)
  expect(await showing($)).toEqual(['dragon', 'jackpot', 'outlaw', 'tama', 'tetris', 'octopus'])
})

test('off shows none', { options: { mode: 'off', pool: '' } }, async ($, on) => {
  world(on)
  await begin($, on)
  expect(await showing($)).toEqual([])
})

test('random shows one game, always from the pool', { options: { mode: 'random', pool: 'tama,tetris' } }, async ($, on) => {
  world(on)
  await begin($, on)
  const ids = await showing($)
  expect(ids.length).toBe(1)
  expect(['tama', 'tetris']).toContain(ids[0])
})

test('rotate shows the game after the one the last terminal showed', { options: { mode: 'rotate', pool: 'jackpot,tama,tetris' } }, async ($, on) => {
  world(on, { rotate: 'tama' })
  await begin($, on)
  expect(await showing($)).toEqual(['tetris'])
})

test('names it does not know are left out of the pool, and other names work', { options: { mode: 'all', pool: 'dragon-lair, pacman, octo' } }, async ($, on) => {
  world(on)
  await begin($, on)
  expect(await showing($)).toEqual(['dragon', 'octopus'])
})

test('/arcade next swaps this terminal to the next game in the pool', { options: { mode: 'fixed', pool: 'outlaw,tama' } }, async ($, on) => {
  world(on)
  await begin($, on)
  await $.command.run({ command: 'arcade', args: 'next' } as never)
  expect(await showing($)).toEqual(['tama'])
})

test('/arcade tetris pins Tetris and saves it in the settings', { options: { mode: 'random', pool: 'outlaw,tetris' } }, async ($, on) => {
  const saved: Record<string, unknown> = {}
  world(on)
  on('config.set', (_$, e) => {
    saved[e.key] = e.value
    return { value: e.value }
  })
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: 'tetris' } as never)).text ?? ''
  expect(text).toMatch(/fixed on Tetris/)
  expect(saved).toEqual({ 'arcade.mode': 'fixed', 'arcade.pool': 'tetris,outlaw' })
  expect(await showing($)).toEqual(['tetris'])
})

test('/<game> show adds a game to this terminal only', { options: { mode: 'fixed', pool: 'outlaw' } }, async ($, on) => {
  world(on)
  await begin($, on)
  await $.command.run({ command: 'tama', args: 'show' } as never)
  expect(await showing($)).toEqual(['outlaw', 'tama'])
})

test('an unknown word lists the games and the modes', { options: { mode: 'fixed', pool: 'outlaw' } }, async ($, on) => {
  world(on)
  await begin($, on)
  expect((await $.command.run({ command: 'arcade', args: 'pacman' } as never)).text).toMatch(/Games: dragon, jackpot.*Modes: random/)
})
