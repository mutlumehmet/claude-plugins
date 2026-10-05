import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook } from 'claude-code'

import type { DragonMood as Mood, Hoard } from '../../types'
import { DRAGON_WIDTH, EYE, MOUTH, NOSTRIL, PIXEL_ROWS, draw, drawBaby } from './dragon-sprite'
import type { Pose } from './dragon-sprite'
import type { Milestone } from '../milestones'
import { isShown, setShown } from '../shown'
import type { Game } from '../shown'

const ID = 'dragon'
const RASTER = 'dragon'
const ROWS = PIXEL_ROWS / 2
// Room to pace two pixels and for the flame ahead of it.
const COLUMNS = DRAGON_WIDTH + 9
const FPS_MS = 66
// The terminal's own text colour, so the dragon takes on whatever theme is set.
const INK = 0x01000000
const NONE = 0x01000000

const hoard = atom({ plugin: 'arcade', key: 'dragonHoard' } as const, { gold: 0, meals: 0, feats: 0 })
const mood = atom({ plugin: 'arcade', key: 'dragonMood' } as const, 'idle')
const feat = atom({ plugin: 'arcade', key: 'dragonFeat' } as const, '')

// A hidden game stays quiet: its notifications are hidden too.
async function notify($: EngineInterface, text: string) {
  if (!!(await isShown($, ID))) $.ui.toast(text)
}

// The bigger the feat, the bigger the show.
type Show = 'puff' | 'breath' | 'blaze' | 'roar'
const SHOW_FRAMES: Record<Show, number> = { puff: 20, breath: 32, blaze: 48, roar: 72 }


// What the dragon does while a tool runs.
type Work = 'read' | 'search' | 'edit' | 'bash' | 'web' | 'agent'
function workOf(tool: string): Work {
  if (tool === 'Read') return 'read'
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LSP') return 'search'
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'WebFetch' || tool === 'WebSearch' || tool.startsWith('mcp__')) return 'web'
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  return 'bash'
}

type Particle = {
  x: number; y: number; vx: number; vy: number
  age: number; life: number
  // A glyph is drawn in its cell; without one the particle is a pixel.
  ch?: string
  wave?: number
}

// One hatchling per subagent. Its id is the engine's agent id once known.
type Baby = {
  key: string
  id?: string
  description: string
  type: string
  state: 'egg' | 'fly' | 'home' | 'fall'
  since: number
  slot: number
  lastTool: number
  y: number
}
// Where hatchlings fly: ahead of the dragon (top, bottom) and over its tail.
const SLOTS = [
  { x: 28, y: 0 },
  { x: 28, y: 5 },
  { x: 0, y: 0 },
]
const HOME = { x: 18, y: 0 }

const sim = {
  t: 0,
  lastActivity: 0,
  isTurn: false,
  working: [] as { id: string; work: Work }[],
  show: null as null | { kind: Show; until: number },
  sadUntil: -1,
  alertUntil: -1,
  levelUntil: -1,
  level: 1,
  particles: [] as Particle[],
  dx: 0,
  dy: 0,
  requestId: null as string | null,
  isBlitting: false,
  mood: 'idle' as Mood,
  babies: [] as Baby[],
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!
const levelOf = (gold: number) => Math.floor(Math.sqrt(gold / 10)) + 1
const every = (n: number) => sim.t % n === 0
const cycle = <T,>(frames: T[], n: number) => frames[Math.floor(sim.t / n) % frames.length]!

type Activity = Show | 'sad' | 'alert' | Work | 'think' | 'sleep' | 'idle'
function activity(): Activity {
  const { t } = sim
  if (sim.show && t < sim.show.until) return sim.show.kind
  if (t < sim.sadUntil) return 'sad'
  if (t < sim.alertUntil) return 'alert'
  const last = sim.working[sim.working.length - 1]
  if (last) return last.work
  if (sim.isTurn) return 'think'
  if (t - sim.lastActivity > (120 * 1000) / FPS_MS) return 'sleep'
  return 'idle'
}

function moodOf(a: Activity): Mood {
  if (a === 'puff' || a === 'breath' || a === 'blaze' || a === 'roar') return 'fire'
  if (a === 'sad' || a === 'sleep' || a === 'idle') return a
  return 'work'
}

// One line under the dragon: ◆ gold, ★ wins (commits, pushes, passing tests, PRs), ⚒ every tool Claude ran.
const statsLine = (stash: Hoard) => `Lv ${levelOf(stash.gold)}  ◆ ${stash.gold}  ★ ${stash.feats}  ⚒ ${stash.meals}`

// Centred under the dragon's body, not the whole canvas (the flame room sits to its right).
const centred = (text: string) => ' '.repeat(Math.max(0, Math.floor((DRAGON_WIDTH - text.length) / 2))) + text

const showLeft = () => (sim.show ? sim.show.until - sim.t : 0)

// Each state has its own body language, so they read apart at a glance.
function pose(a: Activity): Pose {
  const isBlink = sim.t % 55 < 2
  const fast = ['up', 'mid', 'down', 'mid']
  switch (a) {
    case 'sleep':
      return { body: cycle(['still', 'breathe'], 20), wing: 'down', head: 'doze', tail: 'flat', legs: 'stand' }
    case 'sad':
      return { body: 'still', wing: 'down', head: 'droop', tail: 'flat', legs: 'stand' }
    case 'alert':
      return { body: 'still', wing: sim.alertUntil - sim.t > 8 ? 'up' : 'mid', head: 'look', tail: 'high', legs: lift(a) < 0 ? 'tuck' : 'stand' }
    case 'think':
      return { body: cycle(['still', 'breathe'], 12), wing: 'down', head: isBlink ? 'blink' : 'up', tail: cycle(['low', 'high'], 12), legs: 'stand' }
    case 'read':
      // Head bent down over the page.
      return { body: 'still', wing: 'down', head: isBlink ? 'doze' : 'droop', tail: 'low', legs: 'stand' }
    case 'search':
      // Looks up and ahead, up and ahead.
      return { body: 'still', wing: 'mid', head: cycle(['look', 'up'], 5), tail: cycle(['low', 'high'], 5), legs: 'stand' }
    case 'edit':
      // Paces about.
      return { body: 'still', wing: 'down', head: 'look', tail: cycle(['low', 'high'], 3), legs: cycle(['stepA', 'stand', 'stepB', 'stand'], 2) }
    case 'bash':
      return { body: 'still', wing: cycle(['up', 'down'], 2), head: cycle(['look', 'blink'], 6), tail: cycle(['low', 'high'], 2), legs: 'stand' }
    case 'web':
      // Flies: wings beat in time with the rise and fall.
      return { body: 'still', wing: cycle(fast, 2), head: 'look', tail: 'flat', legs: 'tuck' }
    case 'agent':
      return { body: 'still', wing: 'mid', head: 'droop', tail: 'low', legs: 'stand' }
    case 'idle': {
      // Wings folded; every eight seconds or so a slow stretch.
      const isStretch = sim.t % 120 < 14
      return {
        body: cycle(['still', 'breathe'], 25),
        wing: isStretch ? cycle(['mid', 'up'], 7) : 'down',
        head: isBlink ? 'blink' : 'look',
        tail: cycle(['low', 'high'], 18),
        legs: 'stand',
      }
    }
    default:
      return {
        body: 'still',
        wing: cycle(a === 'puff' ? ['up', 'mid'] : fast, a === 'roar' ? 2 : 3),
        head: a !== 'puff' || showLeft() > 12 ? 'open' : 'look',
        tail: 'high',
        legs: a === 'roar' ? cycle(['stepA', 'stepB'], 3) : 'stand',
      }
  }
}

// Off the ground: a hop arc when a message comes in, flight on the web, a stomp in a roar.
function lift(a: Activity): number {
  if (a === 'alert') {
    const left = sim.alertUntil - sim.t
    return left > 12 ? -1 : left > 6 ? -2 : left > 4 ? -1 : 0
  }
  if (a === 'web') return cycle([-2, -2, -1, -1], 2)
  if (a === 'roar') return cycle([0, -1], 3)
  return 0
}

// Side to side: pacing while editing, a step to and fro while searching.
function shift(a: Activity): number {
  if (a === 'edit') return cycle([0, 1, 2, 1], 3)
  if (a === 'search') return cycle([0, 1], 6)
  return 0
}

const glyph = (x: number, y: number, ch: string, life: number, vx = 0, vy = 0) =>
  sim.particles.push({ x, y, vx, vy, age: 0, life, ch })
const pixel = (x: number, y: number, vx: number, vy: number, life: number, wave = 0) =>
  sim.particles.push({ x, y, vx, vy, age: 0, life, wave })

function flame(count: number, reach: number) {
  for (let i = 0; i < count; i++) {
    pixel(MOUTH.x + sim.dx, MOUTH.y + sim.dy + rand(0, 1.4), rand(0.8, 1.6), rand(-0.15, 0.25), Math.floor(rand(reach * 0.5, reach)), rand(0, 6))
  }
}

function step(a: Activity) {
  stepBabies()
  sim.dx = shift(a)
  sim.dy = lift(a)
  const top = DRAGON_WIDTH + 1
  switch (a) {
    case 'puff':
      if (showLeft() > 12) flame(1, 3)
      if (every(6)) pixel(NOSTRIL.x, NOSTRIL.y - 1, rand(0.1, 0.3), -0.2, 8)
      if (showLeft() === SHOW_FRAMES.puff - 1) glyph(top, 0, '✓', 18)
      break
    case 'breath':
      flame(2, 7)
      break
    case 'blaze':
      flame(3, 8)
      if (every(3)) glyph(rand(top, COLUMNS), rand(0, PIXEL_ROWS), pick(['*', '+', '✦']), 5)
      break
    case 'roar':
      flame(4, 8)
      if (every(2)) glyph(rand(0, COLUMNS), rand(0, PIXEL_ROWS), pick(['*', '+', '✦', '.']), 6)
      if (every(8)) 'ROAR'.split('').forEach((ch, i) => glyph(top + i, 0, ch, 5))
      break
    case 'sad':
      if (every(10)) pixel(EYE.x, EYE.y + 2, 0, 0.25, 8)
      break
    case 'think':
      // A thought bubble rises from behind the head.
      if (every(8)) {
        const k = Math.floor(sim.t / 8) % 3
        glyph(14 + k * 2, 0, ['.', 'o', 'O'][k]!, 8)
      }
      break
    case 'read':
      // The page under its nose.
      if (every(3)) glyph(top - 1, 8, cycle(['=', '-', '='], 3), 3)
      break
    case 'search':
      if (every(12)) glyph(23 + sim.dx, 0, '?', 12)
      break
    case 'edit':
      if (every(2)) pixel(rand(8, 20) + sim.dx, PIXEL_ROWS - 1, rand(-0.5, 0.5), -0.25, 3)
      break
    case 'bash':
      if (every(9)) pixel(NOSTRIL.x, NOSTRIL.y - 1, 0.25, -0.2, 6)
      break
    case 'web':
      if (every(2)) glyph(rand(0, 6), rand(0, PIXEL_ROWS), '~', 6, -0.5, 0)
      break
    case 'sleep':
      if (every(24)) glyph(top - 3, 1, pick(['z', 'Z']), 30, 0.12, -0.04)
      break
    case 'idle':
      if (every(140)) pixel(NOSTRIL.x + 1, NOSTRIL.y - 1, 0.2, -0.15, 7)
      break
  }
  if (sim.t < sim.levelUntil && every(6)) {
    `LV${sim.level}`.split('').forEach((ch, i) => glyph(top + 3 + i, 1, ch, 6))
    glyph(rand(top, COLUMNS), rand(0, PIXEL_ROWS), '✦', 4)
  }
  for (const p of sim.particles) {
    p.x += p.vx
    p.y += p.vy + (p.wave ? Math.sin((sim.t + p.wave) / 1.5) * 0.25 : 0)
    p.age += 1
  }
  sim.particles = sim.particles.filter(p => p.age < p.life && p.x >= 0 && p.x < COLUMNS && p.y >= 0 && p.y < PIXEL_ROWS)
}

function freeSlot(): number {
  for (let i = 0; i < SLOTS.length; i++) {
    if (!sim.babies.some(b => b.slot === i && b.state !== 'home' && b.state !== 'fall')) return i
  }
  return -1
}

function hatch(key: string, description: string, type: string, id?: string, isNew = true) {
  if (sim.babies.some(b => b.key === key || (id !== undefined && b.id === id))) return
  sim.babies.push({ key, id, description, type, state: isNew ? 'egg' : 'fly', since: sim.t, slot: freeSlot(), lastTool: -100, y: 0 })
}

function stepBabies() {
  for (const b of sim.babies) {
    const age = sim.t - b.since
    if (b.state === 'egg' && age >= 20) {
      b.state = 'fly'
      b.since = sim.t
      glyph(slotOf(b).x + 2, slotOf(b).y + 2, '✦', 4)
    }
    if (b.state === 'fall') b.y += 0.6
  }
  sim.babies = sim.babies.filter(b => {
    if (b.state === 'home' && sim.t - b.since >= 14) {
      glyph(HOME.x, HOME.y, '✦', 6)
      return false
    }
    return !(b.state === 'fall' && b.y > PIXEL_ROWS)
  })
  // A slot freed up: an overflow hatchling takes it.
  for (const b of sim.babies) if (b.slot < 0 && b.state === 'fly') b.slot = freeSlot()
}

const slotOf = (b: Baby) => SLOTS[b.slot] ?? SLOTS[0]!

function drawBabies(ink: Uint8Array, W: number) {
  let hidden = 0
  for (const b of sim.babies) {
    if (b.slot < 0) {
      hidden += 1
      continue
    }
    const at = slotOf(b)
    const age = sim.t - b.since
    if (b.state === 'egg') {
      // An egg on the ground that rocks, then cracks.
      const rock = age > 8 ? cycle([0, 1, 0, -1], 2) : 0
      const ex = at.x + 2 + rock
      const ey = at.y + 1
      ;['.#.', '###', '###'].forEach((row, dy) =>
        [...row].forEach((c, dx) => {
          if (c !== '#' || (age > 15 && dx === 1 && dy === 1)) return
          const x = ex + dx
          const y = ey + dy
          if (x >= 0 && x < W && y >= 0 && y < PIXEL_ROWS) ink[y * W + x] = 1
        }),
      )
      continue
    }
    const isBusy = sim.t - b.lastTool < 15
    const frame = cycle(['up', 'down'] as const, isBusy ? 2 : 4)
    if (b.state === 'home') {
      const k = Math.min(1, age / 14)
      drawBaby(ink, W, at.x + (HOME.x - at.x) * k, at.y + (HOME.y - at.y) * k, frame)
      continue
    }
    if (b.state === 'fall') {
      drawBaby(ink, W, at.x, at.y + b.y, 'down')
      continue
    }
    const bob = cycle(at.y === 0 ? [0, 0, 1, 1] : [0, 0, -1, -1], isBusy ? 2 : 5)
    drawBaby(ink, W, at.x, at.y + bob, frame)
  }
  if (hidden > 0) glyph(W - 2, 8, `+${Math.min(9, hidden)}`.slice(-1), 2)
}

function frame(a: Activity): string {
  const W = COLUMNS
  const ink = new Uint8Array(W * PIXEL_ROWS)
  const over = new Map<number, string>()
  draw(ink, W, pose(a), shift(a), lift(a))
  drawBabies(ink, W)

  for (const p of sim.particles) {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    if (x < 0 || x >= W || y < 0 || y >= PIXEL_ROWS) continue
    if (p.ch) {
      over.set(Math.floor(y / 2) * W + x, p.ch)
      continue
    }
    // Flame thins out at its far end.
    if (p.age / p.life > 0.7 && (x + sim.t) % 2 === 0) continue
    ink[y * W + x] = 1
  }

  // Pack: half blocks in the terminal's own colour, nothing behind them.
  const words = new Uint32Array(W * ROWS * 3)
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = (cy * W + cx) * 3
      const top = ink[cy * 2 * W + cx] === 1
      const bottom = ink[(cy * 2 + 1) * W + cx] === 1
      const ch = over.get(cy * W + cx)
      words[i] = ch ? ch.codePointAt(0)! : top && bottom ? 0x2588 : top ? 0x2580 : bottom ? 0x2584 : 0x20
      words[i + 1] = INK
      words[i + 2] = NONE
    }
  }

  return base64(new Uint8Array(words.buffer))
}

const B64: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

async function celebrate($: EngineInterface, label: string, gold: number, show: Show, isQuiet = false) {
  sim.show = { kind: show, until: sim.t + SHOW_FRAMES[show] }
  sim.lastActivity = sim.t
  const before = levelOf((await read($, hoard)).gold)
  const next = await update($, hoard, old => ({ ...old, gold: old.gold + gold, feats: old.feats + 1 }))
  const after = levelOf(next.gold)
  await update($, feat, () => `${label}: +${gold} gold`)
  await $.store.set('dragon.hoard', next)
  if (after > before) {
    sim.level = after
    sim.levelUntil = sim.show.until + 45
    void notify($, `🔥 ${label}! +${gold} gold. The dragon grows to level ${after}!`)
  } else if (!isQuiet) {
    void notify($, `🔥 ${label}! The dragon hoards +${gold} gold`)
  }
}


// The bigger the moment, the bigger the show: a puff, a breath of fire, a blaze, a roar.
const ROARS = new Set(['merge', 'release', 'deploy', 'streak', 'record', 'squad'])
async function onMilestone($: EngineInterface, tier: string, kind: string, label: string) {
  if (tier === 'small') await celebrate($, label, 1, 'puff', true)
  else if (tier === 'medium') await celebrate($, label, 5, 'breath')
  else if (ROARS.has(kind)) await celebrate($, label, 50, 'roar')
  else await celebrate($, label, 25, 'blaze')
}

// Hands each moment the session's milestones spotted to the game.
export async function celebrateMoments($: EngineInterface, found: Milestone[]) {
  for (const m of found) await onMilestone($, m.tier, m.kind, m.label)
}

// The game's hooks, one per event, which the Arcade's register.tsx chains with the other games'.
export const start: Hook<'session.start'> = async ($, e, next) => {
  const saved = (await $.store.get('dragon.hoard')) as Hoard | undefined
  if (saved) await update($, hoard, () => saved)
  await $.command.register({
    name: 'dragon',
    description: 'The dragon above the prompt: its hoard. "/dragon puff|fire|blaze|roar" to show off, "/dragon hide|show" to put it away or bring it back.',
  })
  $.clock.every(FPS_MS, () => {
    sim.t += 1
    const a = activity()
    const m = moodOf(a)
    if (m !== sim.mood) {
      sim.mood = m
      void update($, mood, () => m)
    }
    const requestId = sim.requestId
    if (requestId === null) return
    step(a)
    if (sim.isBlitting) return
    sim.isBlitting = true
    void $.ui.blit({ requestId, key: RASTER, cells: frame(a) })
      .then(r => {
        if (r.deny !== undefined) sim.requestId = null
      })
      .finally(() => {
        sim.isBlitting = false
      })
  })

  // The engine's roster says when a subagent is done; a hatchling flies home or falls.
  $.clock.every(1000, () => {
    void $.agent.list().then(
      async agents => {
        for (const b of sim.babies) {
          if (b.id === undefined) {
            const match = agents.find(
              a => a.description === b.description && a.type === b.type && !sim.babies.some(o => o.id === a.id),
            )
            if (match) b.id = match.id
          }
        }
        for (const a of agents) {
          const isLive = a.status === 'pending' || a.status === 'running' || a.status === 'waiting'
          // A new subagent: an egg is laid, and hatches.
          if (isLive && !sim.babies.some(b => b.id === a.id)) hatch(`agent:${a.id}`, a.description, a.type, a.id)
        }
        for (const b of sim.babies) {
          if (b.state !== 'egg' && b.state !== 'fly') continue
          const a = agents.find(x => x.id === b.id)
          const isGone = a === undefined && sim.t - b.since > (30 * 1000) / FPS_MS
          if (a?.status === 'completed' || a?.status === 'idle' || isGone) {
            b.state = 'home'
            b.since = sim.t
            const fed = await update($, hoard, old => ({ ...old, gold: old.gold + 2 }))
            await $.store.set('dragon.hoard', fed)
          } else if (a?.status === 'failed' || a?.status === 'killed') {
            b.state = 'fall'
            b.since = sim.t
            b.y = 0
            sim.sadUntil = sim.t + 15
          }
        }
      },
      () => undefined,
    )
  })

  return next(e)
}




export const command: MatchedHook<'command.run', { command: 'dragon' }> = async ($, e) => {
  const arg = (e.args ?? '').trim()
  const practice: Record<string, Show> = { puff: 'puff', fire: 'breath', blaze: 'blaze', roar: 'roar' }
  const show = practice[arg]
  if (show) {
    await celebrate($, 'Practice', 1, show)
    return { text: 'The dragon breathes fire.' }
  }
  // Two explicit commands, not a toggle, so a repeat never flips it back by surprise.
  if (arg === 'hide' || arg === 'show') {
    const wantHidden = arg === 'hide'
    if (!(await isShown($, ID)) === wantHidden) {
      return { text: wantHidden ? 'The dragon is already hidden. "/dragon show" brings it back.' : 'The dragon is already showing.' }
    }
    await setShown($, ID, !wantHidden)
    return { text: wantHidden ? 'The dragon goes to sleep out of sight.' : 'The dragon is back.' }
  }
  const last = await read($, feat)

  return { text: `${statsLine(await read($, hoard))}${last ? `\nLast win: ${last}` : ''}` }
}


export const prompt: Hook<'prompt.submit'> = async ($, e, next) => {
  sim.isTurn = true
  sim.alertUntil = sim.t + 15
  sim.lastActivity = sim.t
  const ran = await next(e)
  return ran
}


export const turn: Hook<'turn.complete'> = async ($, e, next) => {
  sim.isTurn = false
  sim.lastActivity = sim.t
  const ran = await next(e)
  return ran
}


export const tool: Hook<'tool.call'> = async ($, e, next) => {
  // A subagent's tool call makes its hatchling flap; the big dragon stays on the main loop.
  if (e.agentId !== undefined) {
    const baby = sim.babies.find(b => b.id === e.agentId)
    if (baby) baby.lastTool = sim.t
    return next(e)
  }
  const job = { id: e.tool_use_id, work: workOf(String(e.tool)) }
  sim.working.push(job)
  sim.lastActivity = sim.t
  const ran = await next(e).finally(() => {
    sim.working = sim.working.filter(w => w !== job)
    sim.lastActivity = sim.t
  })
  if (ran.deny !== undefined) return ran

  const snack = await update($, hoard, old => ({ ...old, meals: old.meals + 1 }))
  if (snack.meals % 10 === 0) void $.store.set('dragon.hoard', snack)

  if (ran.isError === true) {
    sim.sadUntil = sim.t + 30
    return ran
  }

  return ran
}


// The dragon sits at the right end of the band, beside whatever else is there.
export const render: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  const below = await next(e)
  if (e.surface !== 'terminal' || e.props.hasSurvey || !(await isShown($, ID))) {
    sim.requestId = null
    return below
  }
  const { Box, Raster, Text } = $.ui.resolve(e)
  sim.requestId = e.requestId
  const stash = await read($, hoard)
  sim.level = levelOf(stash.gold)

  return (
    <Box flexDirection="row" alignItems="flex-end">
      <Box flexGrow={1} flexDirection="column">
        {below ?? null}
      </Box>
      <Box flexDirection="column" flexShrink={0} minWidth={COLUMNS}>
        <Raster key={RASTER} columns={COLUMNS} rows={ROWS} cells={frame(activity())} />
        <Text key="stats" dimColor wrap="truncate">
          {centred(statsLine(stash))}
        </Text>
      </Box>
    </Box>
  )
}

export const game: Game = { id: ID, title: 'Dragon Lair' }
