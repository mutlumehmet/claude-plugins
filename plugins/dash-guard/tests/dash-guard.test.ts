import { expect, test } from 'claude-code/testing'
import { findDashes } from '../hooks/register.js'

const EM = '—'
const EN = '–'

// Stands for Claude Code: records each tool that actually ran
function engine(on, ran: string[], existing = '') {
  on('fs.read', () => (existing ? { value: existing } : { deny: 'no such file' }))
  on('tool.call', ($, e) => {
    ran.push(e.tool)
    return { result: 'ok' }
  })
}

test('finds em dash, en dash and a double hyphen, with line numbers', () => {
  const found = findDashes('one\ntwo ' + EM + ' three\n2020' + EN + '2021\nthis -- that\nthis--that', '')
  expect(found.map((f) => [f.line, f.kind])).toEqual([[2, 'em dash'], [3, 'en dash'], [4, 'double hyphen'], [5, 'double hyphen']])
})

test('a bare CLI flag and an indented fence in a list are not punctuation', () => {
  const md = ['Run git reset --hard to undo.', '1. Step:', '   ```bash', '   vercel ls ' + EM + ' x', '   ```'].join('\n')
  expect(findDashes(md, '')).toEqual([])
})

test('leaves code, comments, rules and table separators alone', () => {
  const md = [
    '---',
    'title: x',
    '---',
    'Run `claude --plugin-dir .` first.',
    '```bash',
    'git push --force-with-lease',
    'echo "a ' + EM + ' b"',
    '```',
    '<!-- note -- here -->',
    '| a | b |',
    '|---|---|',
    '***',
  ].join('\n')
  expect(findDashes(md, '')).toEqual([])
})

test('lines that already had a dash are not reported', () => {
  const old = 'Old line ' + EM + ' kept'
  expect(findDashes(old + '\nNew line ' + EM + ' added', old)).toEqual([
    { line: 2, kind: 'em dash', text: 'New line ' + EM + ' added' },
  ])
})

test('Write to a markdown file with an em dash is refused with the line', async ($, on) => {
  const ran: string[] = []
  engine(on, ran)
  const out = await $.tool.call({ tool: 'Write', file_path: '/w/README.md', content: '# T\n\nIt works ' + EM + ' mostly.' })
  expect(out.deny).toMatch(/line 3 \(em dash\)/)
  expect(ran).toEqual([])
})

test('Write to a code file is not checked', async ($, on) => {
  const ran: string[] = []
  engine(on, ran)
  await $.tool.call({ tool: 'Write', file_path: '/w/a.sh', content: 'git push --force ' + EM })
  expect(ran).toEqual(['Write'])
})

test('Edit keeps an existing dash line but refuses a new one', async ($, on) => {
  const ran: string[] = []
  engine(on, ran)
  const keep = await $.tool.call({ tool: 'Edit', file_path: '/w/S.md', old_string: 'a ' + EM + ' b', new_string: 'a ' + EM + ' b\nc, d' })
  expect(keep).toEqual({ result: 'ok' })
  const add = await $.tool.call({ tool: 'Edit', file_path: '/w/S.md', old_string: 'x', new_string: 'x -- y' })
  expect(add.deny).toMatch(/double hyphen/)
  expect(ran).toEqual(['Edit'])
})

test('Write over an existing file ignores the dashes it already had', async ($, on) => {
  const ran: string[] = []
  engine(on, ran, 'Legacy ' + EN + ' line')
  await $.tool.call({ tool: 'Write', file_path: '/w/S.md', content: 'Legacy ' + EN + ' line\nNew, clean line' })
  expect(ran).toEqual(['Write'])
})

test('MCP tools named by the tools setting are checked in every nested string', { options: { tools: '^mcp__(docs__create_page|mail__create_draft)$' } }, async ($, on) => {
  const ran: string[] = []
  engine(on, ran)
  const notion = await $.tool.call({ tool: 'mcp__docs__create_page', pages: [{ properties: { title: 'T' }, content: 'Body ' + EM + ' text' }] })
  expect(notion.deny).toMatch(/em dash/)
  const gmail = await $.tool.call({ tool: 'mcp__mail__create_draft', account: 'p', to: 'a@example.com', subject: 'Hi', body: 'Clean body.' })
  expect(gmail).toEqual({ result: 'ok' })
  expect(ran).toEqual(['mcp__mail__create_draft'])
})

test('/dash-guard off lets a dash through for the session', async ($, on) => {
  const ran: string[] = []
  engine(on, ran)
  const reply = await $.command.run({ command: 'dash-guard', args: 'off' })
  expect(reply.text).toBe('dash-guard is off for this session')
  await $.tool.call({ tool: 'Write', file_path: '/w/R.md', content: 'a ' + EM + ' b' })
  expect(ran).toEqual(['Write'])
})

test('without the tools setting, MCP tools are not checked', async ($, on) => {
  const ran: string[] = []
  on('tool.call', ($, e) => { ran.push(e.tool); return { result: 'ok' } })
  const out = await $.tool.call({ tool: 'mcp__docs__create_page', content: 'one — two' })
  expect(out).toEqual({ result: 'ok' })
  expect(ran).toEqual(['mcp__docs__create_page'])
})

test('banned picks which marks are refused', { options: { banned: 'em' } }, async ($, on) => {
  on('fs.read', () => ({ deny: 'new file' }))
  on('tool.call', () => ({ result: 'ok' }))
  const en = await $.tool.call({ tool: 'Write', file_path: '/w/a.md', content: 'pages 3–5 and a -- b' })
  expect(en).toEqual({ result: 'ok' })
  const em = await $.tool.call({ tool: 'Write', file_path: '/w/b.md', content: 'one — two' })
  expect(em.deny).toMatch(/forbids em dashes in prose/)
})
