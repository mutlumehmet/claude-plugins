import { expect, test } from 'claude-code/testing'

function engine(on, files: Record<string, string> = {}) {
  const seen = { toasts: [] as string[], runs: [] as string[] }
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('session.cwd', () => ({ value: '/work/app/src' }))
  on('command.register', () => ({ value: { command: 'orca' } }))
  on('command.run', { command: 'orca-strator:orca' }, ($, e) => { seen.runs.push(String(e.args)); return { text: '' } as never })
  on('clock.after', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { seen.toasts.push(e.text); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  return seen
}
const settle = () => new Promise(res => setTimeout(res, 30))

test('a session in a fleet project gets one line about /orca', async ($, on) => {
  const seen = engine(on, { '/work/app/.claude/orca-strator.json': '{}' })
  await $.session.start({ cwd: '/work/app/src', surface: 'terminal', isInteractive: true })
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toContain('/orca')
})

test('no fleet config, no line', async ($, on) => {
  const seen = engine(on)
  await $.session.start({ cwd: '/work/app/src', surface: 'terminal', isInteractive: true })
  expect(seen.toasts).toEqual([])
})

