import { expect, mock, test } from 'claude-code/testing'

// Stands for Claude Code: records toasts, the pinned status and suggestions
function engine(on) {
  const seen = { toasts: [] as string[], status: [] as (string | undefined)[], suggested: [] as string[] }
  const clock = mock.clock(on)
  on('ui.toast', ($, e) => { seen.toasts.push(e.text); return { value: undefined } })
  on('ui.status', ($, e) => { seen.status.push(e.text); return { value: undefined } })
  on('prompt.suggest', ($, e) => { seen.suggested.push(e.text); return { isShown: true } })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('session.compact', () => ({ skip: 'test engine' }))
  return { seen, clock }
}

const measure = ($, percent: number) =>
  $.session.measure({ context: { tokens: percent * 2000, window: 200000, percent }, rateLimits: [], changed: ['context'] })

const turnEnd = ($) =>
  $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 1000, isAborted: false, usage: null })

test('stays quiet under the threshold', async ($, on) => {
  const { seen, clock } = engine(on)
  await measure($, 40)
  await measure($, 79)
  await turnEnd($)
  await clock.advance(1000)
  expect(seen.toasts).toEqual([])
  expect(seen.status).toEqual([])
  expect(seen.suggested).toEqual([])
})

test('at 80% it warns once, pins the status and suggests /save-context after the turn', async ($, on) => {
  const { seen, clock } = engine(on)
  await measure($, 81)
  await measure($, 83)
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toContain('81%')
  expect(seen.status.at(-1)).toBe('Context 83% · /save-context suggested')
  await turnEnd($)
  await clock.advance(300)
  expect(seen.suggested).toEqual(['/save-context'])
})

test('a second warning at 90%, and none after that', async ($, on) => {
  const { seen } = engine(on)
  await measure($, 80)
  await measure($, 91)
  await measure($, 95)
  expect(seen.toasts.length).toBe(2)
  expect(seen.toasts[1]).toContain('91%')
})

test('after save-context it stops suggesting and says so in the status', async ($, on) => {
  const { seen, clock } = engine(on)
  await measure($, 85)
  await $.skill.prompt({ skill: 'save-context', text: '...' })
  await turnEnd($)
  await clock.advance(1000)
  expect(seen.suggested).toEqual([])
  expect(seen.status.at(-1)).toBe('Context 85% · save-context ran')
})

test('an automatic compaction without save-context warns, and never skips the compaction', async ($, on) => {
  const { seen } = engine(on)
  await measure($, 88)
  const out = await $.session.compact({ trigger: 'auto', messages: [] })
  expect(seen.toasts.at(-1)).toContain('save-context has not run in this session')
  // The stub's answer came back untouched: the mod passed the compaction on
  expect(out).toEqual({ skip: 'test engine' })
})

test('emptied by a compaction it clears the status and warns again next time', async ($, on) => {
  const { seen } = engine(on)
  await measure($, 82)
  await measure($, 30)
  expect(seen.status.at(-1)).toBeUndefined()
  await measure($, 80)
  expect(seen.toasts.length).toBe(2)
})

test('/context-alarm reports the fill and the thresholds', async ($, on) => {
  engine(on)
  await measure($, 64)
  const out = await $.command.run({ command: 'context-alarm', args: '' })
  expect(out.text).toContain('Context: 64%')
  expect(out.text).toContain('warns at 80% and 90%')
})
