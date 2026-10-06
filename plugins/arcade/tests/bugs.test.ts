import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin } from './start'

// The Arcade shows only this game in these tests.
const ONLY = { options: { mode: 'fixed', pool: 'bugs' } }
const SKY = 'bug-sky'
const SHOT_TRAIL = '#4c6ef5'
const BUG_TRAIL = '#a8323e'

const BAND = {
  plugin: 'arcade',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, bodyColumns: 90 } as never,
} as const

function world(on: On, toasts: string[] = []) {
  mock.store(on)
  on('ui.toast', ($, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'account · project') as never
  })
}

async function stats($: Engine) {
  return (await $.command.run({ command: 'bugs', args: '' } as never)).text ?? ''
}

type Finder = { findAll: (q: { type: string; in: string }) => Promise<{ props: Record<string, unknown> }[]> }
async function colors(ui: Finder) {
  return (await ui.findAll({ type: 'Text', in: SKY })).flatMap(t => [t.props.color, t.props.backgroundColor])
}

test('the sky is a Client the full width of the band, and keeps what was there below it', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  const sky = await ui.find({ type: 'Client', key: SKY })
  expect(sky).toBeDefined()
  expect(sky!.props.width).toBe(90)
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /⌂ 6/, in: SKY })).toBeDefined()
  await ui.unmount()
})

test('a click in the sky fires from a silo', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  expect(await colors(ui)).not.toContain(SHOT_TRAIL)
  await ui.pointer({ type: 'down', x: 30, y: 1, button: 'left', in: SKY })
  await ui.advance(200)
  expect(await colors(ui)).toContain(SHOT_TRAIL)
  await ui.unmount()
})

test('keys move the crosshair and space fires', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  await ui.key({ key: 'left', in: SKY })
  await ui.key({ key: ' ', in: SKY })
  await ui.advance(200)
  expect(await colors(ui)).toContain(SHOT_TRAIL)
  await ui.unmount()
})

test('a failed tool drops a bug, and the sky says how to shoot it', ONLY, async ($, on) => {
  world(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: 'boom', interrupted: false }, text: 'boom', isError: true }) as never)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await ui.advance(1500)
  expect(await colors(ui)).toContain(BUG_TRAIL)
  expect(await ui.find({ type: 'Text', text: /click to fire/, in: SKY })).toBeDefined()
  expect(await stats($)).toMatch(/⚒ 1/)
  await ui.unmount()
})

test('what the sky posts goes to the score', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  await ui.post({ kills: 3, mine: 2, lost: 1, ends: 0, cities: 5 }, { in: SKY })
  expect(await stats($)).toMatch(/^✸ 3  ☞ 2  ✝ 1  ⚒ 0/)
  await ui.unmount()
})

test('a commit after a failed tool shoots the bug down', ONLY, async ($, on) => {
  const toasts: string[] = []
  world(on, toasts)
  let isError = true
  on('tool.call', { tool: 'Bash' }, () =>
    (isError
      ? { result: { stdout: '', stderr: 'boom', interrupted: false }, text: 'boom', isError: true }
      : { result: { stdout: '[main abc1234] x\n 1 file changed', stderr: '', interrupted: false }, text: '[main abc1234] x' }) as never,
  )
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await ui.advance(300)
  isError = false
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  await ui.advance(4000)
  expect(toasts.join(' ')).toMatch(/Commit.*Bug down/)
  expect(await stats($)).toMatch(/^✸ 1/)
  expect(await stats($)).toMatch(/Last win: Commit: a bug shot down/)
  await ui.unmount()
})

test('/bugs practice counts nothing', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  expect((await $.command.run({ command: 'bugs', args: 'salvo' } as never)).text).toMatch(/nothing counts/)
  expect((await $.command.run({ command: 'bugs', args: 'incoming' } as never)).text).toMatch(/practice bug/)
  expect(await stats($)).toMatch(/^✸ 0  ☞ 0  ✝ 0/)
})

test('/arcade knows the game by its other names', { options: { mode: 'all', pool: 'bug-command, duck' } }, async ($, on) => {
  world(on)
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: '' } as never)).text ?? ''
  expect(text).toMatch(/● Bug Command \(bugs\)/)
})
