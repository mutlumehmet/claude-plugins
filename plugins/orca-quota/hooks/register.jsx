// orca-quota: one view of every Claude account's usage. Each session saves
// its own account's 5-hour and 7-day reading (Claude Code pushes it with
// session.measure) to ~/.config/orca-strator/quota/<account>.json, so every
// other session, in any account, can show it. A band above the prompt lists
// them all (folded to one button when you want it out of the way), /quota
// prints them, and a toast warns once when this account passes the threshold,
// naming the account in its family with the most room left. It never reads
// login tokens. It moves a session only when you turned that on with
// /quota auto on: then, at the warning level, the first session of the account to
// get there runs orca-move's move-all for every session of the account (itself last), so
// none of them reaches the hard limit; without move-all it runs /orca-move:switch for this
// session only. The twin with most room is the target. An account with no
// session running keeps its last reading, so the band dims a reading older
// than an hour and shows its age. Each window on the band carries its time to
// reset (↻40m), from the reset time saved with the reading. Auto refresh (on by
// default, /quota refresh off): every 15 minutes a session looks for another account
// on this machine whose reading is over an hour old and runs one tiny headless prompt
// in it (claude -p on Haiku, that account's config dir), so its own copy of this mod
// saves a fresh reading. A claim file keeps two sessions from refreshing the same account.

const WINDOWS = [['five_hour', '5h'], ['seven_day', '7d']]
const REFRESH_MS = 20000
const STALE_MS = 3600000 // older readings are dimmed on the band, with their age

let warnAt = 85
let me = null // { id, family }
let accounts = [] // [{ id, configDir, family }] from accounts_file, when set
let dir = null
let cache = { at: 0, rows: [] }
let warned = {} // window kind -> true while over the threshold
let auto = false // /quota auto on: move this session by itself at the warning level
let moving = false // one automatic move per session
const MOVE = 'orca-move:switch'
let refresh = true // /quota refresh off: never run a prompt in another account
let child = false // this session is itself a refresh run: it never starts another
let refreshing = false
let home = ''
const REFRESH_EVERY_MS = 15 * 60000
const REFRESH_FIRST_MS = 60000
const CHILD_ENV = 'ORCA_QUOTA_REFRESH'
const PING = ['claude', '-p', 'Reply with the single word: ok', '--model', 'haiku']

const HELP = [
  '/quota: every account with its usage, reset times and how old each reading is',
  '/quota warn <50-99>: warn when this account passes that percent',
  '/quota hide: fold the band to one button',
  '/quota show: open the band again',
  '/quota auto on: at the warning level, move every session of this account to the twin with most room (needs orca-move)',
  '/quota auto off: only warn (the default)',
  '/quota refresh on: refresh accounts idle for over an hour on this machine, one tiny prompt each (the default)',
  '/quota refresh off: never run anything in another account',
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
    if (!child) {
      $.clock.after(REFRESH_FIRST_MS, () => { void refreshIdle($) })
      $.clock.every(REFRESH_EVERY_MS, () => { void refreshIdle($) })
    }
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
    if (word === 'auto') {
      if (value !== 'on' && value !== 'off') return { text: 'Use /quota auto on or /quota auto off. Now: ' + (auto ? 'on' : 'off') + '.' }
      const want = value === 'on'
      if (want === auto) return { text: 'Auto move is already ' + value + '.' }
      auto = want
      await $.store.set('auto', want)
      return { text: want ? 'Auto move on: at ' + warnAt + '% every session of this account moves to the twin with most room.' : 'Auto move off: it only warns.' }
    }
    if (word === 'refresh') {
      if (value !== 'on' && value !== 'off') return { text: 'Use /quota refresh on or /quota refresh off. Now: ' + (refresh ? 'on' : 'off') + '.' }
      const want = value === 'on'
      if (want === refresh) return { text: 'Auto refresh is already ' + value + '.' }
      refresh = want
      await $.store.set('refresh', want)
      return { text: want ? 'Auto refresh on: an account idle for over an hour gets one tiny prompt to read its usage.' : 'Auto refresh off: idle accounts keep their last reading.' }
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
      return (r.id === me.id ? '* ' : '  ') + pad(r.id, 10) + parts.join('   ') + '   (' + (r.readAt === null ? 'no reading yet' : ago(now - r.readAt)) + ')'
    })
    return { text: 'Usage by account (* = this session), warns at ' + warnAt + '%, auto move ' + (auto ? 'on' : 'off') + ', auto refresh ' + (refresh ? 'on' : 'off') + '\n' + lines.join('\n') + '\n\n' + HELP.join('\n') }
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
        {rows.flatMap((r, i) => [
          // A dim bar between accounts, two spaces between one account's windows
          ...(i ? [<Text key={'bar-' + r.id} dimColor>{' │ '}</Text>] : []),
          <Text key={r.id} color={hot(r, now) ? 'red' : undefined} bold={r.id === me.id} dimColor={stale(r, now)}>
            {r.id} {WINDOWS.map(([kind, label]) => label + ' ' + pct(r, kind, now) + countdown(r, kind, now)).join('  ')}
            {r.readAt === null ? ' (never)' : stale(r, now) ? ' (' + short(now - r.readAt) + ')' : ''}
          </Text>,
        ])}
      </Box>
    )
  })
}

async function setup($) {
  if (me) return
  home = (await $.env.get('HOME')) || ''
  child = Boolean(await $.env.get('ORCA_QUOTA_REFRESH'))
  // Defaults for every account from the shared config (the /orca setup screen writes them);
  // /quota warn and /quota auto in an account override them for that account
  const shared = await readSettings($, home)
  const n = await $.store.get('warn')
  if (typeof n === 'number' && n >= 50 && n <= 99) warnAt = n
  else if (shared.warn >= 50 && shared.warn <= 99) warnAt = shared.warn
  const a = await $.store.get('auto')
  auto = typeof a === 'boolean' ? a : shared.auto === true
  const f = await $.store.get('refresh')
  refresh = typeof f === 'boolean' ? f : shared.refresh !== false
  const cfg = clean((await $.env.get('CLAUDE_CONFIG_DIR')) || home + '/.claude', home)
  dir = home + '/.config/orca-strator/quota'
  accounts = await readAccounts($, home)
  const known = accounts.find(a => a.configDir === cfg)
  const base = cfg.split('/').pop() || ''
  const id = known ? known.id : base === '.claude' ? 'default' : base.replace(/^\.claude-/, '') || 'default'
  me = { id, family: known ? known.family : id }
}

async function readSettings($, home) {
  try {
    const yaml = await $.fs.read(home + '/.config/orca-strator/config.yaml')
    const auto = yaml.match(/^\s*auto_move\s*:\s*(true|false)\s*$/m)
    const warn = yaml.match(/^\s*warn_percent\s*:\s*(\d+)\s*$/m)
    const refresh = yaml.match(/^\s*auto_refresh\s*:\s*(true|false)\s*$/m)
    return { auto: auto ? auto[1] === 'true' : undefined, warn: warn ? Number(warn[1]) : undefined, refresh: refresh ? refresh[1] === 'true' : undefined }
  } catch {
    return {}
  }
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
  // A registered account nobody has opened a session in yet still gets a place on the band,
  // so a missing seat is seen, not mistaken for one that does not exist
  for (const a of accounts) {
    if (!rows.some(r => r.id === a.id)) rows.push({ id: a.id, family: a.family, windows: {}, readAt: null })
  }
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
    if (auto && best && best.used < warnAt && !moving) {
      moving = true
      $.ui.toast(me.id + ' is at ' + Math.round(w.percentUsed) + '% of its ' + label + ' limit. Moving this session to ' + best.r.id + ' (' + Math.round(best.used) + '%).', { timeoutMs: 12000 })
      // Outside the hook: a command the turn would wait on is refused, and orca-move runs once the session is idle
      $.clock.after(1000, () => { void moveTo($, best.r.id) })
      continue
    }
    $.ui.toast(me.id + ' is at ' + Math.round(w.percentUsed) + '% of its ' + label + ' limit.' + tip, { timeoutMs: 12000 })
  }
}

// One pass: each other account whose reading is over an hour old, and that no other
// session claimed in the last hour, gets one headless prompt in its own config dir.
// That run's copy of this mod saves the reading; the env marks it so it starts no runs itself.
async function refreshIdle($) {
  if (child || refreshing) return
  refreshing = true
  try {
    // /quota refresh off in another session of this account counts here too
    const s = await $.store.get('refresh')
    if (typeof s === 'boolean') refresh = s
    if (!refresh) return
    const now = await $.clock.now()
    const idle = (await load($, true)).filter(r => r.id !== me.id && r.readAt !== null && now - r.readAt > STALE_MS)
    for (const r of idle) {
      if (!(await claim($, r.id, now))) continue
      const known = accounts.find(a => a.id === r.id)
      const cfg = known ? known.configDir : r.id === 'default' ? home + '/.claude' : home + '/.claude-' + r.id
      // ~/.claude is the account with the variable unset, as Claude Code itself reads it
      const plain = cfg === home + '/.claude'
      const argv = plain ? ['/usr/bin/env', '-u', 'CLAUDE_CONFIG_DIR', ...PING] : PING
      const env = plain ? { [CHILD_ENV]: '1' } : { [CHILD_ENV]: '1', CLAUDE_CONFIG_DIR: cfg }
      try {
        const ran = await $.process.run(argv, { cwd: dir, env, timeoutMs: 120000 })
        if (ran.exitCode !== 0) $.ui.log('orca-quota: refresh of ' + r.id + ' exited ' + ran.exitCode, { to: 'debug' })
      } catch {
        $.ui.log('orca-quota: could not run claude to refresh ' + r.id, { to: 'debug' })
      }
    }
    cache.at = 0
  } finally {
    refreshing = false
  }
}

// A claim file per account: the session whose claim is on file owns that account's refresh for an hour
async function claim($, id, now) {
  return claimFile($, dir + '/refresh/' + id + '.json', now)
}

async function claimFile($, path, now) {
  try {
    const c = JSON.parse(await $.fs.read(path))
    if (c && now - c.at < STALE_MS) return false
  } catch {}
  const by = me.id + ':' + Math.random().toString(36).slice(2)
  await $.fs.write(path, JSON.stringify({ at: now, by }) + '\n')
  try {
    return JSON.parse(await $.fs.read(path)).by === by
  } catch {
    return false
  }
}

// Moves the whole account in one go when orca-move has said where its move.py lives: every session
// of this account reaches the warning level at about the same time, so the first one to claim the
// account runs `move.py move-all` for all of them (itself last) and the others leave it to that run.
// Without that file it falls back to moving just this session with /orca-move:switch.
async function moveTo($, target) {
  if (await moveAll($, target)) return
  try {
    const known = (await $.command.list()).some(c => c.name === MOVE)
    if (!known) throw new Error('missing')
    await $.command.run({ command: MOVE, args: target })
  } catch {
    moving = false
    $.ui.toast('Auto move needs the orca-move plugin in this session. Install orca-move, or run /orca-move:switch ' + target + ' yourself.', { timeoutMs: 15000 })
  }
}

async function moveAll($, target) {
  const moves = home + '/.config/orca-strator/moves'
  let script = ''
  try {
    script = String(await $.fs.read(moves + '/move-py')).trim()
  } catch {
    return false
  }
  if (!script.endsWith('move.py')) return false
  const now = await $.clock.now()
  if (!(await claimFile($, moves + '/move-all-' + me.id + '.json', now))) {
    $.ui.toast('Another session of ' + me.id + ' is already moving every session to the twin with room.', { timeoutMs: 12000 })
    return true
  }
  $.ui.toast('Moving every session of ' + me.id + ' to ' + target + ' (this one last).', { timeoutMs: 12000 })
  try {
    const ran = await $.process.run(['python3', '-I', script, 'move-all', target, '--account', me.id, '--wait', '60'],
      { cwd: moves, timeoutMs: 600000 })
    if (ran.exitCode !== 0) {
      $.ui.log('orca-quota: move-all exited ' + ran.exitCode + ': ' + ran.stdout + ran.stderr, { to: 'debug' })
      return false
    }
    $.ui.log('orca-quota: ' + ran.stdout, { to: 'debug' })
    return true
  } catch (err) {
    $.ui.log('orca-quota: could not run move-all: ' + err, { to: 'debug' })
    return false
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
  return r.id !== me.id && (r.readAt === null || now - r.readAt > STALE_MS)
}

function short(ms) {
  const h = Math.floor(ms / 3600000)
  return h < 48 ? h + 'h' : Math.round(h / 24) + 'd'
}

// The band's short time to reset: ↻40m, ↻1h50m, ↻14h, ↻3d. Nothing once the window has reset
// (it reads 0% then) or when Claude Code gave no reset time
function countdown(r, kind, now) {
  const w = r.windows[kind]
  if (!w || !w.resetsAt) return ''
  const m = Math.ceil((Date.parse(w.resetsAt) - now) / 60000)
  if (m <= 0) return ''
  if (m < 60) return ' ↻' + m + 'm'
  const h = Math.floor(m / 60)
  if (h < 10) return ' ↻' + h + 'h' + (m % 60 ? (m % 60) + 'm' : '')
  return h < 48 ? ' ↻' + h + 'h' : ' ↻' + Math.round(h / 24) + 'd'
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
