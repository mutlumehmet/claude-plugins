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
  expect(await showing($)).toEqual(['dragon', 'jackpot', 'outlaw', 'tama', 'tetris', 'octopus', 'duck'])
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

test('/arcade tetris swaps only this terminal and keeps the setting', { options: { mode: 'random', pool: 'outlaw,tetris' } }, async ($, on) => {
  let wrote = false
  world(on)
  on('config.list', () => ({ value: [{ key: 'arcade.mode' }, { key: 'arcade.pool' }] }) as never)
  on('config.set', (_$, e) => {
    wrote = true
    return { value: e.value }
  })
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: 'tetris' } as never)).text ?? ''
  expect(text).toMatch(/Tetris in this terminal/)
  expect(wrote).toBe(false)
  expect(await showing($)).toEqual(['tetris'])
  expect(await $.command.run({ command: 'arcade', args: '' } as never).then(r => r.text ?? '')).toMatch(/random, from Outlaw, Tetris/)
})

test('/arcade tetris all pins Tetris in this terminal and for new ones', { options: { mode: 'random', pool: 'outlaw,tetris' } }, async ($, on) => {
  world(on)
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: 'tetris all' } as never)).text ?? ''
  expect(text).toMatch(/fixed on Tetris/)
  expect(await showing($)).toEqual(['tetris'])
})

test('/arcade tetris all writes the mode and pool settings where the settings menu has them', { options: { mode: 'random', pool: 'outlaw,tetris' } }, async ($, on) => {
  const written: Record<string, unknown> = {}
  world(on)
  on('config.list', () => ({ value: [{ key: 'arcade.mode' }, { key: 'arcade.pool' }] }) as never)
  on('config.set', (_$, e) => {
    written[e.key] = e.value
    return { value: e.value }
  })
  await begin($, on)
  await $.command.run({ command: 'arcade', args: 'tetris all' } as never)
  expect(written).toEqual({ 'arcade.mode': 'fixed', 'arcade.pool': 'tetris,outlaw' })
  expect(await showing($)).toEqual(['tetris'])
})

test('a new terminal follows what /arcade saved', { options: { mode: 'random', pool: '' } }, async ($, on) => {
  world(on, { setting: { mode: 'fixed', pool: 'tama,outlaw', over: 'random|' } })
  await begin($, on)
  expect(await showing($)).toEqual(['tama'])
})

test('settings changed in /plugin after /arcade win again', { options: { mode: 'fixed', pool: 'jackpot' } }, async ($, on) => {
  world(on, { setting: { mode: 'fixed', pool: 'tama', over: 'random|' } })
  await begin($, on)
  expect(await showing($)).toEqual(['jackpot'])
})

test('/arcade hide clears this terminal, /arcade next brings a game back', { options: { mode: 'all', pool: 'outlaw,tama' } }, async ($, on) => {
  world(on)
  await begin($, on)
  await $.command.run({ command: 'arcade', args: 'hide' } as never)
  expect(await showing($)).toEqual([])
  await $.command.run({ command: 'arcade', args: 'next' } as never)
  expect(await showing($)).toEqual(['outlaw'])
})

test('a game no longer takes hide or show', { options: { mode: 'fixed', pool: 'outlaw' } }, async ($, on) => {
  world(on)
  await begin($, on)
  await $.command.run({ command: 'tama', args: 'show' } as never)
  await $.command.run({ command: 'outlaw', args: 'hide' } as never)
  expect(await showing($)).toEqual(['outlaw'])
})

test('an unknown word lists the games and the modes', { options: { mode: 'fixed', pool: 'outlaw' } }, async ($, on) => {
  world(on)
  await begin($, on)
  expect((await $.command.run({ command: 'arcade', args: 'pacman' } as never)).text).toMatch(/Games: dragon, jackpot.*Modes: random/)
})
