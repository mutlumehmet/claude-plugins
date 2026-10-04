import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'tetris',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, bodyColumns: 120 } as never,
} as const

function world(on: On) {
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'account · project') as never
  })
}

test('the handheld sits in the band beside the rest, with the score under it', async ($, on) => {
  world(on)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▤ 0  ◆ 0  Lv 0/ })).toBeDefined()
  await ui.unmount()
})

test('/tetris explains the rules', async ($, on) => {
  world(on)
  const ran = await $.command.run({ command: 'tetris', args: '' } as never)
  expect(ran.text).toMatch(/▤ 0 lines/)
  expect(ran.text).toMatch(/full row clears/)
})

test('/tetris drop and /tetris clear queue work', async ($, on) => {
  world(on)
  expect((await $.command.run({ command: 'tetris', args: 'drop' } as never)).text).toMatch(/Three pieces/)
  expect((await $.command.run({ command: 'tetris', args: 'clear' } as never)).text).toMatch(/One row/)
})

test('/tetris hide takes it out of the band', async ($, on) => {
  world(on)
  expect((await $.command.run({ command: 'tetris', args: 'hide' } as never)).text).toMatch(/pocket/)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})
