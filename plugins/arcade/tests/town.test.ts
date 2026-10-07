import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin } from './start'

// The Arcade shows only this game in these tests.
const ONLY = { options: { mode: 'fixed', pool: 'town' } }

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
  return (await $.command.run({ command: 'town', args: '' } as never)).text ?? ''
}

test('the town fills the band and keeps what was there below it', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  expect((raster as unknown as { props: { columns: number } }).props.columns).toBe(90)
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  await ui.unmount()
})

test('/town explains the score, and practice counts nothing', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  expect(await stats($)).toMatch(/^Camp  ▦ 0  ⌂ 0  ♣ 0  ♜ 0  ⚒ 0/)
  for (const arg of ['build', 'tree', 'finish', 'castle', 'creeper']) {
    expect((await $.command.run({ command: 'town', args: arg } as never)).text).toMatch(/Practice/)
  }
  expect(await stats($)).toMatch(/^Camp  ▦ 0  ⌂ 0  ♣ 0  ♜ 0/)
  await ui.unmount()
})

test('every tool call lays a block, and a commit finishes the house going up', ONLY, async ($, on) => {
  const toasts: string[] = []
  world(on, toasts)
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: '[main abc1234] x\n 1 file changed', stderr: '', interrupted: false },
    text: '[main abc1234] x',
  }))
  on('tool.call', { tool: 'Read' }, () => ({ result: {}, text: 'ok' }) as never)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "y"' })
  expect(toasts.join(' ')).toMatch(/Commit.*Built/)
  expect(await stats($)).toMatch(/⚒ 2/)
  expect(await stats($)).toMatch(/Last win: Commit: a building finished/)
  await ui.unmount()
})

test('/arcade knows the town by its other names', { options: { mode: 'all', pool: 'minecraft, duck' } }, async ($, on) => {
  world(on)
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: '' } as never)).text ?? ''
  expect(text).toMatch(/● Block Town \(town\)/)
})

test('the town counts while it is not shown, and a reset needs a second word', { options: { mode: 'fixed', pool: 'duck' } }, async ($, on) => {
  const store: Record<string, unknown> = {}
  mock.store(on, store)
  const clock = mock.clock(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: {}, text: 'ok' }) as never)
  await begin($, on, true)
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' } as never)
  await clock.advance(2100)
  expect(await stats($)).toMatch(/▦ 2 .* ⚒ 1/)
  expect((await $.command.run({ command: 'town', args: 'reset yes' } as never)).text).toMatch(/Nothing cleared/)
  expect((await $.command.run({ command: 'town', args: 'reset' } as never)).text).toMatch(/reset yes/)
  expect((await $.command.run({ command: 'town', args: 'reset yes' } as never)).text).toMatch(/cleared/)
  expect(await stats($)).toMatch(/^Camp  ▦ 0  ⌂ 0  ♣ 0  ♜ 0  ⚒ 0/)
})

test('a finished farm brings a sheep and a pig, and a house a chicken', ONLY, async ($, on) => {
  world(on)
  // The frame clock draws while the test moves it on: answer the redraws.
  on('ui.blit', () => ({ value: {} }) as never)
  const clock = mock.clock(on)
  await begin($, on, true)
  const ui = await $.ui.mount(BAND)
  expect(await stats($)).toMatch(/Animals: none yet/)
  // Practice finishes the buildings in turn: a house (a chicken), then a farm (a sheep and a pig).
  await $.command.run({ command: 'town', args: 'finish' } as never)
  await $.command.run({ command: 'town', args: 'finish' } as never)
  await clock.advance(3000)
  expect(await stats($)).toMatch(/Animals: 1 sheep, 1 pig, 1 chicken/)
  await ui.unmount()
})
