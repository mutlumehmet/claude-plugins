import { expect, mock, test } from 'claude-code/testing'

test('hide twice stays hidden, show brings it back, show twice stays showing', async ($, on) => {
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }))
  const run = async (args: string) => (await $.command.run({ command: 'outlaw', args })).text ?? ''
  expect(await run('hide')).toBe('The outlaws ride off.')
  expect(await run('hide')).toMatch(/already hidden/)
  expect(await run('show')).toBe('The outlaws are back.')
  expect(await run('show')).toMatch(/already showing/)
})
