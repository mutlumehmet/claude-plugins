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

test('⟳ runs Claude Code\'s updater only when pressed, and says what happened', async ($, on) => {
  const toasts: string[] = []
  const ran: string[][] = []
  let filled = ''
  rawWorld(on, { welcome: 9 }, toasts)
  under(on)
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '✔ Plugin "arcade" updated from 0.10.0 to 0.10.1 for scope user. Restart to apply changes.', stderr: '' } } as never
  })
  on('prompt.fill', (_$, e) => {
    filled = e.text
    return { isFilled: true } as never
  })
  await begin($, on)
  expect(ran).toHaveLength(0)
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'arcade-update' })
  expect(ran).toEqual([['claude', 'plugin', 'update', 'arcade']])
  expect(toasts.join(' ')).toMatch(/updated from 0\.10\.0 to 0\.10\.1/)
  expect(filled).toBe('/reload-plugins')
  await ui.unmount()
})

test('⟳ says when the Arcade is up to date, and when the updater cannot run', async ($, on) => {
  const toasts: string[] = []
  let reply: unknown = { exitCode: 0, stdout: '✔ arcade is already at the latest version (0.10.1).', stderr: '' }
  rawWorld(on, { welcome: 9 }, toasts)
  on('process.run', () => {
    if (reply instanceof Error) throw reply
    return { value: reply } as never
  })
  await begin($, on)
  await $.command.run({ command: 'arcade', args: 'update' } as never)
  expect(toasts.join(' ')).toMatch(/up to date \(0\.10\.1\)/)
  reply = new Error('no claude here')
  await $.command.run({ command: 'arcade', args: 'update' } as never)
  expect(toasts.join(' ')).toMatch(/could not run the updater/)
})

// GitHub's copy of the manifest, and the installed one, for the check a terminal makes when it opens.
function manifests(on: On, installed: string, published: string | Error, fetched: string[] = []) {
  on('fs.read', (_$, e) => {
    if (!String(e.path).endsWith('.claude-plugin/plugin.json')) return { value: '' } as never
    return { value: JSON.stringify({ version: installed, repository: 'https://github.com/sample-owner/sample-plugins' }) } as never
  })
  on('http.fetch', (_$, e) => {
    fetched.push(e.url)
    if (published instanceof Error) throw published
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: published }) } } as never
  })
}

// The check runs unawaited after session.start, so the test waits a few real ticks for it.
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise(r => (globalThis as unknown as { setTimeout: (f: (v?: unknown) => void, ms: number) => void }).setTimeout(r, 5))
}

test('a terminal that opens looks once for a newer Arcade, lights ⟳ and says so once per version', async ($, on) => {
  const store: Record<string, unknown> = { welcome: 9 }
  const toasts: string[] = []
  const fetched: string[] = []
  const ran: string[][] = []
  rawWorld(on, store, toasts)
  under(on)
  manifests(on, '0.10.1', '0.10.2', fetched)
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '✔ Plugin "arcade" updated from 0.10.1 to 0.10.2 for scope user.', stderr: '' } } as never
  })
  on('prompt.fill', () => ({ isFilled: true }) as never)
  await begin($, on)
  await settle()
  expect(fetched).toEqual(['https://raw.githubusercontent.com/sample-owner/sample-plugins/main/plugins/arcade/.claude-plugin/plugin.json'])
  expect(ran).toHaveLength(0)
  expect(toasts.filter(t => /Arcade 0\.10\.2 is out \(you have 0\.10\.1\)/.test(t))).toHaveLength(1)
  expect(store.toldVersion).toBe('0.10.2')
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeDefined()
  await ui.press({ key: 'arcade-update' })
  expect(ran).toEqual([['claude', 'plugin', 'update', 'arcade']])
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
  await ui.unmount()
})

test('the opening check stays quiet when up to date, offline, already told, or turned off', async ($, on) => {
  const store: Record<string, unknown> = { welcome: 9, toldVersion: '0.10.2' }
  const toasts: string[] = []
  const fetched: string[] = []
  const reply = { version: '0.10.2' as string | Error }
  rawWorld(on, store, toasts)
  under(on)
  on('fs.read', () => ({ value: JSON.stringify({ version: '0.10.1', repository: 'https://github.com/sample-owner/sample-plugins' }) }) as never)
  on('http.fetch', (_$, e) => {
    fetched.push(e.url)
    if (reply.version instanceof Error) throw reply.version
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: reply.version }) } } as never
  })
  await begin($, on)
  await settle()
  // Already told about 0.10.2: the button lights, no second toast.
  expect(toasts.filter(t => /is out/.test(t))).toHaveLength(0)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeDefined()
  await ui.unmount()
  expect((await $.command.run({ command: 'arcade', args: 'update check off' } as never)).text).toMatch(/will not look/)
  expect(store.updateCheck).toBe('off')
  const ui2 = await $.ui.mount(BAND)
  expect(await ui2.find({ type: 'Text', text: /●/ })).toBeUndefined()
  await ui2.unmount()
  expect((await $.command.run({ command: 'arcade', args: 'update check' } as never)).text).toMatch(/is off/)
  expect(fetched).toHaveLength(1)
})

test('the opening check says nothing when GitHub cannot be reached or has the same version', async ($, on) => {
  const toasts: string[] = []
  rawWorld(on, { welcome: 9 }, toasts)
  under(on)
  manifests(on, '0.10.2', new Error('offline'))
  await begin($, on)
  await settle()
  expect(toasts.filter(t => /is out/.test(t))).toHaveLength(0)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
  await ui.unmount()
})
