import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'dragon-lair',
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

async function hoard($: Engine) {
  return (await $.command.run({ command: 'dragon', args: '' } as never)).text
}

test('the dragon sits in the band on the terminal', async ($, on) => {
  world(on)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Lv 1  ◆ 0  ★ 0  ⚒ 0/ })).toBeDefined()
  await ui.unmount()
})

test('/dragon hide takes it out of the band', async ($, on) => {
  world(on)
  await $.command.run({ command: 'dragon', args: 'hide' } as never)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('/dragon fire breathes fire and adds gold', async ($, on) => {
  world(on)
  const ran = await $.command.run({ command: 'dragon', args: 'fire' } as never)
  expect(ran.text).toBe('The dragon breathes fire.')
  expect(await hoard($)).toMatch(/◆ 1 /)
})

test('nothing to commit earns no gold', async ($, on) => {
  world(on)
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: 'nothing to commit, working tree clean', stderr: '', interrupted: false },
    text: 'nothing to commit, working tree clean',
  }))
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  expect(await hoard($)).toMatch(/◆ 0  ★ 0  ⚒ 1/)
})

test('a commit is a medium moment on its own, no other mod needed', async ($, on) => {
  world(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '[main abc] x', stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  expect(await hoard($)).toMatch(/◆ 5 /)
})

test('a merge roars for 50 gold', async ($, on) => {
  world(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'Merged', stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 3' })
  expect(await hoard($)).toMatch(/◆ 50 /)
})

test('a configured big command counts as big', { options: { big_commands: 'make ship' } }, async ($, on) => {
  world(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: 'make ship' })
  expect(await hoard($)).toMatch(/◆ 25 /)
})

test('a hidden dragon sends no notifications', async ($, on) => {
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined }
  })
  await $.command.run({ command: 'dragon', args: 'hide' })
  await $.command.run({ command: 'dragon', args: 'fire' })
  expect(toasts).toHaveLength(0)
})
