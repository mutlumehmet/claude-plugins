import { expect, test } from 'claude-code/testing'
import { guard, mask, session } from '../hooks/register.js'

// Fake values, built in pieces so no scanner mistakes this file for a leak
const GH = 'gh' + 'p_' + 'a'.repeat(36)
const AWS = 'AK' + 'IA' + 'B'.repeat(16)

function row(text: string) {
  return {
    door: 'tool-result',
    origin: { kind: 'tool', tool: 'Bash' },
    uuid: 'u1',
    message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: text }] },
  }
}

// Runs the guard the way the engine would: a fake $ answers the question
// with `answer` (null = dismissed), and next stores the row as passed on
async function run(answer: string | null, asked: string[], stored: any[], e: any) {
  const $ = {
    ui: {
      ask: async (q: string) => {
        asked.push(q)
        if (answer === null) throw new Error('dismissed')
        return answer
      },
      toast: () => {},
    },
  }
  const next = async (x: any) => {
    stored.push(x.message)
    return { message: x.message, uuid: x.uuid }
  }
  return guard($ as any, e, next as any)
}

const textOf = (m: any) => m.content[0].content

test('a result with no secret passes untouched and nobody is asked', async () => {
  session.quiet = false
  const asked: string[] = [], stored: any[] = []
  const answer = 'Show it raw'
  await run(answer, asked, stored, row('total 8\nREADME.md'))
  expect(asked).toEqual([])
  expect(textOf(stored[0])).toBe('total 8\nREADME.md')
})

test('Keep it masked stores the masked text, and the question names kinds, not values', async () => {
  session.quiet = false
  const asked: string[] = [], stored: any[] = []
  const answer = 'Keep it masked'
  await run(answer, asked, stored, row('remote: ' + GH + '\nkey ' + AWS))
  expect(textOf(stored[0])).not.toContain(GH)
  expect(textOf(stored[0])).not.toContain(AWS)
  expect(textOf(stored[0])).toContain('[MASKED github-token, 40 chars]')
  expect(asked[0]).toContain('github-token')
  expect(asked[0]).toContain('aws-access-key')
  expect(asked[0]).not.toContain(GH)
})

test('Show it raw lets Claude read the original', async () => {
  session.quiet = false
  const asked: string[] = [], stored: any[] = []
  const answer = 'Show it raw'
  await run(answer, asked, stored, row('token=' + GH))
  expect(textOf(stored[0])).toBe('token=' + GH)
})

test('a dismissed dialog keeps it masked', async () => {
  session.quiet = false
  const asked: string[] = [], stored: any[] = []
  const answer = null
  await run(answer, asked, stored, row(GH))
  expect(textOf(stored[0])).not.toContain(GH)
})

test('a typed answer keeps it masked', async () => {
  session.quiet = false
  const asked: string[] = [], stored: any[] = []
  const answer = 'yes read it'
  await run(answer, asked, stored, row(GH))
  expect(textOf(stored[0])).not.toContain(GH)
})

test('"always mask" stops asking for the rest of the session', async () => {
  session.quiet = false
  const asked: string[] = [], stored: any[] = []
  const answer = "Always mask this session, don't ask"
  await run(answer, asked, stored, row(GH))
  await run(answer, asked, stored, row(AWS))
  expect(asked.length).toBe(1)
  expect(textOf(stored[1])).not.toContain(AWS)
})

test('text blocks inside a tool_result array are masked too', async () => {
  session.quiet = false
  const asked: string[] = [], stored: any[] = []
  const answer = 'Keep it masked'
  const r = row('')
  await run(answer, asked, stored, {
    ...r,
    message: { ...r.message, content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'Authorization: Bearer ' + 'x'.repeat(30) }] }] },
  })
  expect(stored[0].content[0].content[0].text).toBe('Authorization: Bearer [MASKED bearer-token, 30 chars]')
})

test('mask: key names stay, values go; ordinary words are left alone', () => {
  const found = {}
  expect(mask('password: hunter2hunter2', found)).toBe('password: [MASKED secret-value, 14 chars]')
  expect(mask('the token count is high', {})).toBe('the token count is high')
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'
  expect(mask(pem, {})).toBe('[MASKED private-key, ' + pem.length + ' chars]')
})
