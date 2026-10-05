import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook } from 'claude-code'

import type { OctoMood as Mood, OctoScore as Score } from '../../types'
import { BABY, FLAG, OCTO_HEIGHT, OCTO_WIDTH, PLANE, octopus } from './octo-sprite'
import type { Legs } from './octo-sprite'
import type { Milestone } from '../milestones'
import { isShown } from '../shown'
import type { Game } from '../shown'

const ID = 'octopus'
const RASTER = 'city'
// The strip: eight terminal rows, two pixels to a row.
const ROWS = 8
const PH = ROWS * 2
const FPS_MS = 66
const MIN_COLUMNS = 24
const MAX_COLUMNS = 512

// The terminal's own text colour, so the city takes on whatever theme is set.
const INK = 0x01000000
const NONE = 0x01000000
const EMPTY = 0xffffffff
const OCTO = 0xc04cd8
const BABY_INK = 0xe08ae4
const WINDOW = 0xf2c230
const GREY = 0x8a8a8a
const FIRE = [0xff7a1a, 0xffd23f, 0xe03131]
const SQUIRT = 0x7a3fa0
const AIRCRAFT = 0x4a90d9
const RED = 0xe03131

// Where the octopus stands, hovers and flies (the top of its sprite).
const GROUND_Y = PH - OCTO_HEIGHT
const HOVER_Y = 1
const FLY_Y = 0

const score = atom({ plugin: 'arcade', key: 'octopusScore' } as const, { xp: 0, toppled: 0, planes: 0, tools: 0 })
const mood = atom({ plugin: 'arcade', key: 'octopusMood' } as const, 'idle')
const feat = atom({ plugin: 'arcade', key: 'octopusFeat' } as const, '')

// A hidden game stays quiet: its notifications are hidden too.
async function notify($: EngineInterface, text: string) {
  if (!!(await isShown($, ID))) $.ui.toast(text)
}

// The bigger the moment, the bigger the show.
type Show = 'ink' | 'plane' | 'rampage' | 'conquer'
const SHOW_FRAMES: Record<Show, number> = { ink: 24, plane: 260, rampage: 110, conquer: 150 }

// What the octopus does while a tool runs.
type Work = 'read' | 'search' | 'edit' | 'bash' | 'web' | 'agent'
function workOf(tool: string): Work {
  if (tool === 'Read') return 'read'
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LSP') return 'search'
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'WebFetch' || tool === 'WebSearch' || tool.startsWith('mcp__')) return 'web'
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  return 'bash'
}

type Building = { x: number; w: number; h: number; full: number; seed: number; downAt: number }
type Plane = { x: number; y: number; vx: number; vy: number; state: 'fly' | 'held' | 'fall'; isHunted: boolean; since: number }
type Particle = {
  x: number; y: number; vx: number; vy: number
  age: number; life: number; color: number
  // A glyph is drawn in its cell; without one the particle is a pixel.
  ch?: string
  gravity?: number
}
// One hatchling per subagent. Its id is the engine's agent id once known.
type Baby = { key: string; id?: string; description: string; type: string; state: 'swim' | 'home' | 'fall'; since: number; lastTool: number; y: number }

const sim = {
  t: 0,
  lastActivity: 0,
  isTurn: false,
  working: [] as { id: string; work: Work }[],
  show: null as null | { kind: Show; until: number; isLanded?: boolean },
  sadUntil: -1,
  alertUntil: -1,
  level: 1,
  W: 0,
  requestId: null as string | null,
  isBlitting: false,
  mood: 'idle' as Mood,
  ox: 4,
  oy: HOVER_Y as number,
  face: 1,
  wanderX: 4,
  isMoving: false,
  isSmashing: false,
  city: [] as Building[],
  target: -1,
  planes: [] as Plane[],
  particles: [] as Particle[],
  babies: [] as Baby[],
  banner: null as null | { text: string; color: number; until: number },
  flag: null as null | { x: number; until: number },
  nextAmbient: 300,
  gain: { toppled: 0, planes: 0 },
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!
const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 10)) + 1
const every = (n: number) => sim.t % n === 0
const cycle = <T,>(frames: T[], n: number) => frames[Math.floor(sim.t / n) % frames.length]!
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// ---- The city ----

function buildCity(from: number, to: number): Building[] {
  const out: Building[] = []
  let x = from + Math.floor(rand(1, 4))
  while (x < to - 3) {
    const w = Math.floor(rand(4, 9))
    const full = Math.floor(rand(4, 10))
    out.push({ x, w: Math.min(w, to - x), h: full, full, seed: Math.floor(rand(0, 1e6)), downAt: -1 })
    x += w + Math.floor(rand(1, 4))
  }
  return out
}

// The strip follows the terminal's width: new streets on a wider one, a narrower one drops the far end.
function fitCity(W: number) {
  if (W === sim.W) return
  const old = sim.W
  sim.W = W
  if (W > old) {
    const end = sim.city.reduce((m, b) => Math.max(m, b.x + b.w), 0)
    sim.city.push(...buildCity(end, W))
  } else {
    sim.city = sim.city.filter(b => b.x + b.w <= W)
  }
  sim.target = -1
  sim.ox = clamp(sim.ox, 0, W - OCTO_WIDTH)
  sim.wanderX = clamp(sim.wanderX, 0, W - OCTO_WIDTH)
}

const isStanding = (b: Building) => b.h > 2

function rebuild() {
  const isAllDown = sim.city.every(b => !isStanding(b))
  const wait = isAllDown ? 60 : (45 * 1000) / FPS_MS
  for (let i = 0; i < sim.city.length; i++) {
    const b = sim.city[i]!
    if (b.h >= b.full || i === sim.target || sim.t - b.downAt < wait) continue
    if (every(12)) b.h += 1
  }
}

// ---- Particles and words in the sky ----

const glyph = (x: number, y: number, ch: string, life: number, color: number, vx = 0, vy = 0) =>
  sim.particles.push({ x, y, vx, vy, age: 0, life, color, ch })
const pixel = (x: number, y: number, vx: number, vy: number, life: number, color: number, gravity = 0) =>
  sim.particles.push({ x, y, vx, vy, age: 0, life, color, gravity })
const word = (x: number, y: number, text: string, life: number, color: number) =>
  [...text].forEach((ch, i) => glyph(x + i, y, ch, life, color))

function boom(x: number, y: number, size: number) {
  for (let i = 0; i < size; i++) {
    const a = rand(Math.PI, Math.PI * 2)
    const v = rand(0.4, 1.3)
    pixel(x, y, Math.cos(a) * v * 1.6, Math.sin(a) * v, Math.floor(rand(6, 14)), pick(FIRE), 0.08)
  }
}

function banner(text: string, color: number, frames: number) {
  sim.banner = { text, color, until: sim.t + frames }
}

// ---- What it is doing ----

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
  if (a === 'plane' || a === 'rampage' || a === 'conquer' || a === 'ink') return 'rampage'
  if (a === 'sad' || a === 'sleep' || a === 'idle') return a
  return 'work'
}

// Head for a point; true once there.
function moveTo(tx: number, ty: number, speed: number): boolean {
  tx = clamp(tx, 0, sim.W - OCTO_WIDTH)
  const dx = tx - sim.ox
  const dy = ty - sim.oy
  sim.isMoving = Math.abs(dx) > 0.5
  if (sim.isMoving) {
    sim.face = dx > 0 ? 1 : -1
    sim.ox += Math.sign(dx) * Math.min(speed, Math.abs(dx))
  }
  if (Math.abs(dy) > 0.1) sim.oy += Math.sign(dy) * Math.min(0.5, Math.abs(dy))
  return !sim.isMoving && Math.abs(dy) <= 0.1
}

function wander(speed: number, ty: number) {
  if (every(150)) sim.wanderX = rand(0, sim.W - OCTO_WIDTH)
  moveTo(sim.wanderX, ty, speed)
}

// The closest building still standing.
function nearest(): number {
  let best = -1
  let gap = Infinity
  const centre = sim.ox + OCTO_WIDTH / 2
  sim.city.forEach((b, i) => {
    if (!isStanding(b)) return
    const d = Math.abs(b.x + b.w / 2 - centre)
    if (d < gap) {
      gap = d
      best = i
    }
  })
  return best
}

// Walk up to a building and pound it, a storey every `rate` frames.
function smash(rate: number, speed: number, isBig: boolean) {
  let b = sim.city[sim.target]
  if (!b || !isStanding(b)) {
    sim.target = nearest()
    b = sim.city[sim.target]
  }
  if (!b) {
    wander(speed, GROUND_Y)
    return
  }
  const isRight = b.x + b.w / 2 > sim.ox + OCTO_WIDTH / 2
  const tx = isRight ? b.x - OCTO_WIDTH + 3 : b.x + b.w - 3
  const isThere = moveTo(tx, GROUND_Y, speed)
  if (!isThere) return
  sim.face = isRight ? 1 : -1
  sim.isSmashing = true
  if (sim.t % rate !== 0) return
  const top = PH - b.h
  for (let i = 0; i < (isBig ? 6 : 3); i++) pixel(rand(b.x, b.x + b.w), top, rand(-0.7, 0.7), rand(-0.9, -0.2), 14, GREY, 0.12)
  b.h -= 1
  if (!isStanding(b)) {
    b.h = 1
    b.downAt = sim.t
    sim.gain.toppled += 1
    boom(b.x + b.w / 2, PH - 2, isBig ? 12 : 6)
    word(Math.max(0, Math.round(b.x + b.w / 2 - 3)), PH - 8, 'CRASH!', 10, RED)
    sim.target = -1
  }
}

function launch(isHunted: boolean) {
  const fromLeft = isHunted ? sim.ox > sim.W / 2 : Math.random() < 0.5
  // A hunted plane comes in close, so the catch fits the show.
  const reach = isHunted ? Math.min(70, sim.W) : sim.W
  const x = fromLeft ? Math.max(-PLANE[0]!.length, sim.ox - reach) : Math.min(sim.W, sim.ox + reach)
  sim.planes.push({ x, y: isHunted ? 0 : Math.floor(rand(0, 2)), vx: fromLeft ? 0.9 : -0.9, vy: 0, state: 'fly', isHunted, since: sim.t })
}

function stepPlanes() {
  const pw = PLANE[0]!.length
  for (const p of sim.planes) {
    if (p.state === 'fly') {
      p.x += p.vx
      if (every(4)) pixel(p.vx > 0 ? p.x - 1 : p.x + pw, p.y + 2, 0, 0, 6, GREY)
      // The octopus snatches a hunted plane out of the sky.
      if (p.isHunted && Math.abs(p.x + pw / 2 - (sim.ox + OCTO_WIDTH / 2)) < 4 && sim.oy < 2) {
        p.state = 'held'
        p.since = sim.t
        word(Math.round(sim.ox + OCTO_WIDTH), 0, 'GOTCHA', 10, RED)
      }
    } else if (p.state === 'held') {
      p.x = sim.ox + (OCTO_WIDTH - pw) / 2
      p.y = sim.oy + OCTO_HEIGHT - 2
      if (sim.t - p.since > 12) {
        p.state = 'fall'
        p.vx = sim.face * 1.1
        p.vy = -0.4
      }
    } else {
      p.x += p.vx
      p.vy += 0.07
      p.y += p.vy
      if (every(2)) pixel(p.x + pw / 2, p.y, rand(-0.2, 0.2), -0.2, 10, pick([GREY, ...FIRE]))
      if (p.y >= PH - 4) {
        boom(p.x + pw / 2, PH - 2, 16)
        word(Math.max(0, Math.round(p.x)), PH - 8, 'BOOM!', 12, RED)
        sim.gain.planes += 1
        p.state = 'fly'
        p.x = -1000
        if (sim.show?.kind === 'plane') sim.show.until = Math.min(sim.show.until, sim.t + 25)
      }
    }
  }
  sim.planes = sim.planes.filter(p => p.x > -pw - 2 && p.x < sim.W + 2)
}

const showLeft = () => (sim.show ? sim.show.until - sim.t : 0)
const showAge = () => (sim.show ? SHOW_FRAMES[sim.show.kind] - showLeft() : 0)

function step(a: Activity) {
  sim.isMoving = false
  sim.isSmashing = false
  const head = { x: sim.ox + OCTO_WIDTH / 2, y: sim.oy }
  switch (a) {
    case 'idle':
      wander(0.25, HOVER_Y + cycle([0, 0, 1, 1], 8))
      if (every(140)) pixel(head.x, head.y + 4, 0, -0.2, 8, SQUIRT)
      break
    case 'alert':
      moveTo(sim.ox, GROUND_Y - cycle([2, 3, 2, 0], 3), 0)
      break
    case 'think':
      moveTo(sim.ox, HOVER_Y + cycle([0, 1], 10), 0)
      if (every(8)) {
        const k = Math.floor(sim.t / 8) % 3
        glyph(sim.ox + OCTO_WIDTH + k, Math.max(0, sim.oy - k), ['.', 'o', 'O'][k]!, 8, GREY)
      }
      break
    case 'read':
      // Strolls the streets, peering in at the windows.
      wander(0.3, GROUND_Y)
      break
    case 'search':
      wander(0.6, GROUND_Y)
      if (every(12)) glyph(head.x, Math.max(0, sim.oy - 2), '?', 12, INK)
      break
    case 'edit':
      smash(8, 0.8, false)
      break
    case 'bash':
      smash(5, 1, false)
      break
    case 'web':
      wander(1.2, FLY_Y + cycle([0, 1], 6))
      if (every(2)) glyph(sim.face > 0 ? sim.ox - 1 : sim.ox + OCTO_WIDTH, sim.oy + rand(2, 10), '~', 5, GREY, -sim.face * 0.6, 0)
      break
    case 'agent':
      moveTo(sim.ox, HOVER_Y, 0)
      break
    case 'sad':
      moveTo(sim.ox + cycle([1, -1], 2), GROUND_Y, 1)
      if (every(4)) glyph(head.x + cycle([-3, 0, 3, 0], 4), Math.max(0, sim.oy - 1), '*', 4, WINDOW)
      break
    case 'sleep':
      moveTo(sim.ox, GROUND_Y + 2, 0.2)
      if (every(24)) glyph(sim.ox + OCTO_WIDTH, sim.oy, pick(['z', 'Z']), 30, GREY, 0.12, -0.06)
      break
    case 'ink':
      // A squirt of ink from behind.
      moveTo(sim.ox + sim.face * 0.3, sim.oy, 0.3)
      if (showLeft() > 6) {
        for (let i = 0; i < 2; i++) pixel(sim.face > 0 ? sim.ox : sim.ox + OCTO_WIDTH, sim.oy + rand(8, 12), -sim.face * rand(0.6, 1.4), rand(-0.3, 0.3), 12, SQUIRT)
      }
      break
    case 'plane': {
      if (showAge() === 1) launch(true)
      const hunted = sim.planes.find(p => p.isHunted)
      if (hunted && hunted.state === 'fly') moveTo(hunted.x + PLANE[0]!.length / 2 - OCTO_WIDTH / 2 + hunted.vx * 4, FLY_Y, 1.4)
      else moveTo(sim.ox, HOVER_Y, 0.5)
      break
    }
    case 'rampage':
      smash(2, 1.6, true)
      if (every(3)) glyph(rand(0, sim.W), rand(0, PH - 8), pick(['*', '+', '✦']), 5, pick(FIRE))
      if (showAge() === 1) banner('RAMPAGE!', RED, 40)
      break
    case 'conquer':
      if (showLeft() > 60) {
        smash(2, 1.8, true)
        if (every(3)) glyph(rand(0, sim.W), rand(0, PH - 8), pick(['*', '+', '✦']), 5, pick(FIRE))
      } else {
        moveTo(sim.ox, GROUND_Y - cycle([0, 1], 4), 0)
        if (showLeft() === 60) {
          sim.flag = { x: Math.round(sim.face > 0 ? sim.ox + OCTO_WIDTH + 1 : sim.ox - 5), until: sim.t + 600 }
          banner('THE CITY IS MINE', RED, 60)
          boom(sim.ox + OCTO_WIDTH / 2, PH - 2, 20)
        }
      }
      break
  }
  stepPlanes()
  rebuild()
  stepBabies()
  if (sim.show === null || sim.t >= sim.show.until) {
    if (sim.t >= sim.nextAmbient && sim.planes.length === 0) {
      launch(false)
      sim.nextAmbient = sim.t + rand(600, 1200)
    }
  }
  if (sim.flag && sim.t > sim.flag.until) sim.flag = null
  for (const p of sim.particles) {
    p.x += p.vx
    p.vy += p.gravity ?? 0
    p.y += p.vy
    p.age += 1
  }
  sim.particles = sim.particles.filter(p => p.age < p.life && p.x >= 0 && p.x < sim.W && p.y >= 0 && p.y < PH)
}

// ---- Hatchlings ----

function hatch(key: string, description: string, type: string, id?: string) {
  if (sim.babies.some(b => b.key === key || (id !== undefined && b.id === id))) return
  sim.babies.push({ key, id, description, type, state: 'swim', since: sim.t, lastTool: -100, y: 0 })
  glyph(sim.ox, sim.oy + 6, '✦', 6, BABY_INK)
}

function stepBabies() {
  for (const b of sim.babies) if (b.state === 'fall') b.y += 0.6
  sim.babies = sim.babies.filter(b => {
    if (b.state === 'home' && sim.t - b.since >= 14) return false
    return !(b.state === 'fall' && b.y > PH)
  })
}

// Behind the octopus in a line, like ducklings; one going home swims into it.
function drawBabies(buf: Uint32Array) {
  sim.babies.slice(0, 6).forEach((b, i) => {
    const isBusy = sim.t - b.lastTool < 15
    const frame = BABY[Math.floor(sim.t / (isBusy ? 2 : 5)) % 2]!
    let x = sim.ox + (sim.face > 0 ? -7 * (i + 1) : OCTO_WIDTH + 2 + 7 * i)
    let y = Math.min(PH - 4, sim.oy + 4 + (i % 2) * 3 + cycle([0, 1], isBusy ? 3 : 6))
    if (b.state === 'home') {
      const k = Math.min(1, (sim.t - b.since) / 14)
      x += (sim.ox + OCTO_WIDTH / 2 - x) * k
      y += (sim.oy + 4 - y) * k
    }
    if (b.state === 'fall') y += b.y
    mask(buf, frame, x, y, BABY_INK, sim.face < 0)
  })
}

// ---- Drawing ----

function put(buf: Uint32Array, x: number, y: number, color: number) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || x >= sim.W || y < 0 || y >= PH) return
  buf[y * sim.W + x] = color
}

function mask(buf: Uint32Array, rows: string[], x: number, y: number, color: number, isFlipped = false) {
  rows.forEach((row, dy) => {
    const w = row.length
    for (let dx = 0; dx < w; dx++) {
      if (row[isFlipped ? w - 1 - dx : dx] === '#') put(buf, x + dx, y + dy, color)
    }
  })
}

function legsOf(a: Activity): Legs {
  if (a === 'sleep') return 'curl'
  if (sim.isSmashing) return cycle(['smash', 'stand'], 2)
  if (sim.oy < GROUND_Y - 1) return a === 'idle' || a === 'think' || a === 'agent' ? cycle(['fly', 'stand'], 8) : 'fly'
  if (sim.isMoving) return cycle(['walkA', 'stand', 'walkB', 'stand'], 3)
  return 'stand'
}

function drawCity(buf: Uint32Array) {
  for (const b of sim.city) {
    if (!isStanding(b)) {
      // Rubble: a low, broken line.
      for (let dx = 0; dx < b.w; dx++) {
        put(buf, b.x + dx, PH - 1, GREY)
        if ((b.seed + dx) % 3 === 0) put(buf, b.x + dx, PH - 2, GREY)
      }
      continue
    }
    for (let dy = 0; dy < b.h; dy++) {
      const y = PH - 1 - dy
      for (let dx = 0; dx < b.w; dx++) {
        const isWindow = dx > 0 && dx < b.w - 1 && dx % 2 === 1 && dy % 2 === 1 && dy < b.h - 1
        if (!isWindow) put(buf, b.x + dx, y, INK)
        // Some windows lit, the rest dark.
        else if ((b.seed + dx * 7 + dy * 13) % 3 === 0) put(buf, b.x + dx, y, WINDOW)
      }
    }
  }
}

const statsLine = (s: Score) => `Lv ${levelOf(s.xp)}  ⌂ ${s.toppled}  ✈ ${s.planes}  ⚒ ${s.tools}`

function frame(a: Activity, stats: string): string {
  const W = sim.W
  const buf = new Uint32Array(W * PH).fill(EMPTY)
  const over = new Map<number, { ch: string; color: number }>()
  const text = (x: number, row: number, s: string, color: number) =>
    [...s].forEach((ch, i) => {
      if (x + i >= 0 && x + i < W) over.set(row * W + x + i, { ch, color })
    })

  drawCity(buf)
  if (sim.flag) {
    mask(buf, FLAG.map(r => r.slice(0, 1)), sim.flag.x, PH - 7, INK)
    mask(buf, FLAG.slice(0, 2).map(r => '.' + r.slice(1)), sim.flag.x, PH - 7, RED)
  }
  for (const p of sim.planes) mask(buf, PLANE, p.x, p.y, AIRCRAFT, p.vx < 0)
  drawBabies(buf)
  const isShut = a === 'sleep' || sim.t % 55 < 2
  const shake = a === 'rampage' || a === 'conquer' ? cycle([0, 1], 1) : 0
  mask(buf, octopus(legsOf(a), isShut), sim.ox, sim.oy - shake, OCTO, sim.face < 0)

  for (const p of sim.particles) {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    if (p.ch) text(x, Math.floor(y / 2), p.ch, p.color)
    else put(buf, x, y, p.color)
  }

  // The score at the right end of the top row, a banner in the middle.
  text(W - stats.length - 1, 0, stats, GREY)
  if (sim.banner && sim.t < sim.banner.until && (sim.banner.until - sim.t) % 8 > 1) {
    text(Math.floor((W - sim.banner.text.length) / 2), 1, sim.banner.text, sim.banner.color)
  }

  // Pack half blocks: the top pixel as the glyph's colour, the bottom one behind it when both are set.
  const words = new Uint32Array(W * ROWS * 3)
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = (cy * W + cx) * 3
      const top = buf[cy * 2 * W + cx]!
      const bottom = buf[(cy * 2 + 1) * W + cx]!
      const g = over.get(cy * W + cx)
      if (g) {
        words[i] = g.ch.codePointAt(0)!
        words[i + 1] = g.color
        words[i + 2] = NONE
      } else if (top === EMPTY && bottom === EMPTY) {
        words[i] = 0x20
        words[i + 1] = INK
        words[i + 2] = NONE
      } else if (top === bottom) {
        words[i] = 0x2588
        words[i + 1] = top
        words[i + 2] = NONE
      } else if (bottom === EMPTY) {
        words[i] = 0x2580
        words[i + 1] = top
        words[i + 2] = NONE
      } else if (top === EMPTY) {
        words[i] = 0x2584
        words[i + 1] = bottom
        words[i + 2] = NONE
      } else {
        words[i] = 0x2580
        words[i + 1] = top
        words[i + 2] = bottom
      }
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

// ---- Score ----

let lastStats = statsLine({ xp: 0, toppled: 0, planes: 0, tools: 0 })

async function save($: EngineInterface, change: (s: Score) => Score) {
  const next = await update($, score, change)
  lastStats = statsLine(next)
  await $.store.set('octopus.score', next)
  return next
}

// A smaller moment never cuts a bigger show short: the plane still falls, the city still falls.
const RANK: Record<Show, number> = { ink: 0, plane: 1, rampage: 2, conquer: 3 }

async function celebrate($: EngineInterface, label: string, xp: number, show: Show, isQuiet = false) {
  const running = sim.show && sim.t < sim.show.until ? sim.show.kind : null
  if (running === null || RANK[show] >= RANK[running]) sim.show = { kind: show, until: sim.t + SHOW_FRAMES[show] }
  sim.lastActivity = sim.t
  const before = levelOf((await read($, score)).xp)
  const next = await save($, old => ({ ...old, xp: old.xp + xp }))
  const after = levelOf(next.xp)
  await update($, feat, () => `${label}: +${xp} xp`)
  if (after > before) {
    sim.level = after
    banner(`LEVEL ${after}`, OCTO, 60)
    void notify($, `🐙 ${label}! The octopus grows to level ${after}!`)
  } else if (!isQuiet) {
    const what: Record<Show, string> = {
      ink: 'squirts ink',
      plane: 'pulls a plane out of the sky',
      rampage: 'goes on a rampage',
      conquer: 'takes the city',
    }
    void notify($, `🐙 ${label}! The octopus ${what[show]}`)
  }
}

// The bigger the moment, the bigger the show: a squirt of ink, a plane down, a rampage, the city taken.
const CONQUESTS = new Set(['merge', 'release', 'deploy', 'streak', 'record', 'squad'])
async function onMilestone($: EngineInterface, tier: string, kind: string, label: string) {
  if (tier === 'small') await celebrate($, label, 1, 'ink', true)
  else if (tier === 'medium') await celebrate($, label, 5, 'plane')
  else if (CONQUESTS.has(kind)) await celebrate($, label, 50, 'conquer')
  else await celebrate($, label, 25, 'rampage')
}

export async function celebrateMoments($: EngineInterface, found: Milestone[]) {
  for (const m of found) await onMilestone($, m.tier, m.kind, m.label)
}

// The game's hooks, one per event, which the Arcade's register.tsx chains with the other games'.
export const start: Hook<'session.start'> = async ($, e, next) => {
  const saved = (await $.store.get('octopus.score')) as Score | undefined
  if (saved) {
    await update($, score, () => saved)
    lastStats = statsLine(saved)
  }
  await $.command.register({
    name: 'octopus',
    description: 'The octopus above the prompt: its score. "/octopus ink|plane|rampage|conquer" to show off.',
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
    if (requestId === null || sim.W === 0) return
    step(a)
    // Buildings toppled and planes downed go to the score.
    if (sim.gain.toppled > 0 || sim.gain.planes > 0) {
      const gain = sim.gain
      sim.gain = { toppled: 0, planes: 0 }
      void save($, old => ({ ...old, toppled: old.toppled + gain.toppled, planes: old.planes + gain.planes }))
    }
    if (sim.isBlitting) return
    sim.isBlitting = true
    void $.ui.blit({ requestId, key: RASTER, cells: frame(a, lastStats), columns: sim.W })
      .then(r => {
        if (r.deny !== undefined) sim.requestId = null
      })
      .finally(() => {
        sim.isBlitting = false
      })
  })

  // The engine's roster says when a subagent is done; a hatchling swims home or sinks.
  $.clock.every(1000, () => {
    void $.agent.list().then(
      async agents => {
        for (const b of sim.babies) {
          if (b.id === undefined) {
            const match = agents.find(a => a.description === b.description && a.type === b.type && !sim.babies.some(o => o.id === a.id))
            if (match) b.id = match.id
          }
        }
        for (const a of agents) {
          const isLive = a.status === 'pending' || a.status === 'running' || a.status === 'waiting'
          if (isLive && !sim.babies.some(b => b.id === a.id)) hatch(`agent:${a.id}`, a.description, a.type, a.id)
        }
        for (const b of sim.babies) {
          if (b.state !== 'swim') continue
          const a = agents.find(x => x.id === b.id)
          const isGone = a === undefined && sim.t - b.since > (30 * 1000) / FPS_MS
          if (a?.status === 'completed' || a?.status === 'idle' || isGone) {
            b.state = 'home'
            b.since = sim.t
            await save($, old => ({ ...old, xp: old.xp + 2 }))
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




export const command: MatchedHook<'command.run', { command: 'octopus' }> = async ($, e) => {
  const arg = (e.args ?? '').trim()
  const practice: Record<string, Show> = { ink: 'ink', plane: 'plane', rampage: 'rampage', conquer: 'conquer' }
  const show = practice[arg]
  if (show) {
    await celebrate($, 'Practice', 1, show, true)
    return { text: 'The octopus shows off.' }
  }
  const last = await read($, feat)
  return { text: `${statsLine(await read($, score))}${last ? `\nLast win: ${last}` : ''}` }
}


export const prompt: Hook<'prompt.submit'> = async ($, e, next) => {
  sim.isTurn = true
  sim.alertUntil = sim.t + 12
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
  // A subagent's tool call makes its hatchling paddle; the octopus stays on the main loop.
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
  const counted = await update($, score, old => ({ ...old, tools: old.tools + 1 }))
  lastStats = statsLine(counted)
  if (counted.tools % 10 === 0) void $.store.set('octopus.score', counted)
  if (ran.isError === true) sim.sadUntil = sim.t + 30
  return ran
}


// The city runs the full width of the band, above whatever else is there.
export const render: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  const below = await next(e)
  if (e.surface !== 'terminal' || e.props.hasSurvey || !(await isShown($, ID))) {
    sim.requestId = null
    return below
  }
  const { Box, Raster } = $.ui.resolve(e)
  fitCity(clamp(e.props.bodyColumns, MIN_COLUMNS, MAX_COLUMNS))
  sim.requestId = e.requestId
  const stats = statsLine(await read($, score))
  lastStats = stats

  return (
    <Box flexDirection="column">
      <Raster key={RASTER} columns={sim.W} rows={ROWS} cells={frame(activity(), stats)} />
      {below ?? null}
    </Box>
  )
}

export const game: Game = { id: ID, title: 'Octo Invader' }
