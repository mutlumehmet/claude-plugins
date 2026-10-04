import { expect, test } from 'claude-code/testing'
// @ts-ignore: the test kit loads .tsx paths; tsc wants allowImportingTsExtensions
import { isLastBlock, PLAIN_ARGS, PLAIN_PROMPT, PLAIN_SHORT_ARGS, PLAIN_SHORT_PROMPT, SHORTER_PROMPT } from '../hooks/register.tsx'

const ANSWER = 'First block.\n\nLast block of the answer.'

function message(text: string, surface: 'terminal' | 'desktop') {
  return {
    plugin: 'answer-buttons',
    surface,
    component: 'AssistantMessage',
    requestId: 'msg-1',
    viewport: { columns: 100, rows: 30 },
    props: { text, isFirstOfReply: false },
  } as const
}

function engine(on: any, submitted: string[]) {
  // What Claude Code draws for the message, standing for its own row
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('turn.start', ($: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($: unknown, e: any) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('command.run', ($: unknown, e: any) => {
    submitted.push('/' + e.command + ' ' + e.args)
    return {}
  })
}

test('isLastBlock matches only the block that ends the answer', () => {
  expect(isLastBlock('Last block of the answer.', ANSWER)).toBe(true)
  expect(isLastBlock('First block.', ANSWER)).toBe(false)
  expect(isLastBlock('   ', ANSWER)).toBe(false)
  expect(isLastBlock('anything', '')).toBe(false)
})

test('the last block gets all three buttons, and each sends its prompt when no skill is set', async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 5, isAborted: false, reason: 'answer' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(message('Last block of the answer.', surface))
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
    expect(await ui.find({ key: 'plain' })).toBeDefined()
    await ui.press({ key: 'plain' })
    await ui.press({ key: 'shorter' })
    await ui.press({ key: 'plain-short' })
    await ui.unmount()
  }
  expect(submitted).toEqual([PLAIN_PROMPT, SHORTER_PROMPT, PLAIN_SHORT_PROMPT, PLAIN_PROMPT, SHORTER_PROMPT, PLAIN_SHORT_PROMPT])
})

test('an earlier block gets no buttons', async ($, on) => {
  engine(on, [])
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 5, isAborted: false, reason: 'answer' })
  const ui = await $.ui.mount(message('First block.', 'terminal'))
  expect(await ui.find({ key: 'plain' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('no buttons while Claude is working, nor after an interrupted turn', async ($, on) => {
  engine(on, [])
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 5, isAborted: false, reason: 'answer' })
  await $.turn.start({ turnId: 't2', text: 'q' })
  let ui = await $.ui.mount(message('Last block of the answer.', 'terminal'))
  expect(await ui.find({ key: 'plain' })).toBeUndefined()
  await ui.unmount()

  await $.turn.complete({ turnId: 't2', answer: ANSWER, durationMs: 5, isAborted: true, reason: 'aborted' })
  ui = await $.ui.mount(message('Last block of the answer.', 'terminal'))
  expect(await ui.find({ key: 'plain' })).toBeUndefined()
})

test('with plain_skill set, the two Plain buttons run that skill', { options: { plain_skill: 'my-plugin:plain-english' } }, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  await $.turn.start({ turnId: 't1', text: 'q' })
  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 5, isAborted: false, reason: 'answer' })
  const ui = await $.ui.mount(message('Last block of the answer.', 'terminal'))
  await ui.press({ key: 'plain' })
  await ui.press({ key: 'plain-short' })
  expect(submitted).toEqual(['/my-plugin:plain-english ' + PLAIN_ARGS, '/my-plugin:plain-english ' + PLAIN_SHORT_ARGS])
})
