import { expect, test } from 'claude-code/testing'

const HOME = '/home/u'
const FILE = HOME + '/.config/orca-strator/context/s-1.json'
const NOW = Date.parse('2026-11-03T20:00:00Z')

// Stands for Claude Code: an in-memory disk, the environment, a session id and a clock
function engine(on, { usage = { context: {} } } = {}) {
  const disk: Record<string, string> = {}
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.write', ($, e) => { disk[e.path] = e.text; return { value: undefined } })
  on('session.id', () => ({ value: 's-1' }))
  on('session.usage', () => ({ value: { startedAt: NOW, rateLimits: [], ...usage } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: NOW }))
  return { disk }
}

const measure = ($, percent: number, window = 1000000) =>
  $.session.measure({ context: { tokens: Math.round(percent * window / 100), window, percent }, rateLimits: [], changed: ['context'] })

test('writes nothing at start when the session has no reading yet', async ($, on) => {
  const { disk } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(Object.keys(disk)).toEqual([])
})

test('writes the reading at start when there is one', async ($, on) => {
  const { disk } = engine(on, { usage: { context: { tokens: 150000, window: 1000000, percent: 15 } } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(JSON.parse(disk[FILE])).toEqual({ sessionId: 's-1', tokens: 150000, window: 1000000, percent: 15, at: NOW })
})

test('every context change overwrites the file with the harness number', async ($, on) => {
  const { disk } = engine(on)
  await measure($, 16)
  expect(JSON.parse(disk[FILE]).percent).toBe(16)
  await measure($, 72)
  expect(JSON.parse(disk[FILE])).toEqual({ sessionId: 's-1', tokens: 720000, window: 1000000, percent: 72, at: NOW })
})

test('a measure without a context change writes nothing', async ($, on) => {
  const { disk } = engine(on)
  await $.session.measure({ context: { tokens: 1, window: 1000000, percent: 0 }, rateLimits: [], changed: ['rateLimits'] })
  expect(Object.keys(disk)).toEqual([])
})
