// answer-buttons: three small buttons under Claude's last answer.
//   ✎ Plain English    asks for that answer again in plain words
//   ✂ Shorter          asks for the same answer, cut down
//   ✎✂ Plain & short   plain words, held to 2 or 3 sentences
// The two Plain buttons send a built in prompt, or run the skill the plain_skill
// setting names. From the keyboard: /answer-buttons:shorter and
// /answer-buttons:plain-short (commands/), and that skill's own command.

import type { Register } from 'claude-code'

// Skills are commands, and a mod may not submit a '/' text, so the skill runs
// through $.command.run
export const PLAIN_ARGS = 'Re-explain your last answer.'
export const PLAIN_PROMPT =
  'Re-explain your last answer in plain English for someone who is not an expert in this area: ' +
  'first what the thing is, in its own terms, then one analogy labelled as one and where it stops being true, ' +
  'then where it actually is (a file, a command, a menu) and what breaks if it is wrong. Under 200 words. ' +
  'Keep any yes/no question and any copyable draft exactly as they were.'
export const PLAIN_SHORT_ARGS =
  'Re-explain your last answer in 2 or 3 sentences only: the thing itself, then one labelled analogy. ' +
  'Keep any yes/no question and any copyable draft exactly as they were.'
export const PLAIN_SHORT_PROMPT =
  'Re-explain your last answer in plain English, in 2 or 3 sentences only: the thing itself, then one ' +
  'labelled analogy. Keep any yes/no question and any copyable draft exactly as they were.'
export const SHORTER_PROMPT =
  'Make your last answer shorter: lead with what it means for me in 2 or 3 sentences, ' +
  'keep any yes/no question and any copyable draft exactly as they were, drop the rest. ' +
  'Reply in the same language as before.'

// The final text of the last main conversation answer, and whether a turn is
// running. Module variables: a hot reload clears them, which only hides the
// buttons until the next answer.
let lastAnswer = ''
let isWorking = false
// The skill the Plain buttons run, from the plain_skill setting; empty sends the built in prompts
let plainSkill = ''
export function setPlainSkill(name: string | undefined) {
  plainSkill = String(name ?? '').trim().replace(/^\//, '')
}

// True for the text block that ends the last answer
export function isLastBlock(blockText: string, answer: string): boolean {
  const block = blockText.trim()
  return block.length > 0 && answer.trim().endsWith(block)
}

export const register: Register = (on, options) => {
  setPlainSkill(options?.plain_skill as string | undefined)
  on('turn.start', async ($, e, next) => {
    isWorking = true
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Subagent turns end inside the main one; only the main answer counts
    if (!e.agentId) {
      isWorking = false
      lastAnswer = e.reason === 'answer' ? e.answer : ''
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const own = await next(e)
    if (isWorking || e.surface === 'vscode' || e.surface === 'mobile') return own
    if (!isLastBlock(e.props.text, lastAnswer)) return own

    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {own}
        <Box gap={2}>
          <Button key="plain" plain dimColor onPress={() => (plainSkill ? $.command.run({ command: plainSkill, args: PLAIN_ARGS }) : $.prompt.submit({ text: PLAIN_PROMPT, asUser: true }))}>
            ✎ Plain English
          </Button>
          <Button key="shorter" plain dimColor onPress={() => $.prompt.submit({ text: SHORTER_PROMPT, asUser: true })}>
            ✂ Shorter
          </Button>
          <Button key="plain-short" plain dimColor onPress={() => (plainSkill ? $.command.run({ command: plainSkill, args: PLAIN_SHORT_ARGS }) : $.prompt.submit({ text: PLAIN_SHORT_PROMPT, asUser: true }))}>
            ✎✂ Plain & short
          </Button>
        </Box>
      </Box>
    )
  })
}
