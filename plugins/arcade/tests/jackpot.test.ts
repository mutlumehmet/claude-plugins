import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { outcome, score } from '../src/games/jackpot'
import { begin } from './start'

// The Arcade shows only this game in these tests.
const ONLY = { options: { mode: 'fixed', pool: 'jackpot' } }

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

const stats = async ($: Engine) => (await $.command.run({ command: 'jackpot', args: '' } as never)).text

test('the machine sits in the band with its stats line', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /◉ 0 {2}×1 {2}▲ 0 {2}✦ 0 {2}♛ 0/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  await ui.unmount()
})

test('scores: three sevens are the jackpot, a pair pays a little, nothing pays nothing', ONLY, async () => {
  expect(score(['seven', 'seven', 'seven'])).toEqual({ win: 'jackpot', pay: 100 })
  expect(score(['bell', 'bell', 'bell'])).toEqual({ win: 'triple', pay: 15 })
  expect(score(['cherry', 'star', 'cherry'])).toEqual({ win: 'pair', pay: 3 })
  expect(score(['seven', 'bell', 'star'])).toEqual({ win: 'none', pay: 0 })
})

test('a golden spin never loses, and the lowest roll is the jackpot', ONLY, async () => {
  for (let i = 0; i < 200; i++) expect(score(outcome(true)).pay).toBeGreaterThan(0)
  expect(outcome(false, 0)).toEqual(['seven', 'seven', 'seven'])
})

test('/jackpot hide covers the machine', ONLY, async ($, on) => {
  world(on)
  await begin($, on)
  await $.command.run({ command: 'jackpot', args: 'hide' } as never)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})
