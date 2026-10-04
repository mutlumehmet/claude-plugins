import { expect, mock, test } from 'claude-code/testing'
// @ts-ignore: plain JS module
import { commandParts } from '../hooks/register.js'

// A fake disk: path -> { mtimeMs, size }. A Bash command that the stub runs
// can change it, and the test can change it to play another session.
function engine(on, disk: Map<string, { mtimeMs: number; size: number }>, ran: string[], writes: Record<string, string> = {}) {
  mock.env(on, { HOME: '/home/t' })
  on('session.cwd', () => ({ value: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('fs.stat', ($, e) => {
    const f = disk.get(e.path)
    return f ? { value: { kind: 'file', size: f.size, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  on('tool.call', ($, e) => {
    ran.push(e.tool === 'Bash' ? e.command : e.tool)
    const target = writes[e.command ?? '']
    if (target) disk.set(target, { mtimeMs: (disk.get(target)?.mtimeMs ?? 0) + 1000, size: 99 })
    return { result: 'ok' }
  })
}

const S = '/work/STATUS.md'
const fresh = () => new Map([[S, { mtimeMs: 1000, size: 10 }]])

test('grep -i only reads; sed -i still counts as a write', async ($, on) => {
  const ran: string[] = []
  engine(on, fresh(), ran)
  // sed first: once grep has run, the file counts as read and a later write is allowed
  const sed = await $.tool.call({ tool: 'Bash', command: "sed -i '' 's/a/b/' STATUS.md" })
  expect(sed.deny).toContain('has not been read in this session')
  const grep = await $.tool.call({ tool: 'Bash', command: 'grep -n -i "next" STATUS.md' })
  expect(grep).toEqual({ result: 'ok' })
})

test('a shell write to a shared file this session never read is refused', async ($, on) => {
  const ran: string[] = []
  engine(on, fresh(), ran)
  const out = await $.tool.call({ tool: 'Bash', command: "python3 - <<'EOF'\nopen('STATUS.md','w').write('x')\nEOF" })
  expect(out.deny).toContain('has not been read in this session')
  expect(ran).toEqual([])
})

test('after a Read, the same write runs', async ($, on) => {
  const ran: string[] = []
  engine(on, fresh(), ran)
  await $.tool.call({ tool: 'Read', file_path: S })
  const out = await $.tool.call({ tool: 'Bash', command: "sed -i '' 's/a/b/' STATUS.md" })
  expect(out).toEqual({ result: 'ok' })
})

test('a write after another session changed the file is refused', async ($, on) => {
  const ran: string[] = []
  const disk = fresh()
  engine(on, disk, ran)
  await $.tool.call({ tool: 'Read', file_path: S })
  disk.set(S, { mtimeMs: 5000, size: 12 }) // the other session writes
  const out = await $.tool.call({ tool: 'Bash', command: 'cat new.txt >> /work/STATUS.md' })
  expect(out.deny).toContain('changed since this session last read it')
  expect(ran).toEqual(['Read'])
})

test("this session's own shell write does not block its next one", async ($, on) => {
  const ran: string[] = []
  const cmd1 = "printf 'a' >> STATUS.md"
  engine(on, fresh(), ran, { [cmd1]: S })
  await $.tool.call({ tool: 'Read', file_path: S })
  await $.tool.call({ tool: 'Bash', command: cmd1 })
  const out = await $.tool.call({ tool: 'Bash', command: "printf 'b' >> STATUS.md" })
  expect(out).toEqual({ result: 'ok' })
})

test('reading through the shell counts as a read, and a redirect to /dev/null is not a write', async ($, on) => {
  const ran: string[] = []
  engine(on, fresh(), ran)
  const read = await $.tool.call({ tool: 'Bash', command: 'grep -n Last STATUS.md 2>/dev/null' })
  expect(read).toEqual({ result: 'ok' })
  const write = await $.tool.call({ tool: 'Bash', command: "echo x | tee -a ~/../../work/STATUS.md" })
  expect(write).toEqual({ result: 'ok' })
})

test('a ~ path resolves against HOME', async ($, on) => {
  const ran: string[] = []
  const disk = new Map([['/home/t/Projects/x/CLAUDE.md', { mtimeMs: 1, size: 1 }]])
  engine(on, disk, ran)
  const out = await $.tool.call({ tool: 'Bash', command: 'mv /tmp/new ~/Projects/x/CLAUDE.md' })
  expect(out.deny).toContain('/home/t/Projects/x/CLAUDE.md has not been read')
})

test('creating a shared file that does not exist yet, and touching other files, are allowed', async ($, on) => {
  const ran: string[] = []
  engine(on, new Map(), ran)
  expect(await $.tool.call({ tool: 'Bash', command: "echo '# Status' > STATUS.md" })).toEqual({ result: 'ok' })
  expect(await $.tool.call({ tool: 'Bash', command: 'echo hi > notes.md' })).toEqual({ result: 'ok' })
})

test('/shared-file-guard off lets a stale write through', async ($, on) => {
  const ran: string[] = []
  engine(on, fresh(), ran)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const reply = await $.command.run({ command: 'shared-file-guard', args: 'off' })
  expect(reply.text).toContain('Guard off')
  const out = await $.tool.call({ tool: 'Bash', command: "sed -i '' 's/a/b/' STATUS.md" })
  expect(out).toEqual({ result: 'ok' })
})

test('watched_files adds names, with * for any run of name characters', { options: { watched_files: 'STATUS.md,jobs.json,*register*.md' } }, async ($, on) => {
  const ran: string[] = []
  const disk = new Map([
    ['/work/jobs.json', { mtimeMs: 1000, size: 10 }],
    ['/work/findings-register.md', { mtimeMs: 1000, size: 10 }],
    ['/work/CLAUDE.md', { mtimeMs: 1000, size: 10 }],
  ])
  engine(on, disk, ran)
  const jobs = await $.tool.call({ tool: 'Bash', command: 'echo x >> jobs.json' })
  expect(jobs.deny).toContain('/work/jobs.json')
  const reg = await $.tool.call({ tool: 'Bash', command: 'echo x >> findings-register.md' })
  expect(reg.deny).toContain('/work/findings-register.md')
  // CLAUDE.md is not in this list, so it is not watched
  const claude = await $.tool.call({ tool: 'Bash', command: 'echo x >> CLAUDE.md' })
  expect(claude).toEqual({ result: 'ok' })
})

test('commandParts splits at unquoted &&, ||, ; and |, and keeps a heredoc whole', () => {
  expect(commandParts("sed -i '' 's/a/b/' x.txt && grep -i y STATUS.md")).toEqual(["sed -i '' 's/a/b/' x.txt", 'grep -i y STATUS.md'])
  expect(commandParts("echo 'a && b' >> STATUS.md")).toEqual(["echo 'a && b' >> STATUS.md"])
  expect(commandParts('cat a | tee STATUS.md; git status')).toEqual(['cat a', 'tee STATUS.md', 'git status'])
  const heredoc = "python3 - <<'EOF'\nopen('STATUS.md','w'); x = 1\nEOF"
  expect(commandParts(heredoc)).toEqual([heredoc])
})

test('a write and a read of a shared file in different parts of one command is not refused', async ($, on) => {
  const ran: string[] = []
  engine(on, fresh(), ran)
  const out = await $.tool.call({ tool: 'Bash', command: "sed -i '' 's/a/b/' notes.txt && grep -n x STATUS.md" })
  expect(out).toEqual({ result: 'ok' })
  const pull = await $.tool.call({ tool: 'Bash', command: 'git pull -q && grep -c x STATUS.md' })
  expect(pull).toEqual({ result: 'ok' })
})

test('a write to the shared file in its own part is still refused', async ($, on) => {
  const ran: string[] = []
  engine(on, fresh(), ran)
  const out = await $.tool.call({ tool: 'Bash', command: 'grep -n x notes.txt && cat a | tee STATUS.md' })
  expect(out.deny).toContain('has not been read in this session')
  expect(ran).toEqual([])
})
