import { read, update, atom } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook } from 'claude-code'

import type { TownScore as Score, TownPlot as Plot } from '../../types'
import type { Milestone } from '../milestones'
import { loadKept, scoped } from '../save'
import { isShown } from '../shown'
import type { Game } from '../shown'

const ID = 'town'
const RASTER = 'town'
// The strip: eight rows of half blocks, sixteen pixels high, as wide as the band.
const ROWS = 8
const PH = ROWS * 2
const FPS_MS = 66
const MIN_COLUMNS = 24
const MAX_COLUMNS = 512
const SLEEP_AFTER = (2 * 60 * 1000) / FPS_MS
// A helper's villager goes home after this long without a tool call of its own.
const HELPER_IDLE = (20 * 1000) / FPS_MS

const INK = 0x01000000
const NONE = 0x01000000
const EMPTY = 0xffffffff
const GREY = 0x8a8a8a
const GOLD = 0xffd43b
const CREEPER = 0x4caf50

// The ground: grass, dirt and stone; buildings stand on the grass.
const GRASS = PH - 3
const BASE = GRASS - 1
// A castle needs this many columns at the right end of the band, kept free for it.
const CASTLE_ROOM = 24
const MIN_FOR_CASTLE = 64

// ---- Blueprints, top row first; each letter is a block ----

const BLOCKS: Record<string, number> = {
  P: 0xb8945f, // planks
  L: 0x6b4a2b, // logs
  R: 0x9c3b2b, // roof
  W: 0x9fd3ff, // window
  D: 0x4a3018, // door
  S: 0x9a9a9a, // stone
  s: 0x7d7d7d, // dark stone
  Y: 0xe0c040, // wheat
  F: 0x7a4a24, // farmland
  B: 0x3b82f6, // water
  G: 0x3fa34d, // leaves
  T: 0x6b4a2b, // trunk
  K: 0xe52521, // banner
  O: 0xc0c0c0, // flag pole
}

type Kind = Plot['kind']

const TREE_STAGES = [
  ['G', 'T'],
  ['.G.', 'GGG', 'GGG', '.T.', '.T.'],
  ['.GGG.', 'GGGGG', 'GGGGG', 'GGGGG', '.GTG.', '..T..', '..T..'],
]

function castleRows(): string[] {
  const w = 21
  const h = 12
  const g = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'))
  const fill = (x0: number, x1: number, y0: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y]![x] = c
  }
  fill(5, 15, 5, 11, 'S') // the wall
  for (const x of [5, 7, 9, 11, 13, 15]) g[4]![x] = 'S'
  fill(0, 4, 1, 11, 's') // the towers
  fill(16, 20, 1, 11, 's')
  for (const x of [0, 2, 4, 16, 18, 20]) g[0]![x] = 's'
  fill(8, 12, 2, 11, 'S') // the keep
  for (const x of [8, 12]) g[1]![x] = 'S'
  g[1]![10] = 'O'
  g[0]![10] = 'O'
  g[0]![11] = 'K'
  g[1]![11] = 'K'
  fill(9, 11, 8, 11, 'D') // the gate
  g[4]![2] = 'W'
  g[4]![18] = 'W'
  g[5]![10] = 'W'
  return g.map(r => r.join(''))
}

const BLUEPRINTS: Record<Exclude<Kind, 'tree'>, string[]> = {
  house: ['...R...', '..RRR..', '.RRRRR.', 'RRRRRRR', 'LPPWPPL', 'LPPDPPL', 'LPPDPPL'],
  bighouse: [
    '....R....',
    '...RRR...',
    '..RRRRR..',
    '.RRRRRRR.',
    'RRRRRRRRR',
    'LPPWPWPPL',
    'LPPPPPPPL',
    'LLLLLLLLL',
    'LPWPDPWPL',
    'LPPPDPPPL',
  ],
  farm: ['Y.Y.Y.Y', 'FFFFFFF'],
  well: ['LLLLL', 'L...L', 'L...L', 'SBBBS', 'SSSSS'],
  tower: ['S.S.S', 'SSSSS', 'SSWSS', 'SSSSS', 'SSSSS', 'SSWSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSDSS', 'SSDSS'],
  castle: castleRows(),
}

const NAMES: Record<Kind, string> = { house: 'HOUSE', bighouse: 'HALL', farm: 'FARM', well: 'WELL', tower: 'TOWER', castle: 'CASTLE', tree: 'TREE' }
const widthOf = (kind: Kind) => (kind === 'tree' ? 5 : BLUEPRINTS[kind][0]!.length)

// A blueprint as the order its blocks go up in: bottom row first, left to right.
type Block = { dx: number; dy: number; color: number }
const ORDER = new Map<string, Block[]>()
function blocksOf(rows: string[]): Block[] {
  const key = rows.join('|')
  const cached = ORDER.get(key)
  if (cached) return cached
  const out: Block[] = []
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r]!
    for (let c = 0; c < row.length; c++) {
      const color = BLOCKS[row[c]!]
      if (color !== undefined) out.push({ dx: c, dy: r - rows.length + 1, color })
    }
  }
  ORDER.set(key, out)
  return out
}

// What a new building site becomes, in turn; trees are planted by small moments instead.
const CYCLE: Kind[] = ['house', 'farm', 'house', 'well', 'house', 'tower', 'bighouse', 'house']

// ---- The town ----

type Villager = { id: string; x: number; face: number; color: number; lastWork: number; isLeaving: boolean }
type Creeper = { x: number; target: number; fuse: number }
type Particle = { x: number; y: number; vx: number; vy: number; age: number; life: number; color: number; ch?: string; gravity?: number }

const sim = {
  t: 0,
  W: 0,
  requestId: null as string | null,
  isBlitting: false,
  isTurn: false,
  working: 0,
  lastActivity: 0,
  plots: [] as Plot[],
  next: 0,
  villagers: [] as Villager[],
  creepers: [] as Creeper[],
  particles: [] as Particle[],
  banner: null as null | { text: string; color: number; until: number },
  gain: { blocks: 0, houses: 0, trees: 0, castles: 0, creepers: 0 },
  isDirty: false,
  stats: '',
  tools: 0,
  // Tool calls not yet added to the stored score.
  toolGain: 0,
  // When the town was last reset; a session that loaded an older town gives its copy up.
  epoch: 0,
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const HELPER_COLORS = [0xe0a030, 0xb05cd6, 0x2bb3a3, 0xe86a92, 0x8bc34a]

function levelOf(blocks: number) {
  if (blocks < 50) return 'Camp'
  if (blocks < 200) return 'Hamlet'
  if (blocks < 600) return 'Village'
  if (blocks < 1500) return 'Town'
  return 'City'
}

function banner(text: string, color: number, frames: number) {
  sim.banner = { text, color, until: sim.t + frames }
}

function sparkle(x: number, y: number, colors: number[], n = 8) {
  for (let i = 0; i < n; i++) {
    sim.particles.push({ x, y, vx: rand(-0.7, 0.7), vy: rand(-0.8, 0.2), age: 0, life: Math.floor(rand(10, 20)), color: pick(colors), gravity: 0.05 })
  }
}

// A plot's blocks: a tree by its stage, anything else by its blueprint.
function treeStage(p: Plot) {
  return clamp(Math.floor((sim.tools - (p.plantedAt ?? 0)) / 8), 0, 2)
}
const rowsOf = (p: Plot) => (p.kind === 'tree' ? TREE_STAGES[treeStage(p)]! : BLUEPRINTS[p.kind])
const sizeOf = (p: Plot) => (p.kind === 'tree' ? Infinity : blocksOf(BLUEPRINTS[p.kind]).length)
const isDone = (p: Plot) => p.kind === 'tree' || p.progress >= sizeOf(p)

const castleX = () => (sim.W >= MIN_FOR_CASTLE ? sim.W - CASTLE_ROOM + 1 : Infinity)
const buildable = () => Math.min(sim.W, castleX() - 2)

// The leftmost gap of `w` columns, one column apart from its neighbours, in the town's part of the band.
function freeSpan(w: number, fromRight = false): number | null {
  const taken = sim.plots.filter(p => p.kind !== 'castle').map(p => [p.x - 1, p.x + widthOf(p.kind)] as const).sort((a, b) => a[0] - b[0])
  const gaps: number[] = []
  let x = 1
  for (const [a, b] of taken) {
    if (x + w <= a) gaps.push(fromRight ? a - w : x)
    x = Math.max(x, b + 1)
  }
  if (x + w <= buildable()) gaps.push(fromRight ? buildable() - w : x)
  if (gaps.length === 0) return null
  return fromRight ? Math.max(...gaps) : gaps[0]!
}

// Where the next block goes: a damaged building first, then the one going up, then a new site.
// With no room left, the oldest building is torn down and built again, a house as a hall.
function site(): Plot | null {
  const fits = (p: Plot) => p.x + widthOf(p.kind) <= sim.W
  const damaged = sim.plots.find(p => p.kind !== 'tree' && p.wasDone && !isDone(p) && fits(p))
  if (damaged) return damaged
  const building = sim.plots.find(p => p.kind !== 'tree' && p.kind !== 'castle' && !isDone(p) && fits(p))
  if (building) return building
  const kind = CYCLE[sim.next % CYCLE.length]!
  const x = freeSpan(widthOf(kind))
  if (x !== null) {
    sim.next += 1
    const plot: Plot = { kind, x, progress: 0, wasDone: false }
    sim.plots.push(plot)
    return plot
  }
  const oldest = sim.plots.find(p => p.kind !== 'tree' && p.kind !== 'castle' && fits(p))
  if (!oldest) return null
  if (oldest.kind === 'house') {
    const right = sim.plots.filter(p => p !== oldest && p.kind !== 'castle').map(p => p.x).filter(x => x > oldest.x)
    if ((right.length === 0 ? buildable() : Math.min(...right) - 1) - oldest.x >= widthOf('bighouse')) oldest.kind = 'bighouse'
  }
  oldest.progress = 0
  oldest.wasDone = false
  oldest.v = (oldest.v ?? 0) + 1
  // Move it to the end of the list, so the next renewal is the next oldest.
  sim.plots = [...sim.plots.filter(p => p !== oldest), oldest]
  return oldest
}

function finish(p: Plot, isQuiet = false) {
  p.progress = sizeOf(p)
  if (p.wasDone) return
  p.wasDone = true
  if (p.kind === 'house' || p.kind === 'bighouse') sim.gain.houses += 1
  if (p.kind === 'castle') sim.gain.castles += 1
  if (!isQuiet) banner(`${NAMES[p.kind]} BUILT`, GOLD, 40)
  sparkle(p.x + widthOf(p.kind) / 2, BASE - 4, [GOLD, 0xfcfcfc], 6)
}

function villager(id: string): Villager {
  let v = sim.villagers.find(x => x.id === id)
  if (!v) {
    const color = id === 'main' ? 0x2b6fd6 : HELPER_COLORS[sim.villagers.length % HELPER_COLORS.length]!
    v = { id, x: id === 'main' ? 2 : sim.W - 3, face: 1, color, lastWork: sim.t, isLeaving: false }
    sim.villagers.push(v)
  }
  v.lastWork = sim.t
  v.isLeaving = false
  return v
}

// One tool call's worth of work: blocks go up on the site, by whoever made the call.
function work(who: string, n: number, counts = true) {
  const v = villager(who)
  for (let i = 0; i < n; i++) {
    const p = site()
    if (!p) return
    const list = blocksOf(BLUEPRINTS[p.kind as Exclude<Kind, 'tree'>])
    const b = list[Math.min(p.progress, list.length - 1)]!
    p.progress += 1
    if (counts) sim.gain.blocks += 1
    v.x = clamp(v.x, 0, sim.W - 3)
    sim.particles.push({ x: p.x + b.dx, y: BASE + b.dy, vx: 0, vy: -0.2, age: 0, life: 4, color: 0xfcfcfc })
    if (isDone(p)) finish(p)
  }
  sim.isDirty = true
}

// Trees are planted from the right of the town and kept to a grove, so houses keep their room.
function plantTree(counts = true) {
  const trees = sim.plots.filter(p => p.kind === 'tree').length
  const x = trees < Math.max(2, Math.floor(buildable() / 18)) ? freeSpan(5, true) : null
  if (x === null) {
    // The grove is full: every young tree grows a little instead.
    for (const p of sim.plots) if (p.kind === 'tree') p.plantedAt = (p.plantedAt ?? 0) - 4
    sim.isDirty = true
    return
  }
  sim.plots.push({ kind: 'tree', x, progress: 0, wasDone: true, plantedAt: sim.tools })
  if (counts) sim.gain.trees += 1
  sim.particles.push({ x: x + 2, y: BASE - 2, vx: 0, vy: -0.3, age: 0, life: 8, color: 0x3fa34d })
  sim.isDirty = true
}

// A big moment raises a third of the castle; a merge or a deploy raises the rest of it at once.
function raiseCastle(isWhole: boolean, counts = true) {
  const x = castleX()
  if (x === Infinity) {
    banner('NO ROOM FOR A CASTLE', GREY, 40)
    return
  }
  let castle = sim.plots.find(p => p.kind === 'castle')
  if (!castle || (isDone(castle) && castle.wasDone)) {
    if (castle) {
      // A finished castle: fly the banners and start on a bigger one next time.
      for (let i = 0; i < 4; i++) sparkle(rand(x, sim.W - 2), rand(1, 6), [GOLD, 0xe52521, 0x4dabf7, 0x3fa34d], 12)
      banner('LONG LIVE THE CASTLE!', GOLD, 60)
      return
    }
    castle = { kind: 'castle', x, progress: 0, wasDone: false }
    sim.plots.push(castle)
  }
  castle.x = x
  const size = sizeOf(castle)
  const goal = isWhole ? size : Math.min(size, castle.progress + Math.ceil(size / 3))
  if (counts) sim.gain.blocks += goal - castle.progress
  castle.progress = goal
  if (isDone(castle)) {
    finish(castle, true)
    banner('CASTLE BUILT!', GOLD, 70)
    for (let i = 0; i < 4; i++) sparkle(rand(x, sim.W - 2), rand(1, 6), [GOLD, 0xe52521, 0x4dabf7, 0x3fa34d], 12)
  } else banner('THE CASTLE GROWS', GOLD, 45)
  sim.isDirty = true
}

// A failed tool: a creeper walks in and blows a hole in the nearest finished building.
function creeper(counts = true) {
  const targets = sim.plots.filter(p => p.kind !== 'tree' && p.progress > 4 && p.x + widthOf(p.kind) <= sim.W)
  const target = targets.length > 0 ? pick(targets) : null
  const tx = target ? target.x + Math.floor(widthOf(target.kind) / 2) : Math.floor(sim.W / 2)
  sim.creepers.push({ x: tx < sim.W / 2 ? -2 : sim.W + 1, target: tx, fuse: -1 })
  if (counts) sim.gain.creepers += 1
}

function explode(c: Creeper) {
  sparkle(c.x, BASE - 2, [0xfcfcfc, GREY, 0xff922b], 14)
  banner('BOOM', 0xff922b, 30)
  for (const p of sim.plots) {
    if (p.kind === 'tree') continue
    const w = widthOf(p.kind)
    if (c.x >= p.x - 2 && c.x <= p.x + w + 1) {
      p.progress = Math.max(0, p.progress - Math.ceil(sizeOf(p) * 0.35))
      p.v = (p.v ?? 0) + 1
    }
  }
  sim.isDirty = true
}

function step() {
  sim.t += 1
  const isAsleep = !sim.isTurn && sim.working === 0 && sim.creepers.length === 0 && sim.t - sim.lastActivity > SLEEP_AFTER

  // Villagers walk to the site and work there; a helper goes home once its subagent is quiet.
  const target = sim.plots.find(p => p.kind !== 'tree' && !isDone(p) && p.kind !== 'castle')
  for (const v of sim.villagers) {
    if (v.id !== 'main' && sim.t - v.lastWork > HELPER_IDLE) v.isLeaving = true
    const goal = v.isLeaving ? sim.W + 4 : target ? target.x + widthOf(target.kind) + (v.id === 'main' ? 0 : -widthOf(target.kind) - 3) : v.x
    const speed = sim.working > 0 || v.isLeaving ? 0.5 : sim.isTurn ? 0.25 : 0.1
    if (Math.abs(goal - v.x) > 0.5) {
      v.face = goal > v.x ? 1 : -1
      v.x += v.face * speed
    }
  }
  sim.villagers = sim.villagers.filter(v => !(v.isLeaving && v.x > sim.W + 2))

  for (const c of sim.creepers) {
    if (c.fuse < 0) {
      c.x += c.x < c.target ? 0.35 : -0.35
      if (Math.abs(c.x - c.target) < 0.5) c.fuse = 24
    } else if ((c.fuse -= 1) === 0) explode(c)
  }
  sim.creepers = sim.creepers.filter(c => c.fuse !== 0)

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

function drawPlot(buf: Uint32Array, p: Plot) {
  if (p.x + widthOf(p.kind) > sim.W) return
  if (p.kind === 'tree') {
    const rows = rowsOf(p)
    const w = rows[0]!.length
    const x = p.x + Math.floor((5 - w) / 2)
    for (const b of blocksOf(rows)) put(buf, x + b.dx, BASE + b.dy, b.color)
    return
  }
  const list = blocksOf(BLUEPRINTS[p.kind])
  for (let i = 0; i < Math.min(p.progress, list.length); i++) put(buf, p.x + list[i]!.dx, BASE + list[i]!.dy, list[i]!.color)
  // A building going up shows its frame: the corners of what is still to come, in faint scaffolding.
  if (!isDone(p) && p.progress > 0) {
    const h = BLUEPRINTS[p.kind].length
    const w = widthOf(p.kind)
    for (let y = 0; y < h; y += 2) {
      put(buf, p.x - 1, BASE - y, 0x5c4630)
      put(buf, p.x + w, BASE - y, 0x5c4630)
    }
  }
}

function drawVillager(buf: Uint32Array, v: Villager) {
  const x = Math.round(v.x)
  const legs = Math.floor(sim.t / 4) % 2
  put(buf, x, BASE - 3, 0xfcb070)
  put(buf, x, BASE - 2, v.color)
  put(buf, x + v.face, BASE - 2, v.id === 'main' || sim.t % 8 < 4 ? 0xfcb070 : v.color)
  put(buf, x, BASE - 1, v.color)
  put(buf, x, BASE, 0x4a3018)
  if (legs) put(buf, x + v.face, BASE, 0x4a3018)
}

function drawCreeper(buf: Uint32Array, c: Creeper) {
  const isFlash = c.fuse > 0 && c.fuse % 4 < 2
  const color = isFlash ? 0xfcfcfc : CREEPER
  const x = Math.round(c.x)
  for (let y = BASE - 3; y <= BASE; y++) put(buf, x, y, color)
  put(buf, x + 1, BASE - 3, color)
  put(buf, x + 1, BASE, color)
  put(buf, x, BASE - 3, 0x1b5e20)
}

function drawGround(buf: Uint32Array) {
  for (let x = 0; x < sim.W; x++) {
    put(buf, x, GRASS, (x * 5) % 7 === 0 ? 0x2e8b3a : 0x3fa34d)
    put(buf, x, GRASS + 1, (x * 3) % 5 === 0 ? 0x5a3a1c : 0x7a4a24)
    put(buf, x, GRASS + 2, (x * 7) % 4 === 0 ? 0x6b6b6b : 0x8a8a8a)
  }
}

const statsLine = (s: Score) => `${levelOf(s.blocks)}  ▦ ${s.blocks}  ⌂ ${s.houses}  ♣ ${s.trees}  ♜ ${s.castles}  ⚒ ${s.tools}`

function frame(isAsleep: boolean, stats: string): string {
  const W = sim.W
  const buf = new Uint32Array(W * PH).fill(EMPTY)
  const over = new Map<number, { ch: string; color: number }>()
  const text = (x: number, row: number, s: string, color: number) =>
    [...s].forEach((ch, i) => {
      if (x + i >= 0 && x + i < W && row >= 0 && row < ROWS) over.set(row * W + x + i, { ch, color })
    })

  drawGround(buf)
  for (const p of sim.plots) drawPlot(buf, p)
  if (!isAsleep) for (const v of sim.villagers) drawVillager(buf, v)
  for (const c of sim.creepers) drawCreeper(buf, c)
  for (const p of sim.particles) {
    if (p.ch) text(Math.round(p.x), Math.floor(Math.round(p.y) / 2), p.ch, p.color)
    else put(buf, p.x, p.y, p.color)
  }
  if (isAsleep) {
    const home = sim.plots.find(p => (p.kind === 'house' || p.kind === 'bighouse') && isDone(p))
    if (home) text(home.x + widthOf(home.kind), Math.floor((BASE - 8) / 2), 'z', GREY)
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

// ---- Score, and the town kept between sessions ----

const score = atom({ plugin: 'arcade', key: 'townScore' } as const, { blocks: 0, houses: 0, trees: 0, castles: 0, creepers: 0, tools: 0 })
const feat = atom({ plugin: 'arcade', key: 'townFeat' } as const, '')

// A hidden game stays quiet: its notifications are hidden too.
async function notify($: EngineInterface, text: string) {
  if (await isShown($, ID)) $.ui.toast(text)
}

// `width` is the band's width when last shown, so a town that is not shown still has room to build.
type Saved = { plots: Plot[]; next: number; epoch?: number; width?: number }
const ZERO: Score = { blocks: 0, houses: 0, trees: 0, castles: 0, creepers: 0, tools: 0 }

// Two terminals can show the town at once, each with its own copy. A save merges this copy into
// the stored one instead of writing over it: per plot, the newer version wins (a creeper's hole or
// a rebuild bumps `v`), and within one version the more built copy. Plots that would overlap keep
// the more built one. The castle is one plot whatever the band's width.
function mergeTowns(stored: Plot[], mine: Plot[]): Plot[] {
  const better = (a: Plot, b: Plot) => ((a.v ?? 0) !== (b.v ?? 0) ? (a.v ?? 0) > (b.v ?? 0) : a.progress >= b.progress)
  const keyOf = (p: Plot) => (p.kind === 'castle' ? 'castle' : `${p.x}`)
  const best = new Map<string, Plot>()
  for (const p of [...mine, ...stored]) {
    const key = keyOf(p)
    const had = best.get(key)
    if (!had) best.set(key, p)
    else if (had.kind === 'tree' && p.kind === 'tree') best.set(key, { ...had, plantedAt: Math.min(had.plantedAt ?? 0, p.plantedAt ?? 0) })
    else if (!better(had, p)) best.set(key, p)
  }
  const ranked = [...best.values()].sort((a, b) => (better(a, b) ? -1 : 1))
  const kept: Plot[] = []
  for (const p of ranked) {
    if (p.kind === 'castle') {
      kept.push(p)
      continue
    }
    const overlaps = kept.some(k => k.kind !== 'castle' && p.x <= k.x + widthOf(k.kind) && k.x <= p.x + widthOf(p.kind))
    if (!overlaps) kept.push(p)
  }
  // Keep this session's order (oldest first, for rebuilds), with the other terminal's plots after it.
  const order = [...best.values()]
  return order.filter(p => kept.includes(p))
}

// Writes what changed: the score as the stored one plus this session's gains, and the town merged
// with the stored one. Runs on its own timer, so a town that is not shown keeps its work too.
async function flush($: EngineInterface) {
  const map = (await $.store.get(scoped('town.map'))) as Saved | undefined
  if (map && (map.epoch ?? 0) > sim.epoch) {
    // Reset in another terminal: this copy is from before it, so it gives way.
    sim.epoch = map.epoch ?? 0
    sim.plots = Array.isArray(map.plots) ? copyPlots(map.plots) : []
    sim.next = map.next ?? 0
    sim.gain = { blocks: 0, houses: 0, trees: 0, castles: 0, creepers: 0 }
    sim.toolGain = 0
    sim.isDirty = false
    const fresh = ((await $.store.get(scoped('town.score'))) as Score | undefined) ?? ZERO
    await update($, score, () => fresh)
    sim.stats = statsLine(fresh)
    sim.tools = fresh.tools
    return
  }
  const g = sim.gain
  if (g.blocks + g.houses + g.trees + g.castles + g.creepers + sim.toolGain > 0) {
    sim.gain = { blocks: 0, houses: 0, trees: 0, castles: 0, creepers: 0 }
    const tools = sim.toolGain
    sim.toolGain = 0
    const old = ((await $.store.get(scoped('town.score'))) as Score | undefined) ?? ZERO
    const next: Score = {
      blocks: old.blocks + g.blocks,
      houses: old.houses + g.houses,
      trees: old.trees + g.trees,
      castles: old.castles + g.castles,
      creepers: old.creepers + g.creepers,
      tools: old.tools + tools,
    }
    await $.store.set(scoped('town.score'), next)
    await update($, score, () => next)
    sim.stats = statsLine(next)
    sim.tools = next.tools
    if (levelOf(next.blocks) !== levelOf(old.blocks)) {
      banner(levelOf(next.blocks).toUpperCase(), GOLD, 60)
      void notify($, `🏰 Your camp grew into a ${levelOf(next.blocks).toLowerCase()}: ${next.blocks} blocks.`)
    }
  }
  if (sim.isDirty) {
    sim.isDirty = false
    sim.plots = copyPlots(mergeTowns(map && Array.isArray(map.plots) ? map.plots : [], sim.plots))
    sim.next = Math.max(sim.next, map?.next ?? 0)
    const saved: Saved = { plots: sim.plots, next: sim.next, epoch: sim.epoch, width: sim.W }
    await $.store.set(scoped('town.map'), saved)
  }
}

// Clears this project's town and its score; the Arcade asks first (`/town reset`, then `/town reset yes`).
export async function reset($: EngineInterface) {
  sim.epoch = await $.clock.now()
  sim.plots = []
  sim.next = 0
  sim.villagers = []
  sim.creepers = []
  sim.gain = { blocks: 0, houses: 0, trees: 0, castles: 0, creepers: 0 }
  sim.toolGain = 0
  sim.isDirty = false
  sim.tools = 0
  const saved: Saved = { plots: [], next: 0, epoch: sim.epoch, width: sim.W }
  await $.store.set(scoped('town.map'), saved)
  await $.store.set(scoped('town.score'), ZERO)
  await update($, score, () => ZERO)
  await update($, feat, () => '')
  sim.stats = statsLine(ZERO)
}

type Show = 'tree' | 'finish' | 'castle' | 'whole'

async function celebrate($: EngineInterface, label: string, show: Show, isPractice = false) {
  sim.lastActivity = sim.t
  const counts = !isPractice
  if (show === 'tree') return plantTree(counts)
  if (show === 'finish') {
    // A medium moment finishes the building going up, or starts and finishes the next one.
    const p = site()
    if (p) {
      if (counts) sim.gain.blocks += Math.max(0, sizeOf(p) - p.progress)
      finish(p)
    }
    sim.isDirty = true
  } else raiseCastle(show === 'whole', counts)
  if (isPractice) return
  const what: Record<Show, string> = { tree: '', finish: 'a building finished', castle: 'the castle grows', whole: 'a castle raised' }
  await update($, feat, () => `${label}: ${what[show]}`)
  const say: Record<Show, string> = { tree: '', finish: 'Built', castle: 'The castle grows', whole: 'Castle' }
  void notify($, `🏰 ${label}! ${say[show]}!`)
}

// The bigger the moment, the bigger the build: a tree, a finished building, a third of a castle, a whole one.
const WHOLE = new Set(['merge', 'release', 'deploy', 'streak', 'record', 'squad'])
export async function celebrateMoments($: EngineInterface, found: Milestone[]) {
  for (const m of found) {
    if (m.tier === 'small') await celebrate($, m.label, 'tree')
    else if (m.tier === 'medium') await celebrate($, m.label, 'finish')
    else await celebrate($, m.label, WHOLE.has(m.kind) ? 'whole' : 'castle')
  }
}

// Plots from the store come back frozen; the town changes its own copies.
const copyPlots = (plots: readonly Plot[]): Plot[] => plots.map(p => ({ ...p }))

// ---- Hooks, chained by the Arcade's register with the other games' ----

export const start: Hook<'session.start'> = async ($, e, next) => {
  const saved = (await loadKept($, 'town.score')) as Score | undefined
  if (saved) await update($, score, () => saved)
  const s = saved ?? (await read($, score))
  sim.stats = statsLine(s)
  sim.tools = s.tools
  const map = (await loadKept($, 'town.map')) as Saved | undefined
  if (map && Array.isArray(map.plots)) {
    sim.plots = copyPlots(map.plots)
    sim.next = map.next ?? 0
    sim.epoch = map.epoch ?? 0
  }
  // Until the band is drawn, build to the width it last had (or a common one).
  if (sim.W === 0) sim.W = clamp(map?.width ?? 100, MIN_COLUMNS, MAX_COLUMNS)
  await $.command.register({
    name: 'town',
    description: 'Block Town above the prompt: the score. "/town build|tree|finish|castle|creeper" to show off, "/town reset" to start over.',
  })
  // Saving runs on its own clock, shown or not: every two seconds, only when something changed.
  $.clock.every(2000, () => void flush($))
  $.clock.every(FPS_MS, () => {
    const requestId = sim.requestId
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

export const command: MatchedHook<'command.run', { command: 'town' }> = async ($, e) => {
  const arg = (e.args ?? '').trim()
  if (arg === 'build') {
    work('main', 6, false)
    return { text: 'Practice: six blocks go up, nothing counts.' }
  }
  if (arg === 'creeper') {
    creeper(false)
    return { text: 'Practice: a creeper walks in, nothing counts.' }
  }
  const practice: Record<string, Show> = { tree: 'tree', finish: 'finish', castle: 'castle' }
  const show = practice[arg]
  if (show) {
    await celebrate($, 'Practice', show, true)
    return { text: 'Practice: nothing counts.' }
  }
  const s = await read($, score)
  const last = await read($, feat)
  return {
    text:
      `${statsLine(s)}${last ? `\nLast win: ${last}` : ''}\n` +
      'Your villagers build the town while Claude works: every tool call lays two blocks (an edit or a write three), and each subagent sends a helper of its own. ' +
      'A failed tool brings a creeper that blows a hole in a building, and the villagers build it back. A small moment plants a tree, and trees grow as the work goes on; ' +
      'a medium moment (a commit, a skill, a sent message) finishes the building going up, a big one raises a third of the castle and a merge, release or deploy the rest. ' +
      'The town is kept between sessions and shared by every terminal of this account; once the band is full, the oldest building is torn down and built again. "/town reset" starts over. ' +
      `The first word is the town's size (camp, hamlet, village, town, city); ▦ blocks laid, ⌂ houses, ♣ trees, ♜ castles, ⚒ tool calls.`,
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

// Every tool call is work on the town: the main agent's villager or, inside a subagent, its helper.
export const tool: Hook<'tool.call'> = async ($, e, next) => {
  const isMain = e.agentId === undefined
  if (isMain) sim.working += 1
  sim.lastActivity = sim.t
  const ran = await next(e).finally(() => {
    if (isMain) sim.working = Math.max(0, sim.working - 1)
    sim.lastActivity = sim.t
  })
  if (ran.deny !== undefined) return ran
  if (ran.isError === true) {
    creeper(true)
    return ran
  }
  work(isMain ? 'main' : String(e.agentId), e.tool === 'Edit' || e.tool === 'Write' ? 3 : 2)
  if (isMain) {
    // Counted here for the band at once; the next flush adds it to the stored score.
    sim.toolGain += 1
    const counted = await update($, score, old => ({ ...old, tools: old.tools + 1 }))
    sim.tools = counted.tools
    sim.stats = statsLine(counted)
  }
  return ran
}

// The town runs the full width of the band, above whatever else is there.
export const render: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  const below = await next(e)
  if (e.surface !== 'terminal' || e.props.hasSurvey || !(await isShown($, ID))) {
    sim.requestId = null
    return below
  }
  const { Box, Raster } = $.ui.resolve(e)
  sim.W = clamp(e.props.bodyColumns, MIN_COLUMNS, MAX_COLUMNS)
  sim.requestId = e.requestId
  sim.stats = statsLine(await read($, score))

  return (
    <Box flexDirection="column">
      <Raster key={RASTER} columns={sim.W} rows={ROWS} cells={frame(false, sim.stats)} />
      {below ?? null}
    </Box>
  )
}

export const game: Game = { id: ID, title: 'Block Town' }
