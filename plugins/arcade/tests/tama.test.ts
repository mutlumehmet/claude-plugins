import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin, pin } from './start'

// The Arcade shows only this game in these tests.
const ONLY = { mode: 'fixed', pool: 'tama' }

const BAND = {
  plugin: 'arcade',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, bodyColumns: 120 } as never,
} as const

function world(on: On) {
  mock.store(on)
  mock.clock(on)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'account · project') as never
  })
}

test('a new Tamagotchi is an egg in the band', async ($, on) => {
  pin(ONLY)
  world(on)
  await begin($, on, true)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /3 turns to hatch/ })).toBeDefined()
  await ui.unmount()
})

test('an egg cannot be fed by hand', async ($, on) => {
  pin(ONLY)
  world(on)
  await begin($, on, true)
  expect((await $.command.run({ command: 'tama', args: 'feed' } as never)).text).toMatch(/still an egg/)
})

test('/tama tells how it is doing, /arcade hide takes it away', async ($, on) => {
  pin(ONLY)
  world(on)
  await begin($, on, true)
  expect((await $.command.run({ command: 'tama', args: '' } as never)).text).toMatch(/Generation 1: an egg/)
  await $.command.run({ command: 'arcade', args: 'hide' } as never)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})
