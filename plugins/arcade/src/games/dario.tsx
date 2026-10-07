import { read, update, atom } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook } from 'claude-code'

import type { DarioScore as Score } from '../../types'
import type { Milestone } from '../milestones'
import { isShown } from '../shown'
import type { Game } from '../shown'

const ID = 'dario'
const RASTER = 'course'
// The strip: eight rows of half blocks, sixteen pixels high, as wide as the band.
const ROWS = 8
const PH = ROWS * 2
const FPS_MS = 66
const MIN_COLUMNS = 24
const MAX_COLUMNS = 512
const SLEEP_AFTER = (2 * 60 * 1000) / FPS_MS

const INK = 0x01000000
const NONE = 0x01000000
const EMPTY = 0xffffffff
const GREY = 0x8a8a8a
const GOLD = 0xffd43b
const RED = 0xe52521

// The ground: two rows of bricks at the bottom; Dario's feet stand on the row above.
const GROUND = PH - 2
const FEET = GROUND - 1
const HERO_H = 7
const HERO_W = 6
// A jump: up and down again in about seventeen frames, high enough to bump a block and clear a pipe.
const JUMP_V = -1.25
const GRAVITY = 0.15
const AIR_SPEED = 1.4

// ---- Sprites, facing right; each letter is a colour ----

const PALETTE: Record<string, number> = {
  R: RED, // cap and shirt
  S: 0xfcb070, // skin
  B: 0x2038ec, // overalls
  K: 0x7a2e05, // hair and shoes
  N: 0xa0522d, // the bug
  W: 0xfcfcfc, // eyes, clouds
  Y: 0xf8b800, // a ? block
  D: 0x7a2e05, // the mark on a ? block
  E: 0x9c4a1a, // a used block
  G: 0x00a800, // pipe
  L: 0x6fd36f, // pipe highlight
  C: GOLD, // coin
  P: 0xb0b0b0, // flag pole
  F: 0x3fa34d, // flag, bush
}

const HERO_RUN = [
  ['.RRR..', 'RRRRRR', '.KSKS.', '.SSSS.', 'RBBBR.', '.BBBB.', '.K..K.'],
  ['.RRR..', 'RRRRRR', '.KSKS.', '.SSSS.', 'RBBBR.', '.BBBB.', 'K....K'],
]
const HERO_STAND = ['.RRR..', 'RRRRRR', '.KSKS.', '.SSSS.', 'RBBBR.', '.BBBB.', '.KK.KK']
const HERO_JUMP = ['.RRR.S', 'RRRRRR', '.KSKS.', '.SSSS.', 'RBBBB.', '.BBBB.', 'K...K.']
const HERO_SIT = ['......', '......', '.RRR..', 'RRRRRR', '.KSKS.', 'RBBBB.', 'KBBBBK']
const BUG_WALK = [
  ['.NNN.', 'NWNWN', 'NNNNN', 'K...K'],
  ['.NNN.', 'NWNWN', 'NNNNN', '.K.K.'],
]
const BUG_FLAT = ['NNNNN', 'K...K']
const BLOCK = ['YYYY', 'YDDY', 'YYDY', 'YYYY']
const BLOCK_USED = ['EEEE', 'EEEE', 'EEEE', 'EEEE']
const PIPE = ['LGGGGG', 'LGGGGG', '.LGGG.', '.LGGG.']
const CLOUD = ['..WWW...', '.WWWWWW.', 'WWWWWWWW']
const BUSH = ['..FF..', '.FFFF.', 'FFFFFF']
const COIN = ['.C.', 'CCC', '.C.']

// ---- The course ----

type Show = 'hop' | 'stomp' | 'clear' | 'world'
type Thing =
  | { kind: 'block'; x: number; y: number; used: boolean; bumpAt: number; counts: boolean }
  | { kind: 'pipe'; x: number }
  | { kind: 'bug'; x: number; flatAt: number; isDoomed: boolean; hasHit: boolean; counts: boolean }
  | { kind: 'pole'; x: number; flag: number; done: boolean; counts: boolean; isWorld: boolean }
type Scenery = { kind: 'cloud' | 'bush'; x: number; y: number }
type Particle = { x: number; y: number; vx: number; vy: number; age: number; life: number; color: number; ch?: string; gravity?: number; sprite?: string[] }

const sim = {
  t: 0,
  W: 0,
  requestId: null as string | null,
  isBlitting: false,
  isTurn: false,
  working: 0,
  lastActivity: 0,
  hero: { x: 10, y: 0, vy: 0, isAir: false },
  // The flag sequence: Dario slides down the pole while the course stands still.
  flagUntil: -1,
  hurtUntil: -1,
  things: [] as Thing[],
  scenery: [] as Scenery[],
  particles: [] as Particle[],
  banner: null as null | { text: string; color: number; until: number },
  nextPipe: 90,
  // How far the course has run, for the mortar lines.
  course: 0,
  nextScenery: 0,
  gain: { coins: 0, stomps: 0, hits: 0, clears: 0 },
  stats: '',
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const stageOf = (clears: number) => `${Math.floor(clears / 4) + 1}-${(clears % 4) + 1}`

function fit(W: number) {
  if (W === sim.W) return
  sim.W = W
  sim.hero.x = clamp(Math.floor(W * 0.22), 4, 40)
  sim.things = sim.things.filter(t => t.x < W + 8)
}

function banner(text: string, color: number, frames: number) {
  sim.banner = { text, color, until: sim.t + frames }
}

const glyph = (x: number, y: number, ch: string, life: number, color: number) =>
  sim.particles.push({ x, y, vx: 0, vy: -0.15, age: 0, life, color, ch })

function sparkle(x: number, y: number, colors: number[], n = 8) {
  for (let i = 0; i < n; i++) {
    sim.particles.push({ x, y, vx: rand(-0.7, 0.7), vy: rand(-0.8, 0.2), age: 0, life: Math.floor(rand(10, 20)), color: pick(colors), gravity: 0.05 })
  }
}

// Things come in from the right edge, past anything already waiting there.
function entry(gap = 10) {
  const last = sim.things.reduce((m, t) => Math.max(m, t.x), 0)
  return Math.max(sim.W + 2, last + gap)
}

function addBlock(counts: boolean) {
  sim.things.push({ kind: 'block', x: entry(), y: 1, used: false, bumpAt: -1, counts })
}

function addBug(isDoomed: boolean, counts: boolean) {
  sim.things.push({ kind: 'bug', x: entry(), flatAt: -1, isDoomed, hasHit: false, counts })
}

function addPole(counts: boolean, isWorld: boolean) {
  sim.things.push({ kind: 'pole', x: entry(14), flag: 2, done: false, counts, isWorld })
}

const onScreen = () => sim.things.length > 0

function jump() {
  if (sim.hero.isAir || sim.flagUntil > sim.t) return
  sim.hero.isAir = true
  sim.hero.vy = JUMP_V
}

// How fast the course runs: with Claude at work, at a walk during a turn, and only while
// something is on its way otherwise. In the air Dario always carries the jump through.
function speed() {
  if (sim.flagUntil > sim.t) return 0
  if (sim.hero.isAir) return AIR_SPEED
  if (sim.working > 0) return 1
  if (sim.isTurn) return 0.6
  return onScreen() ? 0.8 : 0
}

function step() {
  sim.t += 1
  const isAsleep = !sim.isTurn && sim.working === 0 && !onScreen() && sim.t - sim.lastActivity > SLEEP_AFTER
  const v = speed()
  const hx = sim.hero.x

  // The scenery drifts by: clouds slower than the ground, a bush now and then.
  for (const s of sim.scenery) s.x -= s.kind === 'cloud' ? v * 0.4 : v
  sim.scenery = sim.scenery.filter(s => s.x > -10)
  if (v > 0 && sim.t >= sim.nextScenery) {
    sim.scenery.push(Math.random() < 0.6 ? { kind: 'cloud', x: sim.W + 2, y: Math.floor(rand(1, 5)) } : { kind: 'bush', x: sim.W + 2, y: GROUND - 3 })
    sim.nextScenery = sim.t + Math.floor(rand(30, 80))
  }
  // A pipe to jump over, now and then while Claude works.
  if (sim.working > 0 && sim.t >= sim.nextPipe) {
    sim.things.push({ kind: 'pipe', x: entry(16) })
    sim.nextPipe = sim.t + Math.floor(rand(140, 260))
  }

  for (const t of sim.things) {
    t.x -= v
    if (t.kind === 'bug' && t.flatAt < 0) t.x -= 0.3
  }

  // Dario: jump for a block overhead, a pipe ahead, a doomed bug or the flag pole.
  if (!sim.hero.isAir && sim.flagUntil < sim.t) {
    for (const t of sim.things) {
      const d = t.x - hx
      if (t.kind === 'block' && !t.used && d <= 11 && d > -2) jump()
      if (t.kind === 'pipe' && d <= HERO_W + 3 && d > 0) jump()
      if (t.kind === 'bug' && t.isDoomed && t.flatAt < 0 && d <= 16 && d > 0) jump()
    }
  }
  if (sim.hero.isAir) {
    sim.hero.y += sim.hero.vy
    sim.hero.vy += GRAVITY
    if (sim.hero.y >= 0) {
      sim.hero.y = 0
      sim.hero.vy = 0
      sim.hero.isAir = false
    }
  }
  const top = FEET - HERO_H + 1 + sim.hero.y

  for (const t of sim.things) {
    const d = t.x - hx
    if (t.kind === 'block' && !t.used && Math.abs(d - 1) < 4 && top <= t.y + 4 && sim.hero.vy <= 0.2) {
      // Bumped from below: the block is used up and a coin flies out.
      t.used = true
      t.bumpAt = sim.t
      sim.hero.vy = Math.max(sim.hero.vy, 0.2)
      sim.particles.push({ x: t.x, y: t.y - 3, vx: 0, vy: -0.5, age: 0, life: 12, color: GOLD, sprite: COIN, gravity: 0.06 })
      if (t.counts) sim.gain.coins += 1
    }
    if (t.kind === 'bug' && t.flatAt < 0 && Math.abs(d) < 5) {
      // Only a bug a moment marked is stomped; any other knocks into Dario, in the air or not.
      if (sim.hero.isAir && t.isDoomed) {
        t.flatAt = sim.t
        sim.hero.vy = -0.9
        glyph(t.x, GROUND - 6, '✦', 10, GOLD)
        if (t.counts) sim.gain.stomps += 1
      } else if (!t.isDoomed && !t.hasHit && sim.hero.y > -4 && Math.abs(d) < 3) {
        // Walked into: Dario flinches, the bug walks on through.
        t.hasHit = true
        sim.hurtUntil = sim.t + 30
        banner('OUCH', RED, 30)
        if (t.counts) sim.gain.hits += 1
      }
    }
    if (t.kind === 'pole' && !t.done && d <= HERO_W && sim.flagUntil < 0) {
      // The flag pole: slide down it, then COURSE CLEAR.
      sim.flagUntil = sim.t + 45
      sim.hero.isAir = false
      sim.hero.vy = 0
      t.done = true
    }
  }
  if (sim.flagUntil >= 0) {
    const pole = sim.things.find((t): t is Extract<Thing, { kind: 'pole' }> => t.kind === 'pole' && t.done)
    const left = sim.flagUntil - sim.t
    if (pole && left > 15) {
      sim.hero.y = -Math.max(0, (left - 15) / 30) * 6
      pole.flag = Math.min(GROUND - 5, pole.flag + 0.35)
    }
    if (left === 15) {
      sim.hero.y = 0
      banner(pole?.isWorld ? 'WORLD CLEAR!' : 'COURSE CLEAR!', GOLD, 60)
      if (pole?.counts) sim.gain.clears += 1
      if (pole?.isWorld) for (let i = 0; i < 4; i++) sparkle(rand(4, sim.W - 4), rand(1, 6), [GOLD, RED, 0x3fa34d, 0x4dabf7], 14)
    }
    if (left <= 0) sim.flagUntil = -1
  }

  sim.things = sim.things.filter(t => t.x > -12 && !(t.kind === 'bug' && t.flatAt >= 0 && sim.t - t.flatAt > 12))

  for (const p of sim.particles) {
    p.age += 1
    p.x += p.vx
    p.y += p.vy
    p.vy += p.gravity ?? 0
  }
  sim.particles = sim.particles.filter(p => p.age < p.life && p.x >= -3 && p.x < sim.W && p.y >= -3 && p.y < PH)
  return isAsleep
}

// ---- Drawing ----

function put(buf: Uint32Array, x: number, y: number, color: number) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || x >= sim.W || y < 0 || y >= PH) return
  buf[y * sim.W + x] = color
}

function paint(buf: Uint32Array, rows: string[], x: number, y: number, only?: number) {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const c = PALETTE[row[dx]!]
      if (c !== undefined) put(buf, x + dx, y + dy, only ?? c)
    }
  })
}

function drawScene(buf: Uint32Array) {
  for (const s of sim.scenery) paint(buf, s.kind === 'cloud' ? CLOUD : BUSH, s.x, s.y)
  // The ground: a row of bricks with mortar lines that scroll with the course.
  for (let x = 0; x < sim.W; x++) {
    put(buf, x, GROUND, 0xc84c0c)
    put(buf, x, GROUND + 1, (x + Math.floor(sim.course)) % 4 === 0 ? 0x7a2e05 : 0xc84c0c)
  }
}

function drawThings(buf: Uint32Array) {
  for (const t of sim.things) {
    if (t.kind === 'block') {
      const lift = t.bumpAt >= 0 && sim.t - t.bumpAt < 4 ? -1 : 0
      paint(buf, t.used ? BLOCK_USED : BLOCK, t.x, t.y + lift)
    } else if (t.kind === 'pipe') {
      paint(buf, PIPE, t.x, GROUND - PIPE.length)
    } else if (t.kind === 'bug') {
      if (t.flatAt >= 0) paint(buf, BUG_FLAT, t.x, GROUND - 2)
      else paint(buf, BUG_WALK[Math.floor(sim.t / 4) % 2]!, t.x, GROUND - 4)
    } else if (t.kind === 'pole') {
      for (let y = 1; y < GROUND; y++) put(buf, t.x + 2, y, PALETTE.P!)
      put(buf, t.x + 2, 0, GOLD)
      paint(buf, ['FF', 'FFF', 'FF'], t.x - 1, t.flag)
    }
  }
}

function drawHero(buf: Uint32Array, isAsleep: boolean) {
  const x = sim.hero.x
  const y = FEET - HERO_H + 1 + Math.round(sim.hero.y)
  if (sim.hurtUntil > sim.t && sim.t % 4 < 2) return
  if (isAsleep) return paint(buf, HERO_SIT, x, y)
  if (sim.hero.isAir || sim.flagUntil > sim.t) return paint(buf, HERO_JUMP, x, y)
  if (speed() === 0) return paint(buf, HERO_STAND, x, y)
  paint(buf, HERO_RUN[Math.floor(sim.t / 3) % 2]!, x, y)
}

const statsLine = (s: Score) => `${stageOf(s.clears)}  ◎ ${s.coins}  ✪ ${s.stomps}  ✗ ${s.hits}  ⚒ ${s.tools}`

function frame(isAsleep: boolean, stats: string): string {
  const W = sim.W
  const buf = new Uint32Array(W * PH).fill(EMPTY)
  const over = new Map<number, { ch: string; color: number }>()
  const text = (x: number, row: number, s: string, color: number) =>
    [...s].forEach((ch, i) => {
      if (x + i >= 0 && x + i < W && row >= 0 && row < ROWS) over.set(row * W + x + i, { ch, color })
    })

  drawScene(buf)
  drawThings(buf)
  drawHero(buf, isAsleep)
  for (const p of sim.particles) {
    if (p.sprite) paint(buf, p.sprite, p.x, p.y)
    else if (p.ch) text(Math.round(p.x), Math.floor(Math.round(p.y) / 2), p.ch, p.color)
    else put(buf, p.x, p.y, p.color)
  }
  if (isAsleep) text(sim.hero.x + HERO_W, Math.floor((FEET - 4) / 2), 'z', GREY)

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
      const topPx = buf[cy * 2 * W + cx]!
      const bottom = buf[(cy * 2 + 1) * W + cx]!
      const g = over.get(cy * W + cx)
      if (g) {
        words[i] = g.ch.codePointAt(0)!
        words[i + 1] = g.color
        words[i + 2] = NONE
      } else if (topPx === EMPTY && bottom === EMPTY) {
        words[i] = 0x20
        words[i + 1] = INK
        words[i + 2] = NONE
      } else if (topPx === bottom) {
        words[i] = 0x2588
        words[i + 1] = topPx
        words[i + 2] = NONE
      } else if (bottom === EMPTY) {
        words[i] = 0x2580
        words[i + 1] = topPx
        words[i + 2] = NONE
      } else if (topPx === EMPTY) {
        words[i] = 0x2584
        words[i + 1] = bottom
        words[i + 2] = NONE
      } else {
        words[i] = 0x2580
        words[i + 1] = topPx
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

const score = atom({ plugin: 'arcade', key: 'darioScore' } as const, { coins: 0, stomps: 0, hits: 0, clears: 0, tools: 0 })
const feat = atom({ plugin: 'arcade', key: 'darioFeat' } as const, '')

// A hidden game stays quiet: its notifications are hidden too.
async function notify($: EngineInterface, text: string) {
  if (await isShown($, ID)) $.ui.toast(text)
}

async function save($: EngineInterface, change: (s: Score) => Score) {
  const next = await update($, score, change)
  sim.stats = statsLine(next)
  return next
}

async function celebrate($: EngineInterface, label: string, show: Show, isPractice = false) {
  sim.lastActivity = sim.t
  const counts = !isPractice
  if (show === 'hop') {
    // A small moment: a hop and a sparkle over Dario's head.
    jump()
    sparkle(sim.hero.x + 3, FEET - HERO_H - 1, [GOLD, 0xfcfcfc], 6)
    return
  }
  if (show === 'stomp') {
    const bug = sim.things.find((t): t is Extract<Thing, { kind: 'bug' }> => t.kind === 'bug' && t.flatAt < 0 && t.x > sim.hero.x)
    if (bug) {
      bug.isDoomed = true
      bug.counts = bug.counts || counts
    } else addBug(true, counts)
  } else addPole(counts, show === 'world')
  if (isPractice) return
  const what: Record<Show, string> = { hop: '', stomp: 'a bug stomped', clear: 'a course clear', world: 'a world clear' }
  await update($, feat, () => `${label}: ${what[show]}`)
  const say: Record<Show, string> = { hop: '', stomp: 'Stomp', clear: 'Course clear', world: 'World clear' }
  void notify($, `🍄 ${label}! ${say[show]}!`)
}

// The bigger the moment, the bigger the jump: a hop, a stomp, a course clear, a world clear.
const WORLD = new Set(['merge', 'release', 'deploy', 'streak', 'record', 'squad'])
export async function celebrateMoments($: EngineInterface, found: Milestone[]) {
  for (const m of found) {
    if (m.tier === 'small') await celebrate($, m.label, 'hop')
    else if (m.tier === 'medium') await celebrate($, m.label, 'stomp')
    else await celebrate($, m.label, WORLD.has(m.kind) ? 'world' : 'clear')
  }
}

// ---- Hooks, chained by the Arcade's register with the other games' ----

export const start: Hook<'session.start'> = async ($, e, next) => {
  sim.stats = statsLine(await read($, score))
  await $.command.register({
    name: 'dario',
    description: 'Dario above the prompt: the score. "/dario coin|stomp|clear|world|ouch" to show off.',
  })
  $.clock.every(FPS_MS, () => {
    const requestId = sim.requestId
    // Saved before the guard below, so what a hidden game earned (a tool's knock) still counts.
    // Coins, stomps, knocks and clears go to the score; every hundred coins is a 1UP.
    if (sim.gain.coins + sim.gain.stomps + sim.gain.hits + sim.gain.clears > 0) {
      const gain = sim.gain
      sim.gain = { coins: 0, stomps: 0, hits: 0, clears: 0 }
      void save($, old => ({
        ...old,
        coins: old.coins + gain.coins,
        stomps: old.stomps + gain.stomps,
        hits: old.hits + gain.hits,
        clears: old.clears + gain.clears,
      })).then(s => {
        if (gain.coins > 0 && Math.floor(s.coins / 100) > Math.floor((s.coins - gain.coins) / 100)) {
          banner('1UP', 0x3fa34d, 50)
          void notify($, `🍄 1UP: ${s.coins} coins.`)
        }
      })
    }
    if (requestId === null || sim.W === 0) return
    sim.course += speed()
    const isAsleep = step()
    if (sim.isBlitting) return
    sim.isBlitting = true
    void $.ui.blit({ requestId, key: RASTER, cells: frame(isAsleep, sim.stats), columns: sim.W })
      .then(r => {
        if (r.deny !== undefined) sim.requestId = null
      })
      .finally(() => {
        sim.isBlitting = false
      })
  })
  return next(e)
}

export const command: MatchedHook<'command.run', { command: 'dario' }> = async ($, e) => {
  const arg = (e.args ?? '').trim()
  if (arg === 'coin') {
    addBlock(false)
    sim.lastActivity = sim.t
    return { text: 'Practice: a ? block, nothing counts.' }
  }
  if (arg === 'ouch') {
    addBug(false, false)
    sim.lastActivity = sim.t
    return { text: 'Practice: a bug walks in, nothing counts.' }
  }
  const practice: Record<string, Show> = { stomp: 'stomp', clear: 'clear', world: 'world' }
  const show = practice[arg]
  if (show) {
    await celebrate($, 'Practice', show, true)
    return { text: 'Practice: nothing counts.' }
  }
  const last = await read($, feat)
  return {
    text:
      `${statsLine(await read($, score))}${last ? `\nLast win: ${last}` : ''}\n` +
      'Dario runs while Claude works. Every tool call brings a ? block and a coin, a failed tool sends a bug that knocks into Dario, ' +
      'a medium moment (a commit, a skill, a sent message) stomps a bug, a big one (a finished task list, tests back to green) is a course clear at the flag pole, ' +
      'and a merge, release or deploy a world clear with fireworks. The first number is the world and course; ◎ coins (every hundred is a 1UP), ✪ bugs stomped, ✗ knocks, ⚒ tool calls.',
  }
}

export const prompt: Hook<'prompt.submit'> = async ($, e, next) => {
  sim.isTurn = true
  sim.lastActivity = sim.t
  return next(e)
}

export const turn: Hook<'turn.complete'> = async ($, e, next) => {
  if (e.agentId === undefined) sim.isTurn = false
  sim.lastActivity = sim.t
  return next(e)
}

export const tool: Hook<'tool.call'> = async ($, e, next) => {
  if (e.agentId !== undefined) return next(e)
  sim.working += 1
  sim.lastActivity = sim.t
  const ran = await next(e).finally(() => {
    sim.working = Math.max(0, sim.working - 1)
    sim.lastActivity = sim.t
  })
  if (ran.deny !== undefined) return ran
  const counted = await update($, score, old => ({ ...old, tools: old.tools + 1 }))
  sim.stats = statsLine(counted)
  // A finished tool is a ? block on its way; with two already waiting, the coin comes at once.
  if (ran.isError === true) addBug(false, true)
  else if (sim.things.filter(t => t.kind === 'block' && !t.used).length < 2) addBlock(true)
  else sim.gain.coins += 1
  return ran
}

// The course runs the full width of the band, above whatever else is there.
export const render: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  const below = await next(e)
  if (e.surface !== 'terminal' || e.props.hasSurvey || !(await isShown($, ID))) {
    sim.requestId = null
    return below
  }
  const { Box, Raster } = $.ui.resolve(e)
  fit(clamp(e.props.bodyColumns, MIN_COLUMNS, MAX_COLUMNS))
  sim.requestId = e.requestId
  sim.stats = statsLine(await read($, score))

  return (
    <Box flexDirection="column">
      <Raster key={RASTER} columns={sim.W} rows={ROWS} cells={frame(false, sim.stats)} />
      {below ?? null}
    </Box>
  )
}

// Clears this terminal's course; the Arcade asks first (`/dario reset`, then `/dario reset yes`).
export async function reset($: EngineInterface) {
  const next = await update($, score, () => score.initial)
  sim.stats = statsLine(next)
  await update($, feat, () => '')
}

export const game: Game = { id: ID, title: 'Dario' }
