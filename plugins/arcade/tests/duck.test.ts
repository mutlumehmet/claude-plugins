import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin } from './start'

// The Arcade shows only this game in these tests.
const ONLY = { options: { mode: 'fixed', pool: 'duck' } }

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
  return (await $.command.run({ command: 'duck', args: '' } as never)).text ?? ''
}

test('the marsh fills the band and keeps what was there below it', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  expect((raster as unknown as { props: { columns: number } }).props.columns).toBe(90)
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  await ui.unmount()
})

test('/arcade hide takes the duck out of the band, /arcade next brings it back', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  expect((await $.command.run({ command: 'arcade', args: 'hide' } as never)).text).toMatch(/No game in this terminal/)
  let ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
  expect((await $.command.run({ command: 'arcade', args: 'next' } as never)).text).toMatch(/in this terminal/)
  ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.unmount()
})

test('/duck explains the score, and practice counts nothing', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  expect(await stats($)).toMatch(/^R 1  ▼ 0  ↗ 0  ⚒ 0/)
  expect((await $.command.run({ command: 'duck', args: 'double' } as never)).text).toMatch(/nothing counts/)
  expect((await $.command.run({ command: 'duck', args: 'flyaway' } as never)).text).toMatch(/dog laughs/)
  expect(await stats($)).toMatch(/^R 1  ▼ 0  ↗ 0/)
})

test('a commit is a duck down, with a notice; nothing to commit is none', ONLY, async ($, on) => {
  const toasts: string[] = []
  world(on, toasts)
  let out = 'nothing to commit, working tree clean'
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: out, stderr: '', interrupted: false },
    text: out,
  }))
  await begin($, on)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  expect(toasts.join(' ')).not.toMatch(/Got one/)
  expect(await stats($)).toMatch(/⚒ 1/)
  out = '[main abc1234] x\n 1 file changed'
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "y"' })
  expect(toasts.join(' ')).toMatch(/Commit.*Got one/)
  expect(await stats($)).toMatch(/Last win: .*a duck down/)
})

test('/arcade knows the hunt by its other names', { options: { mode: 'all', pool: 'duck-hunt, outlaw' } }, async ($, on) => {
  world(on)
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: '' } as never)).text ?? ''
  expect(text).toMatch(/● Duck Hunt \(duck\)/)
})
