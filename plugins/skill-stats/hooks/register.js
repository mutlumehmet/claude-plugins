// skill-stats: how often each skill runs, which never trigger, and a one key
// hand off to skill-creator for a weak description.
//
// Two sources of use, kept apart:
// - history: Skill tool calls and /name commands found in the transcripts of the
//   config dirs the config_dirs setting names (default: this account's), under
//   <dir>/projects/**/*.jsonl. Covers the past, but Claude Code deletes
//   transcripts after cleanupPeriodDays.
// "Your" skills are the ones from a skills folder, plus the plugin skills from the
// marketplaces the own_marketplaces setting names.
// - live: every skill.prompt event from now on, kept in $.store, which is per
//   account and survives transcript cleanup.

// Settings, read once in register
let configDirs = []
let ownMarketplaces = []
let sourceDirs = []
function list(v) {
  return String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
}
// GREP is the same pattern for grep -E, which has no \/ escape
const GREP = '"name":"Skill","input":\\{"skill":"[^"]+"|<command-name>/[^<]+</command-name>'
const USE = /"name":"Skill","input":\{"skill":"([^"]+)"|<command-name>\/([^<\s]+)<\/command-name>/
const NOT_MINE = ['plugin', 'built-in', 'mcp']
// A listing entry this small carries the name and no description. Measured on
// 2.1.289: entries with a description are 47 tokens and up, bare ones 4 to 13.
const NAME_ONLY_TOKENS = 20

export function register(on, options) {
  configDirs = list(options?.config_dirs)
  ownMarketplaces = list(options?.own_marketplaces)
  sourceDirs = list(options?.source_dirs)
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skill-stats',
      description: 'Skill use counts and the skills that never trigger (add "all" for plugin skills)',
    })
    await $.command.register({
      name: 'skill-fix',
      description: 'Put a skill-creator request for one skill\'s description in the prompt box',
      argumentHint: '<skill>',
    })
    return next(e)
  })

  // Live count: fires for /name, the Skill tool, and skills preloaded into a subagent
  on('skill.prompt', async ($, e, next) => {
    const live = { ...((await $.store.get('live')) ?? {}) }
    const prev = live[e.skill] ?? { n: 0, last: 0 }
    live[e.skill] = { n: prev.n + 1, last: await $.clock.now() }
    await $.store.set('live', live)
    return next(e)
  })

  on('command.run', { command: 'skill-stats' }, async ($, e) => {
    const all = e.args.trim() === 'all'
    const rows = await collect($, all)
    return { text: render(rows.list, rows.listing, all) }
  })

  on('command.run', { command: 'skill-fix' }, async ($, e) => {
    const name = e.args.trim()
    if (!name) return { text: 'Usage: /skill-fix <skill>. /skill-stats lists the candidates.' }
    const rows = await collect($, true)
    const row = rows.list.find((r) => r.name === name || r.key === name)
    if (!row) return { text: 'No skill named ' + name + ' in this session.' }
    const source = await findSource($, row.name)
    const filled = await $.prompt.fill({ text: fixPrompt(row, rows.listing, source) })
    return { text: filled.isFilled ? 'The skill-creator request is in the prompt box. Read it, then press Enter.' : fixPrompt(row, rows.listing, source) }
  })
}

// Every skill this session has, with its history and live counts
async function collect($, all) {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const skills = usage.context.breakdown?.skills
  const listing = skills
    ? { total: skills.totalSkills, included: skills.includedSkills, tokens: skills.tokens }
    : null
  const listed = skills?.skillFrontmatter ?? []

  const history = await scanHistory($)
  const live = (await $.store.get('live')) ?? {}
  const marketplaceOf = await pluginMarketplaces($)
  const mine = (s) => !NOT_MINE.includes(s.source) ||
    (s.source === 'plugin' && ownMarketplaces.includes(marketplaceOf.get(s.pluginName) ?? ''))

  const rows = listed
    .filter((s) => all || mine(s))
    .map((s) => {
      // A plugin skill is called as plugin:name, a user skill by its bare name
      const key = s.pluginName && !s.name.includes(':') ? s.pluginName + ':' + s.name : s.name
      // Synced claude.ai skills are called with a prefix (anthropic-skills:pdf), so add up every key ending in :name too
      const past = sum(history, key, s.name)
      const l = sum(new Map(Object.entries(live)), key, s.name)
      return { name: s.name, key, source: s.source, tokens: s.tokens, nameOnly: s.tokens < NAME_ONLY_TOKENS, uses: past.n, liveUses: l.n, last: Math.max(past.last, l.last) }
    })
    .sort((a, b) => b.uses + b.liveUses - (a.uses + a.liveUses) || a.name.localeCompare(b.name))
  return { list: rows, listing }
}

// skill name -> { n, last }, last being the newest transcript file it appears in
async function scanHistory($) {
  const home = await $.env.get('HOME')
  const own = (await $.env.get('CLAUDE_CONFIG_DIR')) || home + '/.claude'
  const dirs = (configDirs.length ? configDirs : [own]).map((d) => d.replace(/^~(?=\/|$)/, home).replace(/\/+$/, '') + '/projects')
  const grep = await $.process.run(
    ['grep', '-roE', '--include=*.jsonl', GREP, ...dirs],
    { timeoutMs: 60000 },
  )
  // grep exits 1 when nothing matched, 2 on an error such as a missing dir
  const found = new Map()
  const files = new Set()
  for (const line of grep.stdout.split('\n')) {
    const at = line.indexOf('.jsonl:')
    if (at < 0) continue
    const file = line.slice(0, at + 6)
    const m = USE.exec(line.slice(at + 7))
    if (!m) continue
    const name = m[1] ?? m[2]
    const entry = found.get(name) ?? { n: 0, files: new Set() }
    entry.n += 1
    entry.files.add(file)
    found.set(name, entry)
    files.add(file)
  }

  const mtime = new Map()
  if (files.size) {
    const stat = await $.process.run(['stat', '-f', '%m %N', ...files])
    for (const line of stat.stdout.split('\n')) {
      const sp = line.indexOf(' ')
      if (sp > 0) mtime.set(line.slice(sp + 1), Number(line.slice(0, sp)) * 1000)
    }
  }

  const out = new Map()
  for (const [name, entry] of found) {
    let last = 0
    for (const f of entry.files) last = Math.max(last, mtime.get(f) ?? 0)
    out.set(name, { n: entry.n, last })
  }
  return out
}

function sum(map, key, name) {
  let n = 0, last = 0
  for (const [k, v] of map) {
    if (k === key || k === name || (!name.includes(':') && k.endsWith(':' + name))) {
      n += v.n
      last = Math.max(last, v.last)
    }
  }
  return { n, last }
}

function day(ms) {
  return ms ? new Date(ms).toISOString().slice(0, 10) : 'never'
}

function render(list, listing, all) {
  const lines = []
  if (listing) {
    lines.push('Skill listing: ' + listing.included + ' of ' + listing.total + ' skills fit its budget (' + listing.tokens + ' tokens).')
    if (listing.included < listing.total) {
      lines.push('Skills past the budget are listed without their description, so Claude rarely picks them. Fewer plugin skills helps more than a better description there.')
    }
    lines.push('')
  }
  const width = Math.max(5, ...list.map((r) => r.key.length))
  lines.push('skill'.padEnd(width) + '  history  live  last seen   tokens  listed as  source')
  for (const r of list) {
    lines.push(
      r.key.padEnd(width) + '  ' + String(r.uses).padStart(7) + '  ' + String(r.liveUses).padStart(4) +
      '  ' + day(r.last).padEnd(10) + '  ' + String(r.tokens).padStart(6) + '  ' + (r.nameOnly ? 'name only' : 'full     ') + '  ' + r.source,
    )
  }
  const never = list.filter((r) => r.uses + r.liveUses === 0).map((r) => r.key)
  lines.push('')
  lines.push(never.length ? 'Never triggered (' + never.length + '): ' + never.join(', ') : 'Every listed skill has triggered at least once.')
  const bare = list.filter((r) => r.nameOnly).map((r) => r.key)
  if (bare.length) lines.push('Listed by name only, no description (' + bare.length + '): ' + bare.join(', ') + '. Claude can only match these by name.')
  lines.push('History comes from the transcripts in ' + (configDirs.length ? configDirs.join(', ') : 'this account') + ', which Claude Code deletes after cleanupPeriodDays. Live counts start when this mod loads.')
  if (never.length) lines.push('/skill-fix <skill> puts a skill-creator request for one of them in the prompt box.')
  if (!all) lines.push('/skill-stats all adds plugin and built-in skills.')
  return lines.join('\n')
}

// plugin name -> marketplace, from the enabled plugins in the merged settings
async function pluginMarketplaces($) {
  const out = new Map()
  try {
    const settings = await $.settings.read()
    for (const id of Object.keys(settings?.enabledPlugins ?? {})) {
      const at = id.lastIndexOf('@')
      if (at > 0) out.set(id.slice(0, at), id.slice(at + 1))
    }
  } catch {
    // No settings: only skills from a skills folder count as yours
  }
  return out
}

// The SKILL.md to edit, found under the source_dirs setting (an installed plugin is a cached copy)
async function findSource($, name) {
  if (!sourceDirs.length || !/^[\w.-]+$/.test(name)) return null
  const home = await $.env.get('HOME')
  const roots = sourceDirs.map((d) => d.replace(/^~(?=\/|$)/, home))
  const found = await $.process.run(['find', ...roots, '-path', '*/skills/' + name + '/SKILL.md', '-not', '-path', '*/node_modules/*'])
  return found.stdout.split('\n').find(Boolean) ?? null
}

function fixPrompt(row, listing, source) {
  const facts = [
    'uses in transcripts: ' + row.uses,
    'live uses: ' + row.liveUses,
    'last seen: ' + day(row.last),
    'listing tokens: ' + row.tokens + (row.nameOnly ? ' (listed by name only, the description does not reach Claude; find out why before rewriting it)' : ''),
    'source: ' + row.source,
  ]
  if (listing && listing.included < listing.total) {
    facts.push('the skill listing holds ' + listing.included + ' of ' + listing.total + ' skills, so some are listed without a description')
  }
  return (
    '/anthropic-skills:skill-creator Improve the description of the ' + row.key +
    ' skill so it triggers when it should. ' + facts.join('; ') +
    '. Read its SKILL.md first' +
    (source ? ' (the source to edit is ' + source + '; the installed plugin is a cached copy, so after the edit bump that plugin\'s version and push)' : '') +
    ', propose the new description, and wait for my yes before writing it.'
  )
}
