import { expect, mock, test } from 'claude-code/testing'

const T1 = '/home/test/.claude/projects/p/a.jsonl'
const T2 = '/home/test/.claude-work/projects/p/b.jsonl'

// Stubs every call the mod makes: a session with four skills, transcripts
// where two of them were used, and an empty or given live store.
function engine(on, opts: { live?: object; filled?: string[]; saved?: Map<string, unknown> } = {}) {
  mock.env(on, { HOME: '/home/test' })
  on('session.usage', () => ({
    value: {
      context: {
        breakdown: {
          skills: {
            totalSkills: 5, includedSkills: 5, tokens: 600,
            skillFrontmatter: [
              { name: 'save-context', source: 'userSettings', tokens: 289 },
              { name: 'weekly-report', source: 'userSettings', tokens: 5 },
              { name: 'skill-creator', source: 'syncedSkills', tokens: 118 },
              { name: 'vendor-thing', source: 'plugin', pluginName: 'vendor', tokens: 90 },
              { name: 'my-skill', source: 'plugin', pluginName: 'my-tools', tokens: 120 },
            ],
          },
        },
      },
    },
  }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'find') {
      return { value: { exitCode: 0, stderr: '', stdout: '/home/test/src/plugins/plugins/office/skills/weekly-report/SKILL.md\n' } }
    }
    if (e.argv[0] === 'grep') {
      return { value: { exitCode: 0, stderr: '', stdout: [
        T1 + ':"name":"Skill","input":{"skill":"save-context"',
        T2 + ':<command-name>/save-context</command-name>',
        T2 + ':"name":"Skill","input":{"skill":"anthropic-skills:skill-creator"',
        T2 + ':<command-name>/rename</command-name>',
      ].join('\n') } }
    }
    // stat -f '%m %N' files...
    return { value: { exitCode: 0, stderr: '', stdout: '1759536000 ' + T1 + '\n1759622400 ' + T2 + '\n' } }
  })
  const saved = opts.saved ?? new Map<string, unknown>()
  if (opts.live) saved.set('live', opts.live)
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => { saved.set(e.key, e.value); return { value: undefined } })
  on('prompt.fill', ($, e) => { opts.filled?.push(e.text); return { isFilled: true } })
  on('settings.read', () => ({ value: { enabledPlugins: { 'vendor@vendor-market': true, 'my-tools@my-market': true } } }))
  mock.clock(on, { now: 1759700000000 })
}

test('counts history from the config dirs, including prefixed and slash uses', { options: { config_dirs: '~/.claude,~/.claude-work' } }, async ($, on) => {
  engine(on)
  const out = await $.command.run({ command: 'skill-stats', args: '' })
  expect(out.text).toMatch(/save-context\s+2\s+0\s+2025-10-05/)
  expect(out.text).toMatch(/skill-creator\s+1\s+0/)
  expect(out.text).toContain('Never triggered (1): weekly-report')
  expect(out.text).not.toContain('my-tools')
  expect(out.text).not.toContain('vendor')
  expect(out.text).not.toContain('rename')
})

test('flags a skill listed by name only', async ($, on) => {
  engine(on)
  const out = await $.command.run({ command: 'skill-stats', args: '' })
  expect(out.text).toMatch(/weekly-report\s+0\s+0\s+never\s+5\s+name only/)
  expect(out.text).toContain('Listed by name only, no description (1): weekly-report')
})

test('all adds plugin skills under plugin:name', async ($, on) => {
  engine(on)
  const out = await $.command.run({ command: 'skill-stats', args: 'all' })
  expect(out.text).toContain('vendor:vendor-thing')
})

test('live counts come from the store', async ($, on) => {
  engine(on, { live: { 'weekly-report': { n: 3, last: 1759700000000 } } })
  const out = await $.command.run({ command: 'skill-stats', args: '' })
  expect(out.text).toMatch(/weekly-report\s+0\s+3/)
  expect(out.text).toContain('Every listed skill has triggered at least once.')
})

test('a skill prompt adds one to the live count', async ($, on) => {
  const saved = new Map<string, unknown>()
  engine(on, { saved })
  on('skill.prompt', ($, e) => ({ text: e.text }))
  await $.skill.prompt({ skill: 'weekly-report', text: 'body' })
  await $.skill.prompt({ skill: 'weekly-report', text: 'body' })
  expect((saved.get('live') as any)['weekly-report'].n).toBe(2)
})

test('/skill-fix fills a skill-creator request and never sends it', async ($, on) => {
  const filled: string[] = []
  engine(on, { filled })
  const out = await $.command.run({ command: 'skill-fix', args: 'weekly-report' })
  expect(out.text).toContain('press Enter')
  expect(filled[0]).toMatch(/^\/anthropic-skills:skill-creator Improve the description of the weekly-report skill/)
  expect(filled[0]).toContain('listed by name only')
  expect(filled[0]).toContain('wait for my yes')
})

test('/skill-fix with an unknown name says so', async ($, on) => {
  engine(on)
  const out = await $.command.run({ command: 'skill-fix', args: 'nope' })
  expect(out.text).toBe('No skill named nope in this session.')
})

test('plugin skills from your own marketplaces count as yours', { options: { own_marketplaces: 'my-market' } }, async ($, on) => {
  engine(on)
  const out = await $.command.run({ command: 'skill-stats', args: '' })
  expect(out.text).toContain('my-tools:my-skill')
  expect(out.text).not.toContain('vendor')
})

test('/skill-fix names the source to edit when source_dirs finds it', { options: { source_dirs: '~/src/plugins' } }, async ($, on) => {
  const filled: string[] = []
  engine(on, { filled })
  await $.command.run({ command: 'skill-fix', args: 'weekly-report' })
  expect(filled[0]).toContain('the source to edit is /home/test/src/plugins/plugins/office/skills/weekly-report/SKILL.md')
})
