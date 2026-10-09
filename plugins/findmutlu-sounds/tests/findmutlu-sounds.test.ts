import { expect, mock, test } from 'claude-code/testing'

const NOON = Date.parse('2026-10-08T12:00')
const MIDNIGHT = Date.parse('2026-10-08T23:30')
const LONG = { answer: 'x', durationMs: 90000, isAborted: false, turnId: 't', reason: 'answer' } as const

// Stands for Claude Code: a clock, the store, the front app, a folder of your packs, and a
// speaker and a voice that record what they were asked to play
function engine(on, opts: { now?: number; front?: string; settings?: object; yours?: boolean; voices?: string[] } = {}) {
  const played: string[] = []
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
  on('fs.read', ($, e) =>
    e.path.endsWith('pack.json')
      ? { value: JSON.stringify({ label: 'my office', failed: ['sigh.wav'], pushed: ['cheer.mp3'] }) }
      : { value: { base64: 'AAAA' } },
  )
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
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/repo' }))
  return { played, spoken, clock }
}

// Lets the unawaited play settle
const settle = () => new Promise((r) => setTimeout(r, 0))

test('aoe by default: a long turn plays a clip, a short one nothing', async ($, on) => {
  const { played } = engine(on)
  await $.turn.complete({ ...LONG, durationMs: 5000 })
  await settle()
  expect(played).toEqual([])
  await $.turn.complete(LONG)
  await settle()
  expect(played.length).toBe(1)
  expect(played[0]).toMatch(/^sounds\/aoe\/.+\.mp3$/)
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
  expect(here.text).toContain('This terminal: protoss (new terminals: aoe)')
  const def = await $.command.run({ command: 'sounds', args: 'default red-alert' })
  expect(def.text).toContain('New terminals: red-alert')
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
  expect(off.text).toContain('Sound: off')
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
