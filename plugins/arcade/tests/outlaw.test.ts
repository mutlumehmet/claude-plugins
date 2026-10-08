import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin, pin } from './start'

// The Arcade shows only this game in these tests.
const ONLY = { mode: 'fixed', pool: 'outlaw' }

const BAND = {
  plugin: 'arcade',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, bodyColumns: 120 } as never,
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

test('the duel sits in the band with the score under it', async ($, on) => {
  pin(ONLY)
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /YOU 0 : 0 BUGS/ })).toBeDefined()
  await ui.unmount()
})

test('/arcade hide takes the outlaw out of the band', async ($, on) => {
  pin(ONLY)
  world(on)
  await begin($, on)
  await $.command.run({ command: 'arcade', args: 'hide' } as never)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('/outlaw explains the score and /outlaw draw is a practice duel', async ($, on) => {
  pin(ONLY)
  world(on)
  await begin($, on)
  expect((await $.command.run({ command: 'outlaw', args: '' } as never)).text).toMatch(/YOU 0 : 0 BUGS/)
  expect((await $.command.run({ command: 'outlaw', args: 'draw' } as never)).text).toMatch(/no score/)
})

test('a commit makes the gunslinger draw, with no other mod installed', async ($, on) => {
  pin(ONLY)
  const toasts: string[] = []
  world(on, toasts)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '[main abc] x', stderr: '', interrupted: false } }))
  await begin($, on)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  expect(toasts.join(' ')).toMatch(/Commit/)
})
