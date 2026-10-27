// orca-quota: one view of every Claude account's usage. Each session saves
// its own account's 5-hour and 7-day reading (Claude Code pushes it with
// session.measure) to ~/.config/orca-strator/quota/<account>.json, so every
// other session, in any account, can show it. A band above the prompt lists
// them all (folded to one button when you want it out of the way), /quota
// prints them, and a toast warns once when this account passes the threshold,
// naming the account in its family with the most room left. It never reads
// login tokens and never switches anything by itself. An account with no
// session running keeps its last reading, so the band dims a reading older
// than an hour and shows its age.

const WINDOWS = [['five_hour', '5h'], ['seven_day', '7d']]
const REFRESH_MS = 20000
const STALE_MS = 3600000 // older readings are dimmed on the band, with their age

let warnAt = 90
let me = null // { id, family }
let accounts = [] // [{ id, configDir, family }] from accounts_file, when set
let dir = null
let cache = { at: 0, rows: [] }
let warned = {} // window kind -> true while over the threshold

const HELP = [
  '/quota: every account with its usage, reset times and how old each reading is',
  '/quota warn <50-99>: warn when this account passes that percent',
  '/quota hide: fold the band to one button',
  '/quota show: open the band again',
]

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'quota', description: "Every Claude account's 5-hour and 7-day usage, with reset times" })
    await setup($)
    if ((await $.store.get('toured')) !== true) {
      await $.store.set('toured', true)
      $.ui.toast('Usage of every account sits above the prompt. ◂ folds it, /quota shows the details and settings.', { timeoutMs: 12000 })
    }
    const usage = await $.session.usage()
    await save($, usage.rateLimits)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await setup($)
      await save($, e.rateLimits)
      await warn($, e.rateLimits)
    }
    return next(e)
  })

  on('command.run', { command: 'quota' }, async ($, e) => {
    await setup($)
    const [word, value] = String(e.args || '').trim().toLowerCase().split(/\s+/)
    if (word === 'warn') {
      const n = Number.parseInt(value, 10)
      if (!(n >= 50 && n <= 99)) return { text: 'Give a whole number from 50 to 99, e.g. /quota warn 85. Now: ' + warnAt + '%.' }
      if (n === warnAt) return { text: 'Already warning at ' + n + '%.' }
      warnAt = n
      warned = {}
      await $.store.set('warn', n)
      return { text: 'Warning changed: this account now warns at ' + n + '%.' }
    }
    if (word === 'hide' || word === 'show') {
      const fold = word === 'hide'
      if (((await $.store.get('folded')) === true) === fold) return { text: 'The band is already ' + (fold ? 'folded.' : 'open.') }
      await $.store.set('folded', fold)
      return { text: fold ? 'Band folded. /quota show opens it.' : 'Band open.' }
    }
    if (word) return { text: 'Unknown: ' + word + '\n' + HELP.join('\n') }
    const rows = await load($, true)
    if (!rows.length) return { text: 'No usage readings yet. Each account gets one after its first reply in a session.\n\n' + HELP.join('\n') }
    const now = await $.clock.now()
    const lines = rows.map(r => {
      const parts = WINDOWS.map(([kind, label]) => label + ' ' + pct(r, kind, now) + resetText(r, kind, now))
      return (r.id === me.id ? '* ' : '  ') + pad(r.id, 10) + parts.join('   ') + '   (' + ago(now - r.readAt) + ')'
    })
    return { text: 'Usage by account (* = this session), warns at ' + warnAt + '%\n' + lines.join('\n') + '\n\n' + HELP.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    await setup($)
    const rows = await load($, false)
    if (!rows.length) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const folded = (await $.store.get('folded')) === true
    if (folded) {
      return <Box><Button key="open" label="quota ▸" onPress={() => $.store.set('folded', false)} /></Box>
    }
    const now = await $.clock.now()
    return (
      <Box>
        <Button key="fold" label="◂" onPress={() => $.store.set('folded', true)} />
        <Text dimColor> quota </Text>
        {rows.map(r => (
          <Text key={r.id} color={hot(r, now) ? 'red' : undefined} bold={r.id === me.id} dimColor={stale(r, now)}>
            {r.id} {WINDOWS.map(([kind, label]) => label + ' ' + pct(r, kind, now)).join(' ')}
            {stale(r, now) ? ' (' + short(now - r.readAt) + ')' : ''}{'   '}
          </Text>
        ))}
      </Box>
    )
  })
}

async function setup($) {
  if (me) return
  const n = await $.store.get('warn')
  if (typeof n === 'number' && n >= 50 && n <= 99) warnAt = n
  const home = (await $.env.get('HOME')) || ''
  const cfg = clean((await $.env.get('CLAUDE_CONFIG_DIR')) || home + '/.claude', home)
  dir = home + '/.config/orca-strator/quota'
  accounts = await readAccounts($, home)
  const known = accounts.find(a => a.configDir === cfg)
  const base = cfg.split('/').pop() || ''
  const id = known ? known.id : base === '.claude' ? 'default' : base.replace(/^\.claude-/, '') || 'default'
  me = { id, family: known ? known.family : id }
}

// accounts_file in ~/.config/orca-strator/config.yaml, the same file orca-peers reads
async function readAccounts($, home) {
  try {
    const yaml = await $.fs.read(home + '/.config/orca-strator/config.yaml')
    const m = yaml.match(/^\s*accounts_file\s*:\s*(.+?)\s*$/m)
    if (!m) return []
    const data = JSON.parse(await $.fs.read(clean(m[1].replace(/^['"]|['"]$/g, ''), home)))
    return Object.entries(data.accounts || {}).map(([id, a]) => ({
      id,
      configDir: clean(a.configDir || '', home),
      family: a.twinOf || id,
    }))
  } catch {
    return []
  }
}

async function save($, rateLimits) {
  const windows = {}
  for (const w of rateLimits || []) {
    if (WINDOWS.some(([kind]) => kind === w.kind)) windows[w.kind] = { percent: w.percentUsed, resetsAt: w.resetsAt || null }
  }
  if (!Object.keys(windows).length) return
  const row = { id: me.id, family: me.family, windows, readAt: await $.clock.now() }
  await $.fs.write(dir + '/' + me.id + '.json', JSON.stringify(row, null, 2) + '\n')
  cache.at = 0
}

async function load($, fresh) {
  const now = await $.clock.now()
  if (!fresh && now - cache.at < REFRESH_MS) return cache.rows
  const rows = []
  try {
    for (const f of await $.fs.list(dir)) {
      if (f.kind !== 'file' || !f.name.endsWith('.json')) continue
      try {
        const r = JSON.parse(await $.fs.read(dir + '/' + f.name))
        if (r && r.id && r.windows) rows.push(r)
      } catch {}
    }
  } catch {}
  rows.sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.id.localeCompare(b.id)))
  cache = { at: now, rows }
  return rows
}

// Once per window each time it crosses the threshold; quiet again once it drops back
async function warn($, rateLimits) {
  for (const w of rateLimits || []) {
    const label = (WINDOWS.find(([kind]) => kind === w.kind) || [])[1]
    if (!label) continue
    if (w.percentUsed < warnAt) { warned[w.kind] = false; continue }
    if (warned[w.kind]) continue
    warned[w.kind] = true
    const now = await $.clock.now()
    const others = (await load($, true)).filter(r => r.id !== me.id && r.family === me.family)
    const best = others.map(r => ({ r, used: Math.max(...WINDOWS.map(([k]) => live(r, k, now) ?? 0)) }))
      .sort((a, b) => a.used - b.used)[0]
    const tip = best ? ' ' + best.r.id + ' is at ' + Math.round(best.used) + '%.' : ''
    $.ui.toast(me.id + ' is at ' + Math.round(w.percentUsed) + '% of its ' + label + ' limit.' + tip, { timeoutMs: 12000 })
  }
}

function live(r, kind, now) {
  const w = r.windows[kind]
  if (!w) return null
  if (w.resetsAt && Date.parse(w.resetsAt) <= now) return 0
  return w.percent
}

function pct(r, kind, now) {
  const v = live(r, kind, now)
  return v === null ? '·' : Math.round(v) + '%'
}

function hot(r, now) {
  return WINDOWS.some(([kind]) => (live(r, kind, now) ?? 0) >= warnAt)
}

// This session's own reading is current even when old: nothing used the account since
function stale(r, now) {
  return r.id !== me.id && now - r.readAt > STALE_MS
}

function short(ms) {
  const h = Math.floor(ms / 3600000)
  return h < 48 ? h + 'h' : Math.round(h / 24) + 'd'
}

function resetText(r, kind, now) {
  const w = r.windows[kind]
  if (!w || !w.resetsAt) return ''
  const ms = Date.parse(w.resetsAt) - now
  return ms <= 0 ? ' (reset)' : ' (resets in ' + span(ms) + ')'
}

function ago(ms) {
  return ms < 60000 ? 'just now' : span(ms) + ' ago'
}

function span(ms) {
  const m = Math.round(ms / 60000)
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  return h < 48 ? h + 'h ' + (m % 60) + 'm' : Math.round(h / 24) + 'd'
}

function pad(s, n) {
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length)
}

function clean(p, home) {
  return p.replace(/^~(?=\/|$)/, home).replace(/\/+$/, '')
}
