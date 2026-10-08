import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin, pin } from './start'

// The games this terminal shows, read from /arcade's list (● shown, ○ not).
async function showing($: Engine) {
  const text = (await $.command.run({ command: 'arcade', args: '' } as never)).text ?? ''
  return [...text.matchAll(/^● .* \((\w+)\)/gm)].map(m => m[1])
}

// A store the test can read back, in place of mock.store.
function rawWorld(on: On, store: Record<string, unknown>, toasts: string[] = []) {
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
  on('ui.toast', (_$, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
}

// What another plugin draws in the band, beneath the Arcade.
function under(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'account · project') as never
  })
}

const BAND = {
  plugin: 'arcade',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, bodyColumns: 100 } as never,
} as const

function world(on: On, entries?: Record<string, unknown>) {
  mock.store(on, entries as never)
  on('ui.toast', () => ({ value: undefined }))
}

test('fixed shows the first game of the pool and nothing else', async ($, on) => {
  pin({ mode: 'fixed', pool: 'outlaw, tama' })
  world(on)
  await begin($, on)
  expect(await showing($)).toEqual(['outlaw'])
})

test('all shows every game in the pool; an empty pool is every game', async ($, on) => {
  pin({ mode: 'all', pool: '' })
  world(on)
  await begin($, on)
  expect(await showing($)).toEqual(['octopus', 'duck', 'bugs', 'dario', 'town', 'dragon', 'jackpot', 'outlaw', 'tama', 'tetris'])
})

test('off shows none', async ($, on) => {
  pin({ mode: 'off', pool: '' })
  world(on)
  await begin($, on)
  expect(await showing($)).toEqual([])
})

test('random shows one game, always from the pool', async ($, on) => {
  pin({ mode: 'random', pool: 'tama,tetris' })
  world(on)
  await begin($, on)
  const ids = await showing($)
  expect(ids.length).toBe(1)
  expect(['tama', 'tetris']).toContain(ids[0])
})

test('rotate shows the game after the one the last terminal showed', async ($, on) => {
  pin({ mode: 'rotate', pool: 'jackpot,tama,tetris' })
  world(on, { rotate: 'tama' })
  await begin($, on)
  expect(await showing($)).toEqual(['tetris'])
})

test('names it does not know are left out of the pool, and other names work', async ($, on) => {
  world(on, { setting: { mode: 'all', pool: 'dragon-lair, pacman, octo' } })
  await begin($, on)
  expect(await showing($)).toEqual(['octopus', 'dragon'])
})

test('/arcade next swaps this terminal to the next game in the pool', async ($, on) => {
  pin({ mode: 'fixed', pool: 'outlaw,tama' })
  world(on)
  await begin($, on)
  await $.command.run({ command: 'arcade', args: 'next' } as never)
  expect(await showing($)).toEqual(['tama'])
})

test('/arcade tetris swaps only this terminal and keeps the setting', async ($, on) => {
  pin({ mode: 'random', pool: 'outlaw,tetris' })
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

test('/arcade tetris all pins Tetris in this terminal and for new ones', async ($, on) => {
  pin({ mode: 'random', pool: 'outlaw,tetris' })
  world(on)
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: 'tetris all' } as never)).text ?? ''
  expect(text).toMatch(/fixed on Tetris/)
  expect(await showing($)).toEqual(['tetris'])
})

test('/arcade tetris all saves the choice in the plugin store, not the settings menu', async ($, on) => {
  pin({ mode: 'random', pool: 'outlaw,tetris' })
  let wrote = false
  const store: Record<string, unknown> = {}
  rawWorld(on, store)
  on('config.set', (_$, e) => {
    wrote = true
    return { value: e.value }
  })
  await begin($, on)
  await $.command.run({ command: 'arcade', args: 'tetris all' } as never)
  expect(wrote).toBe(false)
  expect(store.setting).toEqual({ mode: 'fixed', pool: 'tetris,outlaw' })
  expect(await showing($)).toEqual(['tetris'])
})

test('a new terminal follows what /arcade saved', async ($, on) => {
  world(on, { setting: { mode: 'fixed', pool: 'tama,outlaw' } })
  await begin($, on)
  expect(await showing($)).toEqual(['tama'])
})

test('a new player starts with Octo Invader and is told once where the controls are', async ($, on) => {
  const toasts: string[] = []
  rawWorld(on, {}, toasts)
  await begin($, on)
  expect(await showing($)).toEqual(['octopus'])
  expect(toasts.filter(t => /Octo Invader is your game/.test(t))).toHaveLength(1)
})

test('the welcome shows in the first session only, the hint for three', async ($, on) => {
  const toasts: string[] = []
  const store: Record<string, unknown> = { welcome: 1 }
  rawWorld(on, store, toasts)
  under(on)
  await begin($, on)
  expect(store.welcome).toBe(2)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /next game/ })).toBeDefined()
  await ui.unmount()
  expect(toasts.filter(t => /is your game/.test(t))).toHaveLength(0)
})

test('/arcade default duck makes Duck Hunt the game new terminals start with', async ($, on) => {
  const store: Record<string, unknown> = {}
  rawWorld(on, store)
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: 'default duck' } as never)).text ?? ''
  expect(text).toMatch(/Duck Hunt is the game every new terminal starts with/)
  expect(await showing($)).toEqual(['duck'])
  expect((store.setting as { mode: string; pool: string }).mode).toBe('fixed')
  expect((store.setting as { mode: string; pool: string }).pool.split(',')[0]).toBe('duck')
})

test('/arcade moments sets what counts, and none clears it', async ($, on) => {
  world(on)
  await begin($, on)
  expect((await $.command.run({ command: 'arcade', args: 'moments big_commands make ship' } as never)).text).toMatch(/big_commands: make ship/)
  expect((await $.command.run({ command: 'arcade', args: 'moments' } as never)).text).toMatch(/big_commands: make ship/)
  expect((await $.command.run({ command: 'arcade', args: 'moments big_commands none' } as never)).text).toMatch(/big_commands: \(none\)/)
  expect((await $.command.run({ command: 'arcade', args: 'moments colour red' } as never)).text).toMatch(/No moments setting/)
})

test('the controls under the game swap it, and offer to make it the default', async ($, on) => {
  world(on)
  under(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Button', key: 'arcade-next' } as never)).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'arcade-default' } as never)).toBeUndefined()
  await ui.press({ key: 'arcade-next' })
  expect(await showing($)).toEqual(['duck'])
  expect(await ui.find({ type: 'Button', key: 'arcade-default' } as never)).toBeDefined()
  await ui.press({ key: 'arcade-default' })
  expect((await $.command.run({ command: 'arcade', args: '' } as never)).text).toMatch(/fixed on Duck Hunt/)
  await ui.press({ key: 'arcade-prev' })
  expect(await showing($)).toEqual(['octopus'])
  await ui.unmount()
})

test('/arcade hide clears this terminal, /arcade next brings a game back', async ($, on) => {
  pin({ mode: 'all', pool: 'outlaw,tama' })
  world(on)
  await begin($, on)
  await $.command.run({ command: 'arcade', args: 'hide' } as never)
  expect(await showing($)).toEqual([])
  await $.command.run({ command: 'arcade', args: 'next' } as never)
  expect(await showing($)).toEqual(['outlaw'])
})

test('a game no longer takes hide or show', async ($, on) => {
  pin({ mode: 'fixed', pool: 'outlaw' })
  world(on)
  await begin($, on)
  await $.command.run({ command: 'tama', args: 'show' } as never)
  await $.command.run({ command: 'outlaw', args: 'hide' } as never)
  expect(await showing($)).toEqual(['outlaw'])
})

test('an unknown word lists the games and the modes', async ($, on) => {
  pin({ mode: 'fixed', pool: 'outlaw' })
  world(on)
  await begin($, on)
  expect((await $.command.run({ command: 'arcade', args: 'pacman' } as never)).text).toMatch(/Games: octopus, duck.*Modes: random/)
})

test('every game lists its moves to preview under its help', async ($, on) => {
  mock.store(on)
  await begin($, on)
  for (const [game, move] of [['dragon', 'roar'], ['duck', 'flyaway'], ['bugs', 'incoming'], ['dario', 'world'], ['town', 'creeper'], ['tetris', 'drop']]) {
    const text = (await $.command.run({ command: game, args: '' } as never)).text ?? ''
    expect(text).toMatch(/Preview a move/)
    expect(text).toContain(`/${game} ${move}`)
    expect(text).toContain(`/${game} reset`)
  }
})
