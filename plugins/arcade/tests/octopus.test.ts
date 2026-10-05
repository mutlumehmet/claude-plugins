import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin } from './start'

// The Arcade shows only this game in these tests.
const ONLY = { options: { mode: 'fixed', pool: 'octopus' } }

const BAND = {
  plugin: 'arcade',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, bodyColumns: 100 } as never,
} as const

function world(on: On) {
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'account · project') as never
  })
}

async function stats($: Engine) {
  return (await $.command.run({ command: 'octopus', args: '' } as never)).text
}

test('the city fills the band and keeps what was there below it', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  expect((raster as unknown as { props: { columns: number } }).props.columns).toBe(100)
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  await ui.unmount()
})

test('/arcade hide takes the octopus out of the band, /arcade next brings it back', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const run = async (args: string) => (await $.command.run({ command: 'octopus', args } as never)).text ?? ''
  expect((await $.command.run({ command: 'arcade', args: 'hide' } as never)).text).toMatch(/No game in this terminal/)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
  expect((await $.command.run({ command: 'arcade', args: 'next' } as never)).text).toMatch(/Octo Invader in this terminal/)
  expect(await run('')).toMatch(/Lv 1/)
})

test('/octopus plane shows off and adds xp', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ran = await $.command.run({ command: 'octopus', args: 'plane' } as never)
  expect(ran.text).toBe('The octopus shows off.')
  expect(await stats($)).toMatch(/Last win: Practice: \+1 xp/)
})

test('a commit is a medium moment, nothing to commit is none', ONLY, async ($, on) => {
  world(on)
  let out = 'nothing to commit, working tree clean'
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: out, stderr: '', interrupted: false },
    text: out,
  }))
  await begin($, on)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  expect(await stats($)).toMatch(/Lv 1  ⌂ 0  ✈ 0  ⚒ 1$/)
  out = '[main abc1234] x\n 1 file changed'
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "y"' })
  expect(await stats($)).toMatch(/⚒ 2\nLast win: .*\+5 xp/)
})
