import { expect, mock, test } from 'claude-code/testing'

const NOON = Date.parse('2026-10-08T12:00')
const MIDNIGHT = Date.parse('2026-10-08T23:30')
const LONG = { answer: 'x', durationMs: 90000, isAborted: false, turnId: 't', reason: 'answer' } as const

// Stands for Claude Code: a clock, the store, the front app, a folder of your packs, and a
// speaker and a voice that record what they were asked to play
function engine(on, opts: { now?: number; front?: string; settings?: object; yours?: boolean; voices?: string[] } = {}) {
  const played: string[] = []
  // Files the mod writes (the shared last-played time), readable back like on disk
  const files: Record<string, string> = {}
  const spoken: { text: string; voice?: string }[] = []
  const clock = { now: opts.now ?? NOON }
  on('clock.now', () => ({ value: clock.now }))
  mock.store(on, opts.settings ? { settings: opts.settings } : {})
  mock.env(on, { HOME: '/home/test' })
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '"LSDisplayName"="' + (opts.front ?? 'Web Browser') + '"\n', stderr: '' },
  }))
  // The packs folder is named after the plugin: ~/.config/<plugin>/packs
  on('fs.exists', ($, e) => ({ value: !!opts.yours && /^\/home\/test\/\.config\/[a-z-]+\/packs$/.test(e.path) }))
  on('fs.list', () => ({ value: [{ name: 'office', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  on('fs.read', ($, e) => {
    if (e.path in files) return { value: files[e.path] }
    if (e.path.endsWith('last-played')) throw new Error('missing')
    return e.path.endsWith('pack.json')
      ? { value: JSON.stringify({ label: 'my office', failed: ['sigh.wav'], pushed: ['cheer.mp3'] }) }
      : { value: { base64: 'AAAA' } }
  })
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('audio.play', ($, e) => {
    played.push(e.clip.asset ?? e.clip.mime)
    return { value: undefined }
  })
  on('audio.speak', ($, e) => {
    if (e.voice && opts.voices && !opts.voices.includes(e.voice)) throw new Error('voice not installed')
    spoken.push({ text: e.text, voice: e.voice })
    return { value: { isSpoken: true } }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) =>
    e.command.includes('fail') ? { result: {}, text: 'exit 1', isError: true } : { result: {}, text: 'ok' },
  )
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: {}, text: 'answered' }))
  on('tool.call', { tool: 'mcp__notes__search' }, () => ({ result: {}, text: 'found' }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/repo' }))
  return { played, spoken, clock, files }
}

// Lets the unawaited play settle
const settle = () => new Promise((r) => setTimeout(r, 0))

test('terran by default: a long turn plays a clip, a short one nothing', async ($, on) => {
  const { played } = engine(on)
  await $.turn.complete({ ...LONG, durationMs: 5000 })
  await settle()
  expect(played).toEqual([])
  await $.turn.complete(LONG)
  await settle()
  expect(played.length).toBe(1)
  expect(played[0]).toMatch(/^sounds\/terran\/.+\.mp3$/)
})

test('a failed test and a git push each get their moment, other commands nothing', async ($, on) => {
  const { played, clock } = engine(on, { settings: { defaultPack: 'terran' } })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'npm test fail' })
  await settle()
  clock.now += 5000
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await settle()
  expect(played.length).toBe(2)
  expect(played[0]).toMatch(/^sounds\/terran\/(nuclear-launch|base-under-attack)\.mp3$/)
  expect(played[1]).toMatch(/^sounds\/terran\/in-the-pipe\.mp3$/)
})

test('your own pack loads at session start and plays from its bytes', async ($, on) => {
  const { played } = engine(on, { yours: true })
  await $.session.start({ source: 'startup' } as any)
  const listed = await $.command.run({ command: 'sounds', args: '' })
  expect(listed.text).toContain('office: my office')
  await $.command.run({ command: 'sounds', args: 'office' })
  await $.tool.call({ tool: 'Bash', command: 'npm test fail' })
  await settle()
  expect(played).toEqual(['audio/wav'])
})

test('/sounds <pack> changes this terminal, /sounds default <pack> new ones', async ($, on) => {
  engine(on)
  const here = await $.command.run({ command: 'sounds', args: 'protoss' })
  expect(here.text).toMatch(/^This terminal now plays protoss: .+\nNew terminals still start with terran \(\/sounds default protoss to change that\)$/)
  const def = await $.command.run({ command: 'sounds', args: 'default red-alert' })
  expect(def.text).toMatch(/^Default changed: new terminals now start with red-alert: /)
  const status = await $.command.run({ command: 'sounds', args: '' })
  expect(status.text).toContain('New terminals: red-alert')
  const again = await $.command.run({ command: 'sounds', args: 'default red-alert' })
  expect(again.text).toMatch(/^Default is already red-alert/)
})

test('quiet hours keep it silent', async ($, on) => {
  const night = engine(on, { now: MIDNIGHT })
  await $.turn.complete(LONG)
  await settle()
  expect(night.played).toEqual([])
})

test('away mode skips while a terminal is in front, but still answers a prompt', async ($, on) => {
  const { played, clock } = engine(on, { front: 'Terminal', settings: { mode: 'away' } })
  await $.turn.complete(LONG)
  await settle()
  expect(played).toEqual([])
  clock.now += 5000
  await $.prompt.submit({ text: 'go' } as any)
  await settle()
  expect(played.length).toBe(1)
})

test('/sounds off mutes and an unknown word lists the packs', async ($, on) => {
  const { played } = engine(on)
  const off = await $.command.run({ command: 'sounds', args: 'off' })
  expect(off.text).toBe('Sound off: no clips until /sounds on')
  const night = await $.command.run({ command: 'sounds', args: 'night off' })
  expect(night.text).toBe('Quiet hours off: clips play at night too')
  await $.turn.complete(LONG)
  await settle()
  expect(played).toEqual([])
  const bad = await $.command.run({ command: 'sounds', args: 'kazoo' })
  expect(bad.text).toContain('red-alert')
})

test('/sounds test plays every sound of a pack', async ($, on) => {
  const { played } = engine(on)
  const out = await $.command.run({ command: 'sounds', args: 'test blood' })
  expect(out.text).toMatch(/^Played \d+ sounds of blood$/)
  expect(played.length).toBeGreaterThan(8)
})

test('a prompt plays only after five quiet minutes', async ($, on) => {
  const { played, clock } = engine(on)
  await $.prompt.submit({ text: 'go' } as any)
  await settle()
  clock.now += 60000
  await $.prompt.submit({ text: 'and this' } as any)
  await settle()
  expect(played.length).toBe(1)
  clock.now += 5 * 60000
  await $.prompt.submit({ text: 'back again' } as any)
  await settle()
  expect(played.length).toBe(2)
})

test('a question for you plays its moment before the answer', async ($, on) => {
  const { played } = engine(on, { settings: { defaultPack: 'terran' } })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  await settle()
  expect(played.length).toBe(1)
  expect(played[0]).toMatch(/^sounds\/terran\/(piece-of-me|supply-depots)\.mp3$/)
})

test('failed means a check step failed, not a script that mentions one', async ($, on) => {
  const { played, clock } = engine(on, { settings: { defaultPack: 'terran' } })
  const failing = [
    "python3 - <<'EOF'\nprint('test build check')\nfail\nEOF",
    'cat tests/fail.txt',
    'grep -rn check src fail',
  ]
  for (const command of failing) {
    await $.tool.call({ tool: 'Bash', command })
    clock.now += 5000
  }
  await settle()
  expect(played).toEqual([])
  const checks = ['cd app && npm run build fail', 'claude plugin test plugins/x fail', 'scripts/check-personal.sh --all fail', 'uv run pytest -q fail']
  for (const command of checks) {
    await $.tool.call({ tool: 'Bash', command })
    await settle()
    clock.now += 5000
  }
  expect(played.length).toBe(checks.length)
})

test('another terminal that just played keeps this one quiet', async ($, on) => {
  const { played, files, clock } = engine(on)
  // The file is named after the plugin: ~/.config/<plugin>/last-played
  const shared = () => Object.keys(files).find((path) => path.endsWith('/last-played'))
  await $.turn.complete(LONG)
  await settle()
  const path = shared()!
  expect(path).toMatch(/^\/home\/test\/\.config\/[a-z-]+\/last-played$/)
  played.length = 0
  clock.now += 5000
  files[path] = String(clock.now - 1000)
  await $.turn.complete(LONG)
  await settle()
  expect(played).toEqual([])
  clock.now += 5000
  await $.turn.complete(LONG)
  await settle()
  expect(played.length).toBe(1)
  expect(files[path]).toBe(String(clock.now))
})

test('the same clip never plays twice in a row for a moment', async ($, on) => {
  // A pack with several long-turn clips; one with a single clip has to repeat it
  const { played, clock } = engine(on, { settings: { defaultPack: 'aoe' } })
  for (let i = 0; i < 6; i++) {
    await $.turn.complete(LONG)
    await settle()
    clock.now += 4000
  }
  expect(played.length).toBe(6)
  for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1])
})

test('/sounds lists the commands as well as the packs', async ($, on) => {
  engine(on)
  const out = await $.command.run({ command: 'sounds', args: '' })
  expect(out.text).toContain('Commands:')
  expect(out.text).toContain('  /sounds default <pack>: the pack every new terminal starts with')
  expect(out.text).toContain('  /sounds night off: ')
  expect(out.text.indexOf('Commands:')).toBeLessThan(out.text.indexOf('Packs:'))
})

test('a mistyped pack name gets the pack it meant', async ($, on) => {
  engine(on)
  const typo = await $.command.run({ command: 'sounds', args: 'aeo-turk' })
  expect(typo.text).toBe('No pack named aeo-turk. Did you mean aoe-turk? /sounds aoe-turk')
  const def = await $.command.run({ command: 'sounds', args: 'default protos' })
  expect(def.text).toBe('No pack named protos. Did you mean protoss? /sounds default protoss')
  const test = await $.command.run({ command: 'sounds', args: 'test protos' })
  expect(test.text).toBe('No pack named protos. Did you mean protoss? /sounds test protoss')
})

test('one moment can play another pack, one clip, a mix, or nothing', async ($, on) => {
  const { played, clock } = engine(on)
  const push = async () => {
    clock.now += 5000
    await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
    await settle()
  }
  const set = await $.command.run({ command: 'sounds', args: 'pushed aoe-turk' })
  expect(set.text).toMatch(/^pushed now plays: aoe-turk \(\d+ clips, random\)$/)
  await push()
  expect(played[played.length - 1]).toMatch(/^sounds\/aoe-turk\//)
  const one = await $.command.run({ command: 'sounds', args: 'pushed aoe-turk allah-allah' })
  expect(one.text).toBe('pushed now plays: aoe-turk, always allah-allah')
  await push()
  await push()
  expect(played.slice(-2)).toEqual(['sounds/aoe-turk/allah-allah.mp3', 'sounds/aoe-turk/allah-allah.mp3'])
  const mix = await $.command.run({ command: 'sounds', args: 'failed aoe terran' })
  expect(mix.text).toMatch(/^failed now plays: aoe \+ terran \(\d+ clips, random\)$/)
  await $.command.run({ command: 'sounds', args: 'pushed off' })
  const before = played.length
  await push()
  expect(played.length).toBe(before)
  const back = await $.command.run({ command: 'sounds', args: 'pushed reset' })
  expect(back.text).toMatch(/^pushed back to its usual: terran/)
  await push()
  expect(played[played.length - 1]).toMatch(/^sounds\/terran\//)
})

test('a moment lists its clips, and a mistyped clip gets the one it meant', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'sounds', args: 'pushed aoe-turk' })
  const list = await $.command.run({ command: 'sounds', args: 'pushed' })
  expect(list.text).toContain('pushed: git push goes through → aoe-turk')
  expect(list.text).toContain('  allah-allah')
  expect(list.text).toContain('Try: /sounds test aoe-turk pushed')
  const typo = await $.command.run({ command: 'sounds', args: 'pushed aoe-turk alah-allah' })
  expect(typo.text).toBe('aoe-turk has no clip named alah-allah. Did you mean allah-allah? /sounds pushed aoe-turk allah-allah')
  const pack = await $.command.run({ command: 'sounds', args: 'pushed aoe-trk' })
  expect(pack.text).toBe('No pack named aoe-trk. Did you mean aoe-turk? /sounds pushed aoe-turk')
  const test = await $.command.run({ command: 'sounds', args: 'test aoe-turk pushed' })
  expect(test.text).toMatch(/^Played \d+ sounds of aoe-turk for pushed$/)
})

test('/sounds shows every moment and what it plays; MCP is off until turned on', async ($, on) => {
  const { played } = engine(on)
  const all = await $.command.run({ command: 'sounds', args: '' })
  expect(all.text).toContain('Moments (what plays when):')
  expect(all.text).toContain('  subagentStart: a subagent starts → aoe')
  expect(all.text).toContain('  mcp: an MCP tool runs (at most every 5 minutes) → off')
  await $.tool.call({ tool: 'mcp__notes__search', query: 'x' } as any)
  await settle()
  expect(played).toEqual([])
  await $.command.run({ command: 'sounds', args: 'mcp aoe' })
  await $.tool.call({ tool: 'mcp__notes__search', query: 'x' } as any)
  await settle()
  expect(played[0]).toMatch(/^sounds\/aoe\/(trebuchet|mangonel)-fire\.mp3$/)
})
