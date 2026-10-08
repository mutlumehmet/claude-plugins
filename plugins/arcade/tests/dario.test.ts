import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin, pin } from './start'

// The Arcade shows only this game in these tests.
const ONLY = { mode: 'fixed', pool: 'dario' }

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
  return (await $.command.run({ command: 'dario', args: '' } as never)).text ?? ''
}

test('the course fills the band and keeps what was there below it', async ($, on) => {
  pin(ONLY)
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  expect((raster as unknown as { props: { columns: number } }).props.columns).toBe(90)
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  await ui.unmount()
})

test('/dario explains the score, and practice counts nothing', async ($, on) => {
  pin(ONLY)
  world(on)
  await begin($, on)
  expect(await stats($)).toMatch(/^1-1  ◎ 0  ✪ 0  ✗ 0  ⚒ 0/)
  for (const arg of ['coin', 'ouch', 'stomp', 'clear', 'world']) {
    expect((await $.command.run({ command: 'dario', args: arg } as never)).text).toMatch(/Practice/)
  }
  expect(await stats($)).toMatch(/^1-1  ◎ 0  ✪ 0  ✗ 0/)
})

test('a commit is a stomp, with a notice; nothing to commit is none', async ($, on) => {
  pin(ONLY)
  const toasts: string[] = []
  world(on, toasts)
  let out = 'nothing to commit, working tree clean'
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: out, stderr: '', interrupted: false },
    text: out,
  }))
  await begin($, on)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  expect(toasts.join(' ')).not.toMatch(/Stomp/)
  expect(await stats($)).toMatch(/⚒ 1/)
  out = '[main abc1234] x\n 1 file changed'
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "y"' })
  expect(toasts.join(' ')).toMatch(/Commit.*Stomp/)
  expect(await stats($)).toMatch(/Last win: Commit: a bug stomped/)
})

test('/arcade knows Dario by its other names', async ($, on) => {
  pin({ mode: 'all', pool: 'dario, duck' })
  world(on)
  await begin($, on)
  const text = (await $.command.run({ command: 'arcade', args: '' } as never)).text ?? ''
  expect(text).toMatch(/● Dario \(dario\)/)
})
