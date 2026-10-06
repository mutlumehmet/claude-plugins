import { read, update, atom } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook } from 'claude-code'

import type { DuckScore as Score } from '../../types'
import type { Milestone } from '../milestones'
import { keep as keepStore, loadKept } from '../save'
import { isShown } from '../shown'
import type { Game } from '../shown'

const ID = 'duck'
const RASTER = 'marsh'
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
const GRASS = 0x3fa34d
const GRASS_DARK = 0x2b7a37
const TREE = 0x2b7a37
const TRUNK = 0x8b5a2b
const DOG = 0xc8874a
const DOG_DARK = 0x7a4a24
const DUCK = 0x8b5a2b
const DUCK_HEAD = 0x2e8b57
const BEAK = 0xffb000
const SHOT = 0xe03131
const GREY = 0x8a8a8a
const FEATHER = [0xffffff, 0xd9c7a0, 0x8b5a2b]

const GROUND = PH - 3
const SKY_BOTTOM = GROUND - 4

const score = atom({ plugin: 'arcade', key: 'duckScore' } as const, { hits: 0, escaped: 0, tools: 0 })
const feat = atom({ plugin: 'arcade', key: 'duckFeat' } as const, '')

// A hidden game stays quiet: its notifications are hidden too.
async function notify($: EngineInterface, text: string) {
  if (await isShown($, ID)) $.ui.toast(text)
}

// ---- Sprites, facing right ----

// The duck, eight by four, in two wing beats; the head is drawn over the body in its own colour.
const DUCK_UP = ['.##.....', '..##..##', '.#######', '..####..']
const DUCK_DOWN = ['......##', '.#######', '..####..', '..##....']
const DUCK_HEAD_PIXELS = [[6, 0], [7, 0], [6, 1]]
const DUCK_FALL = ['..#..#..', '..####..', '.######.', '..#..#..']
const DUCK_HIT = ['.#....#.', '.######.', '..####..', '..#..#..']
// The dog, nine by six: sniffing with two leg frames, sitting up, and laughing.
const DOG_WALK = [
  ['......##.', '.....####', '#...####.', '#######..', '.######..', '.#.#..#.#'],
  ['......##.', '.....####', '#...####.', '#######..', '.######..', '#..#.#..#'],
]
const DOG_UP = ['..#####..', '.##.#.##.', '.#######.', '..#...#..', '..#####..', '...###...']
const DOG_LAUGH = ['..#####..', '.##.#.##.', '.#######.', '..#.#.#..', '..#####..', '...###...']
const DOG_SLEEP = ['.........', '.........', '.........', '....##...', '#.######.', '########.']

// ---- The marsh ----

type Show = 'shot' | 'hunt' | 'double' | 'perfect'
const SHOW_FRAMES: Record<Show, number> = { shot: 18, hunt: 110, double: 140, perfect: 170 }
type Duck = { x: number; y: number; vx: number; vy: number; state: 'fly' | 'hit' | 'fall' | 'away'; since: number; isGame: boolean }
type Particle = { x: number; y: number; vx: number; vy: number; age: number; life: number; color: number; ch?: string; gravity?: number }

const sim = {
  t: 0,
  W: 0,
  requestId: null as string | null,
  isBlitting: false,
  isTurn: false,
  working: 0,
  lastActivity: 0,
  show: null as null | { kind: Show; until: number },
  ducks: [] as Duck[],
  particles: [] as Particle[],
  banner: null as null | { text: string; color: number; until: number },
  dogX: 4,
  dogFace: 1,
  // The dog behind the grass, holding up what fell: 0 nothing, 1 or 2 ducks, -1 laughing.
  catch: null as null | { ducks: number; x: number; since: number },
  laughUntil: -1,
  crosshair: null as null | { x: number; y: number; until: number },
  nextDuck: 60,
  gain: { hits: 0, escaped: 0 },
  stats: '',
  tree: 0,
  round: 1,
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const roundOf = (hits: number) => Math.floor(hits / 10) + 1

function fit(W: number) {
  if (W === sim.W) return
  sim.W = W
  sim.tree = Math.max(2, Math.floor(W * 0.72))
  sim.dogX = clamp(sim.dogX, 0, W - 10)
  sim.ducks = sim.ducks.filter(d => d.x < W)
}

function banner(text: string, color: number, frames: number) {
  sim.banner = { text, color, until: sim.t + frames }
}

const glyph = (x: number, y: number, ch: string, life: number, color: number) =>
  sim.particles.push({ x, y, vx: 0, vy: 0, age: 0, life, color, ch })

function feathers(x: number, y: number) {
  for (let i = 0; i < 6; i++) {
    sim.particles.push({ x, y, vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.1), age: 0, life: Math.floor(rand(10, 22)), color: pick(FEATHER), gravity: 0.04 })
  }
}

// A duck flushed out of the grass, flying up and away from the dog.
function launch(isGame: boolean): Duck {
  const x = clamp(Math.floor(rand(4, sim.W - 12)), 0, Math.max(0, sim.W - 9))
  const duck: Duck = { x, y: SKY_BOTTOM, vx: pick([-1, 1]) * rand(0.5, 0.9), vy: -rand(0.25, 0.45), state: 'fly', since: sim.t, isGame }
  sim.ducks.push(duck)
  return duck
}

// The nearest flying duck, or a new one when none is up.
function target(): Duck {
  return sim.ducks.find(d => d.state === 'fly') ?? launch(true)
}

// A shot from a moment worth celebrating counts; the small moments' shots are for show.
function shoot(duck: Duck, counts = true) {
  if (counts) duck.isGame = true
  duck.state = 'hit'
  duck.since = sim.t
  sim.crosshair = { x: Math.round(duck.x + 3), y: Math.round(duck.y + 1), until: sim.t + 10 }
  feathers(duck.x + 4, duck.y + 1)
}

function stepDucks() {
  for (const d of sim.ducks) {
    const age = sim.t - d.since
    if (d.state === 'fly') {
      d.x += d.vx
      d.y += d.vy
      if (d.x < 0 || d.x > sim.W - 9) d.vx = -d.vx
      if (d.y < 0 || d.y > SKY_BOTTOM) d.vy = -d.vy
      if (Math.random() < 0.02) d.vy = -d.vy
      // A duck nobody shoots leaves after a while, quietly; only a failed tool makes it an escape.
      if (age > 260) d.state = 'away'
    } else if (d.state === 'hit' && age > 8) {
      d.state = 'fall'
      d.since = sim.t
    } else if (d.state === 'fall') {
      d.y += 0.7
      if (d.y >= GROUND) {
        d.y = PH
        const caught = sim.catch && sim.t - sim.catch.since < 10 ? sim.catch.ducks + 1 : 1
        sim.catch = { ducks: Math.min(2, caught), x: clamp(Math.round(d.x), 0, sim.W - 9), since: sim.t }
        if (d.isGame) sim.gain.hits += 1
      }
    } else if (d.state === 'away') {
      d.y -= 0.8
      d.x += d.vx
    }
  }
  sim.ducks = sim.ducks.filter(d => d.y > -5 && d.y < PH && d.x > -9 && d.x < sim.W + 1)
}

// A failed tool: the duck in the air gets away, and the dog laughs at you.
function flyAway(isPractice: boolean) {
  const duck = sim.ducks.find(d => d.state === 'fly')
  if (duck) {
    duck.state = 'away'
    duck.since = sim.t
    if (!isPractice) sim.gain.escaped += 1
    banner('FLY AWAY', GREY, 30)
  }
  sim.laughUntil = sim.t + 40
}

function step() {
  sim.t += 1
  const show = sim.show && sim.t < sim.show.until ? sim.show : null
  const age = show ? SHOW_FRAMES[show.kind] - (show.until - sim.t) : 0
  if (show) {
    if (show.kind === 'shot' && age === 1) {
      const duck = sim.ducks.find(d => d.state === 'fly')
      if (duck) shoot(duck, false)
      else {
        const x = Math.floor(rand(4, sim.W - 8))
        sim.crosshair = { x, y: Math.floor(rand(2, SKY_BOTTOM)), until: sim.t + 6 }
        glyph(x, Math.floor(rand(0, 4)), '*', 6, SHOT)
      }
    }
    if (show.kind === 'hunt' && age === 1) target()
    if (show.kind === 'hunt' && age === 25) shoot(target())
    if ((show.kind === 'double' || show.kind === 'perfect') && age === 1) {
      launch(true)
      launch(true)
    }
    if ((show.kind === 'double' || show.kind === 'perfect') && (age === 25 || age === 35)) shoot(target())
    if (show.kind === 'double' && age === 40) banner('DOUBLE!', SHOT, 50)
    if (show.kind === 'perfect' && age === 40) banner('PERFECT!', BEAK, 70)
    if (show.kind === 'perfect' && age > 40 && age % 6 === 0) feathers(rand(2, sim.W - 2), rand(0, 6))
  }

  // While Claude works, the dog sniffs along the grass and now and then flushes a duck.
  const isAsleep = !sim.isTurn && sim.working === 0 && sim.t - sim.lastActivity > SLEEP_AFTER
  if (!isAsleep && !sim.catch && sim.laughUntil < sim.t) {
    const speed = sim.working > 0 ? 0.5 : sim.isTurn ? 0.3 : 0.1
    sim.dogX += sim.dogFace * speed
    if (sim.dogX < 0 || sim.dogX > sim.W - 10) sim.dogFace = -sim.dogFace
  }
  if ((sim.isTurn || sim.working > 0) && !show && sim.t >= sim.nextDuck && !sim.ducks.some(d => d.state === 'fly')) {
    launch(false)
    sim.nextDuck = sim.t + Math.floor(rand(90, 200))
  }
  stepDucks()
  if (sim.catch && sim.t - sim.catch.since > 45) sim.catch = null

  for (const p of sim.particles) {
    p.age += 1
    p.x += p.vx
    p.y += p.vy
    p.vy += p.gravity ?? 0
  }
  sim.particles = sim.particles.filter(p => p.age < p.life && p.x >= 0 && p.x < sim.W && p.y >= 0 && p.y < PH)
  return isAsleep
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

function drawDuck(buf: Uint32Array, d: Duck) {
  const isLeft = d.vx < 0
  if (d.state === 'hit') return mask(buf, DUCK_HIT, d.x, d.y, DUCK, isLeft)
  if (d.state === 'fall') return mask(buf, DUCK_FALL, d.x, d.y, DUCK, isLeft)
  const isUp = Math.floor(sim.t / 4) % 2 === 0
  mask(buf, isUp ? DUCK_UP : DUCK_DOWN, d.x, d.y, DUCK, isLeft)
  for (const [hx, hy] of DUCK_HEAD_PIXELS) put(buf, isLeft ? d.x + 7 - hx! : d.x + hx!, d.y + hy!, DUCK_HEAD)
  put(buf, isLeft ? d.x - 1 : d.x + 8, d.y + (isUp ? 1 : 0), BEAK)
}

function drawScene(buf: Uint32Array) {
  // A tree on the right, the grass along the bottom with a ragged top.
  const tx = sim.tree
  for (let y = GROUND - 7; y < GROUND; y++) {
    const half = y < GROUND - 4 ? 3 - Math.abs(GROUND - 6 - y) : 0
    for (let dx = -half; dx <= half; dx++) put(buf, tx + dx, y, TREE)
  }
  for (let y = GROUND - 4; y < GROUND; y++) put(buf, tx, y, TRUNK)
  for (let x = 0; x < sim.W; x++) {
    for (let y = GROUND; y < PH; y++) put(buf, x, y, GRASS)
    if ((x * 7) % 5 < 2) put(buf, x, GROUND - 1, GRASS_DARK)
  }
}

function drawDog(buf: Uint32Array, isAsleep: boolean) {
  if (sim.catch) {
    // Up from behind the grass, holding up the catch.
    const rise = Math.min(7, Math.floor((sim.t - sim.catch.since) / 2))
    const y = PH - 1 - rise
    mask(buf, DOG_UP, sim.catch.x, y, DOG)
    for (let i = 0; i < sim.catch.ducks; i++) mask(buf, DUCK_FALL, sim.catch.x + (i === 0 ? -3 : 5), y - 3, DUCK)
    return
  }
  if (sim.laughUntil > sim.t) {
    // Up from behind the grass too, shaking with laughter.
    const bob = Math.floor(sim.t / 3) % 2
    mask(buf, DOG_LAUGH, sim.dogX, PH - 8 + bob, DOG)
    return
  }
  // Standing on the grass, its feet in the top row of it.
  const y = GROUND - 5
  if (isAsleep) {
    mask(buf, DOG_SLEEP, sim.dogX, y, DOG)
    return
  }
  const legs = DOG_WALK[Math.floor(sim.t / 4) % 2]!
  mask(buf, legs, sim.dogX, y, DOG, sim.dogFace < 0)
  put(buf, sim.dogFace < 0 ? sim.dogX + 2 : sim.dogX + 6, y, DOG_DARK)
}

const statsLine = (s: Score) => `R ${roundOf(s.hits)}  ▼ ${s.hits}  ↗ ${s.escaped}  ⚒ ${s.tools}`

function frame(isAsleep: boolean, stats: string): string {
  const W = sim.W
  const buf = new Uint32Array(W * PH).fill(EMPTY)
  const over = new Map<number, { ch: string; color: number }>()
  const text = (x: number, row: number, s: string, color: number) =>
    [...s].forEach((ch, i) => {
      if (x + i >= 0 && x + i < W) over.set(row * W + x + i, { ch, color })
    })

  for (const d of sim.ducks) drawDuck(buf, d)
  // With a catch, or laughing, the dog rises from behind the grass, so the grass goes on top of it.
  const isBehind = sim.catch !== null || sim.laughUntil > sim.t
  if (isBehind) drawDog(buf, isAsleep)
  drawScene(buf)
  if (!isBehind) drawDog(buf, isAsleep)
  if (sim.crosshair && sim.t < sim.crosshair.until) {
    const { x, y } = sim.crosshair
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, 0], [1, 0], [0, -1], [0, 1]]) put(buf, x + dx!, y + dy!, SHOT)
  }
  if (isAsleep) text(Math.round(sim.dogX) + 9, Math.floor((GROUND - 4) / 2), 'z', GREY)

  for (const p of sim.particles) {
    if (p.ch) text(Math.round(p.x), Math.floor(Math.round(p.y) / 2), p.ch, p.color)
    else put(buf, p.x, p.y, p.color)
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

async function save($: EngineInterface, change: (s: Score) => Score) {
  const next = await update($, score, await keepStore($, 'duck.score', await read($, score), change))
  sim.stats = statsLine(next)
  return next
}

// A smaller moment never cuts a bigger show short.
const RANK: Record<Show, number> = { shot: 0, hunt: 1, double: 2, perfect: 3 }

async function celebrate($: EngineInterface, label: string, show: Show, isQuiet = false) {
  const running = sim.show && sim.t < sim.show.until ? sim.show.kind : null
  if (running === null || RANK[show] >= RANK[running]) sim.show = { kind: show, until: sim.t + SHOW_FRAMES[show] }
  sim.lastActivity = sim.t
  const what: Record<Show, string> = { shot: 'a shot', hunt: 'a duck down', double: 'a double', perfect: 'a perfect round' }
  await update($, feat, () => `${label}: ${what[show]}`)
  if (!isQuiet) {
    const say: Record<Show, string> = {
      shot: 'Bang',
      hunt: 'Got one',
      double: 'Two in one round',
      perfect: 'Perfect',
    }
    void notify($, `🦆 ${label}! ${say[show]}!`)
  }
}

// The bigger the moment, the bigger the hunt: a shot, a duck down, a double, a perfect round.
const PERFECT = new Set(['merge', 'release', 'deploy', 'streak', 'record', 'squad'])
async function onMilestone($: EngineInterface, tier: string, kind: string, label: string) {
  if (tier === 'small') await celebrate($, label, 'shot', true)
  else if (tier === 'medium') await celebrate($, label, 'hunt')
  else if (PERFECT.has(kind)) await celebrate($, label, 'perfect')
  else await celebrate($, label, 'double')
}

export async function celebrateMoments($: EngineInterface, found: Milestone[]) {
  for (const m of found) await onMilestone($, m.tier, m.kind, m.label)
}

// ---- Hooks, chained by the Arcade's register with the other games' ----

export const start: Hook<'session.start'> = async ($, e, next) => {
  const saved = (await loadKept($, 'duck.score')) as Score | undefined
  if (saved) await update($, score, () => saved)
  sim.stats = statsLine(saved ?? (await read($, score)))
  sim.round = roundOf((saved ?? (await read($, score))).hits)
  await $.command.register({
    name: 'duck',
    description: 'The duck hunt above the prompt: the score. "/duck shot|hunt|double|perfect|flyaway" to show off.',
  })
  $.clock.every(FPS_MS, () => {
    const requestId = sim.requestId
    // Saved before the guard below, so what a hidden game earned (a tool's knock) still counts.
    // Ducks down and ducks escaped go to the score; ten down is a new round.
    if (sim.gain.hits > 0 || sim.gain.escaped > 0) {
      const gain = sim.gain
      sim.gain = { hits: 0, escaped: 0 }
      void save($, old => ({ ...old, hits: old.hits + gain.hits, escaped: old.escaped + gain.escaped })).then(s => {
        const round = roundOf(s.hits)
        if (round > sim.round) {
          sim.round = round
          banner(`ROUND ${round}`, BEAK, 60)
          void notify($, `🦆 Round ${round}: ${s.hits} ducks down.`)
        }
      })
    }
    if (requestId === null || sim.W === 0) return
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

export const command: MatchedHook<'command.run', { command: 'duck' }> = async ($, e) => {
  const arg = (e.args ?? '').trim()
  const practice: Record<string, Show> = { shot: 'shot', hunt: 'hunt', double: 'double', perfect: 'perfect' }
  const show = practice[arg]
  if (show) {
    await celebrate($, 'Practice', show, true)
    return { text: 'Practice: nothing counts.' }
  }
  if (arg === 'flyaway') {
    flyAway(true)
    return { text: 'The duck gets away, and the dog laughs.' }
  }
  const last = await read($, feat)
  return {
    text:
      `${statsLine(await read($, score))}${last ? `\nLast win: ${last}` : ''}\n` +
      'A medium moment (a commit, a skill, a sent message) shoots a duck down, a big one (a merge, a deploy, a finished task list) shoots two; a failed tool lets one get away. ' +
      'R is the round (ten ducks each), ▼ ducks down, ↗ ducks that got away, ⚒ tool calls.',
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
  const counted = await update($, score, await keepStore($, 'duck.score', await read($, score), old => ({ ...old, tools: old.tools + 1 })))
  sim.stats = statsLine(counted)
  if (ran.isError === true) flyAway(false)
  return ran
}

// The marsh runs the full width of the band, above whatever else is there.
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

// Clears this project's hunt; the Arcade asks first (`/duck reset`, then `/duck reset yes`).
export async function reset($: EngineInterface) {
  const next = await update($, score, await keepStore($, 'duck.score', await read($, score), () => score.initial))
  sim.stats = statsLine(next)
  sim.round = 1
  await update($, feat, () => '')
}

export const game: Game = { id: ID, title: 'Duck Hunt' }
