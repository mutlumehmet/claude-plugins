// Bug Command's sky: the surface module the band's Client runs. It owns the game loop, so it
// can take the person's clicks and keys; the hooks module (games/bug-command.tsx) only hands
// it what happened in the session as props and keeps the score it posts back. No `$` here.
//
// Built by scripts/build.sh into hooks/bug-sky.js, beside hooks/arcade.js.

import type { ClientKeyEvent, ClientModule, ClientPointerEvent, ClientSurface, RenderElement, RenderNode } from 'claude-code'

// What the hooks module hands the sky. `events` are the session's latest, oldest first, each with
// an id that only grows, so the sky plays each once.
export type SkyEvent = { id: number; kind: 'tool' | 'fail' | 'small' | 'medium' | 'big'; practice: boolean }
export type SkyProps = { events: SkyEvent[]; stats: string; working: boolean; cities: number; columns: number }
// What the sky posts back: what changed since its last post.
export type SkyGain = { kills: number; mine: number; lost: number; ends: number; cities: number }

const ROWS = 8
const PH = ROWS * 2
const TICK_MS = 66
const GROUND = PH - 1
const CITY_TOP = PH - 4
const SKY_FLOOR = CITY_TOP - 1
const CITIES = 6
const SHOT_SPEED = 1.8
const COOLDOWN = 5

const SAND = '#c2a14d'
const SILO = '#d9a441'
const CITY = '#4dabf7'
const RUBBLE = '#6b6b6b'
const BUG_TRAIL = '#a8323e'
const BUG_HEAD = '#ff6b6b'
const SHOT_TRAIL = '#4c6ef5'
const SHOT_HEAD = '#ffffff'
const CROSS = '#69db7c'
const GREY = '#8a8a8a'
const GOLD = '#ffd43b'
const BLAST = ['#ffffff', '#ffd43b', '#ff922b', '#f06595', '#cc5de8']

type Owner = 'you' | 'auto' | 'practice'
type Bug = { x0: number; y0: number; x: number; y: number; vx: number; vy: number; target: number; isReal: boolean }
type Shot = { x0: number; y0: number; x: number; y: number; tx: number; ty: number; owner: Owner; isMiss: boolean }
type Blast = { x: number; y: number; age: number; max: number; owner: Owner }
type Plan = { at: number; kind: 'sure' | 'salvo'; owner: Owner }

type Sky = {
  t: number
  W: number
  seen: number
  cities: boolean[]
  silos: number[]
  cooldown: number[]
  bugs: Bug[]
  shots: Shot[]
  blasts: Blast[]
  plans: Plan[]
  banner: null | { text: string; color: string; until: number }
  cross: { x: number; y: number }
  hasFired: boolean
  nextBug: number
  endAt: number
  gain: SkyGain
  props: SkyProps
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// Cities and silos spread over the width: a silo at each end and in the middle, three cities
// between each pair.
function layout(W: number) {
  const silos = [2, Math.floor(W / 2), W - 3]
  const xs: number[] = []
  for (const [a, b] of [[silos[0]!, silos[1]!], [silos[1]!, silos[2]!]] as const) {
    for (let i = 1; i <= 3; i++) xs.push(Math.round(a + ((b - a) * i) / 4) - 2)
  }
  return { silos, cityX: xs }
}

function create(props: SkyProps): Sky {
  const W = Math.max(24, props.columns)
  const standing = clamp(props.cities, 0, CITIES)
  return {
    t: 0,
    W,
    seen: props.events.reduce((m, e) => Math.max(m, e.id), 0),
    cities: Array.from({ length: CITIES }, (_, i) => i < standing || standing === 0),
    silos: layout(W).silos,
    cooldown: [0, 0, 0],
    bugs: [],
    shots: [],
    blasts: [],
    plans: [],
    banner: null,
    cross: { x: Math.floor(W / 2), y: 4 },
    hasFired: false,
    nextBug: 40,
    endAt: -1,
    gain: { kills: 0, mine: 0, lost: 0, ends: 0, cities: standing === 0 ? CITIES : standing },
    props,
  }
}

const cityX = (s: Sky, i: number) => layout(s.W).cityX[i]!

function banner(s: Sky, text: string, color: string, frames: number) {
  s.banner = { text, color, until: s.t + frames }
}

// A bug falls from the top towards a standing city; a failed tool's falls faster.
function dropBug(s: Sky, isReal: boolean, fast = false) {
  const alive = s.cities.map((c, i) => (c ? i : -1)).filter(i => i >= 0)
  if (alive.length === 0) return
  const target = alive[Math.floor(Math.random() * alive.length)]!
  const x0 = rand(1, s.W - 2)
  const tx = cityX(s, target) + 2
  const frames = fast ? rand(70, 100) : rand(130, 200)
  const vy = (SKY_FLOOR + 2) / frames
  s.bugs.push({ x0, y0: 0, x: x0, y: 0, vx: (tx - x0) / frames, vy, target, isReal })
}

function nearestSilo(s: Sky, x: number) {
  let best = -1
  for (let i = 0; i < s.silos.length; i++) {
    if (s.cooldown[i]! > 0) continue
    if (best < 0 || Math.abs(s.silos[i]! - x) < Math.abs(s.silos[best]! - x)) best = i
  }
  return best
}

function fire(s: Sky, tx: number, ty: number, owner: Owner, isMiss = false, silo = nearestSilo(s, tx)) {
  if (silo < 0) return false
  const sx = s.silos[silo]!
  s.cooldown[silo] = owner === 'you' ? COOLDOWN : 0
  s.shots.push({ x0: sx, y0: SKY_FLOOR + 1, x: sx, y: SKY_FLOOR + 1, tx: clamp(tx, 0, s.W - 1), ty: clamp(ty, 0, SKY_FLOOR), owner, isMiss })
  return true
}

// Claude's own shot: aimed where the bug will be when the shot gets there, or a little off.
function autoShot(s: Sky, bug: Bug, owner: Owner, isMiss: boolean) {
  const silo = s.silos.reduce((b, x, i) => (Math.abs(x - bug.x) < Math.abs(s.silos[b]! - bug.x) ? i : b), 0)
  let tx = bug.x
  let ty = bug.y
  for (let k = 0; k < 3; k++) {
    const frames = Math.hypot(tx - s.silos[silo]!, ty - (SKY_FLOOR + 1)) / SHOT_SPEED
    tx = bug.x + bug.vx * frames
    ty = bug.y + bug.vy * frames
  }
  if (isMiss) tx += (Math.random() < 0.5 ? -1 : 1) * rand(6, 9)
  fire(s, tx, ty, owner, isMiss, silo)
}

// The lowest bug is the most urgent.
const lowest = (s: Sky) => s.bugs.reduce<Bug | undefined>((b, x) => (b === undefined || x.y > b.y ? x : b), undefined)

function play(s: Sky, e: SkyEvent) {
  const owner: Owner = e.practice ? 'practice' : 'auto'
  if (e.kind === 'tool') {
    // Every finished tool call is a shot from Claude's battery; most of them hit.
    const bug = lowest(s)
    if (bug) autoShot(s, bug, owner, Math.random() < 0.4)
  } else if (e.kind === 'fail') {
    dropBug(s, !e.practice, true)
    banner(s, 'INCOMING', BUG_HEAD, 30)
  } else if (e.kind === 'small') {
    const bug = lowest(s)
    if (bug) autoShot(s, bug, owner, false)
    else s.blasts.push({ x: rand(4, s.W - 4), y: rand(2, 7), age: 0, max: 2, owner: 'practice' })
  } else if (e.kind === 'medium') {
    if (s.bugs.length === 0) dropBug(s, !e.practice)
    s.plans.push({ at: s.t + 20, kind: 'sure', owner })
  } else {
    if (s.bugs.length === 0) {
      dropBug(s, !e.practice)
      dropBug(s, !e.practice)
    }
    s.plans.push({ at: s.t + 20, kind: 'salvo', owner })
    // A big moment rebuilds a city.
    const ruined = s.cities.findIndex(c => !c)
    if (ruined >= 0 && !e.practice) {
      s.cities[ruined] = true
      s.gain.cities = s.cities.filter(Boolean).length
      banner(s, 'BONUS CITY', GOLD, 60)
    } else banner(s, 'SKY CLEAR!', GOLD, 60)
  }
}

function step(s: Sky) {
  s.t += 1
  for (let i = 0; i < s.cooldown.length; i++) s.cooldown[i] = Math.max(0, s.cooldown[i]! - 1)

  for (const p of s.plans.filter(p => p.at <= s.t)) {
    if (p.kind === 'sure') {
      const bug = lowest(s)
      if (bug) autoShot(s, bug, p.owner, false)
    } else for (const bug of s.bugs) autoShot(s, bug, p.owner, false)
  }
  s.plans = s.plans.filter(p => p.at > s.t)

  // While Claude works, a bug falls now and then.
  if (s.props.working && s.endAt < 0 && s.t >= s.nextBug && s.bugs.length < 3) {
    dropBug(s, true)
    s.nextBug = s.t + Math.floor(rand(120, 260))
  }

  for (const shot of s.shots) {
    const dx = shot.tx - shot.x
    const dy = shot.ty - shot.y
    const d = Math.hypot(dx, dy)
    if (d <= SHOT_SPEED) {
      shot.x = shot.tx
      shot.y = shot.ty
      s.blasts.push({ x: shot.tx, y: shot.ty, age: 0, max: 3, owner: shot.owner })
    } else {
      shot.x += (dx / d) * SHOT_SPEED
      shot.y += (dy / d) * SHOT_SPEED
    }
  }
  s.shots = s.shots.filter(shot => shot.x !== shot.tx || shot.y !== shot.ty)

  for (const bug of s.bugs) {
    bug.x += bug.vx
    bug.y += bug.vy
  }

  // A blast grows, holds and shrinks; any bug head inside it goes off in a blast of its own.
  for (const b of s.blasts) b.age += 1
  const radius = (b: Blast) => {
    const r = [1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1][b.age] ?? 0
    return Math.min(r, b.max)
  }
  const chained: Blast[] = []
  s.bugs = s.bugs.filter(bug => {
    const hit = s.blasts.find(b => radius(b) > 0 && Math.hypot(bug.x - b.x, bug.y - b.y) <= radius(b) + 0.5)
    if (!hit) return true
    chained.push({ x: bug.x, y: bug.y, age: 0, max: 2, owner: hit.owner })
    if (bug.isReal && hit.owner !== 'practice') {
      s.gain.kills += 1
      if (hit.owner === 'you') s.gain.mine += 1
    }
    return false
  })
  s.blasts = [...s.blasts.filter(b => b.age < 11), ...chained]

  // A bug that reaches its city ruins it.
  s.bugs = s.bugs.filter(bug => {
    if (bug.y < SKY_FLOOR + 1) return true
    s.blasts.push({ x: bug.x, y: SKY_FLOOR + 1, age: 0, max: 3, owner: 'practice' })
    if (bug.isReal && s.cities[bug.target]) {
      s.cities[bug.target] = false
      s.gain.lost += 1
      s.gain.cities = s.cities.filter(Boolean).length
    }
    return false
  })

  // Every city gone: THE END, then the cities are rebuilt for a new round.
  if (s.endAt < 0 && s.cities.every(c => !c)) {
    s.endAt = s.t + 60
    s.bugs = []
    s.gain.ends += 1
    banner(s, 'THE END', BUG_HEAD, 60)
  }
  if (s.endAt >= 0 && s.t >= s.endAt) {
    s.endAt = -1
    s.cities = s.cities.map(() => true)
    s.gain.cities = CITIES
    banner(s, 'NEW CITIES', CITY, 40)
  }
}

const isBusy = (s: Sky) =>
  s.bugs.length > 0 || s.shots.length > 0 || s.blasts.length > 0 || s.plans.length > 0 || s.endAt >= 0 || (s.banner !== null && s.t < s.banner.until)

// ---- Drawing: a pixel grid two pixels to a cell, packed into runs of half blocks ----

const CITY_SHAPES = [
  ['.#.#.', '#####', '#####'],
  ['..#..', '.###.', '#####'],
  ['#..#.', '##.##', '#####'],
]

function draw(s: Sky, el: ClientSurface<{ sky: Sky; frame: number }>['elements']): RenderElement {
  const { Box, Text } = el
  const W = s.W
  const px: (string | null)[] = new Array(W * PH).fill(null)
  const put = (x: number, y: number, c: string) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && x < W && y >= 0 && y < PH) px[y * W + x] = c
  }
  const line = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
    for (let i = 0; i <= n; i++) put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c)
  }
  const glyphs = new Map<number, { ch: string; color: string }>()
  const text = (x: number, row: number, str: string, color: string) =>
    [...str].forEach((ch, i) => {
      if (x + i >= 0 && x + i < W && row >= 0 && row < ROWS) glyphs.set(row * W + x + i, { ch, color })
    })

  for (let x = 0; x < W; x++) put(x, GROUND, SAND)
  s.cities.forEach((alive, i) => {
    const x = cityX(s, i)
    if (alive) {
      CITY_SHAPES[i % CITY_SHAPES.length]!.forEach((row, dy) => {
        for (let dx = 0; dx < 5; dx++) if (row[dx] === '#') put(x + dx, CITY_TOP + dy, CITY)
      })
    } else for (let dx = 0; dx < 5; dx += 2) put(x + dx, GROUND - 1, RUBBLE)
  })
  for (const [i, sx] of s.silos.entries()) {
    for (let dx = -2; dx <= 2; dx++) put(sx + dx, GROUND - 1, SILO)
    for (let dx = -1; dx <= 1; dx++) put(sx + dx, GROUND - 2, s.cooldown[i]! > 0 ? GREY : SILO)
  }
  for (const bug of s.bugs) {
    line(bug.x0, bug.y0, bug.x, bug.y, BUG_TRAIL)
    put(bug.x, bug.y, s.t % 6 < 3 ? BUG_HEAD : SHOT_HEAD)
  }
  for (const shot of s.shots) {
    line(shot.x0, shot.y0, shot.x, shot.y, SHOT_TRAIL)
    put(shot.x, shot.y, SHOT_HEAD)
    if (shot.owner === 'you') put(shot.tx, shot.ty, CROSS)
  }
  for (const b of s.blasts) {
    const r = Math.min([1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1][b.age] ?? 0, b.max)
    const c = BLAST[(b.age + Math.round(b.x)) % BLAST.length]!
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) put(b.x + dx, b.y + dy, c)
  }
  // The crosshair, where a key shot would go.
  const { x: cx, y: cy } = s.cross
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) put(cx + dx, cy + dy, CROSS)

  const standing = s.cities.filter(Boolean).length
  const stats = `${s.props.stats}  ⌂ ${standing}`
  text(W - stats.length - 1, 0, stats, GREY)
  if (!s.hasFired && s.bugs.some(b => b.isReal)) text(1, 0, 'click to fire', GREY)
  if (s.banner && s.t < s.banner.until && (s.banner.until - s.t) % 8 > 1) {
    text(Math.floor((W - s.banner.text.length) / 2), 1, s.banner.text, s.banner.color)
  }

  // Each row: runs of cells with the same look, one Text each.
  const rows: RenderNode[] = []
  for (let row = 0; row < ROWS; row++) {
    const runs: RenderNode[] = []
    let run = ''
    let look = ''
    let fg: string | undefined
    let bg: string | undefined
    const flush = () => {
      // Only the colours a run has: no prop is handed over undefined.
      if (run) runs.push(<Text {...(fg ? { color: fg } : {})} {...(bg ? { backgroundColor: bg } : {})}>{run}</Text>)
      run = ''
    }
    for (let x = 0; x < W; x++) {
      const g = glyphs.get(row * W + x)
      const top = px[row * 2 * W + x] ?? null
      const bottom = px[(row * 2 + 1) * W + x] ?? null
      let ch: string
      let f: string | undefined
      let b: string | undefined
      if (g) [ch, f, b] = [g.ch, g.color, undefined]
      else if (top === null && bottom === null) [ch, f, b] = [' ', undefined, undefined]
      else if (top === bottom) [ch, f, b] = ['█', top!, undefined]
      else if (bottom === null) [ch, f, b] = ['▀', top!, undefined]
      else if (top === null) [ch, f, b] = ['▄', bottom, undefined]
      else [ch, f, b] = ['▀', top, bottom]
      const next = `${f ?? ''}|${b ?? ''}`
      if (next !== look) {
        flush()
        look = next
        fg = f
        bg = b
      }
      run += ch
    }
    flush()
    rows.push(<Box flexDirection="row">{runs}</Box>)
  }
  return <Box flexDirection="column">{rows}</Box>
}

// ---- The module ----

type State = { sky: Sky; frame: number }

const BugSky: ClientModule<SkyProps, State> = (props, surface) => {
  if (surface.state === undefined) {
    const sky = create(props)
    const redraw = () => surface.setState({ sky, frame: sky.t })
    // Posts what changed since the last post: counts as deltas, the standing cities as they are.
    let posted = props.cities
    const post = () => {
      const g = sky.gain
      if (g.kills + g.mine + g.lost + g.ends === 0 && g.cities === posted) return
      surface.post({ ...g })
      posted = g.cities
      sky.gain = { kills: 0, mine: 0, lost: 0, ends: 0, cities: g.cities }
    }
    surface.every(TICK_MS, () => {
      // The newest props: events not played yet.
      for (const e of sky.props.events) {
        if (e.id <= sky.seen) continue
        sky.seen = e.id
        play(sky, e)
      }
      const wasBusy = isBusy(sky)
      step(sky)
      post()
      // A still sky does not redraw.
      if (wasBusy || isBusy(sky)) redraw()
    })
    surface.onPointer((e: ClientPointerEvent) => {
      const y = e.fine ? Math.floor(e.fine.y * 2) : e.y * 2 + 1
      sky.cross = { x: clamp(e.x, 0, sky.W - 1), y: clamp(y, 0, SKY_FLOOR) }
      if (e.type === 'down' && e.button === 'left' && fire(sky, sky.cross.x, sky.cross.y, 'you')) sky.hasFired = true
      redraw()
    })
    surface.onKey((e: ClientKeyEvent) => {
      const move: Record<string, [number, number]> = { left: [-2, 0], right: [2, 0], up: [0, -1], down: [0, 1] }
      const m = move[e.key]
      if (m) sky.cross = { x: clamp(sky.cross.x + m[0] * (e.shift ? 4 : 1), 0, sky.W - 1), y: clamp(sky.cross.y + m[1], 0, SKY_FLOOR) }
      else if (e.key === ' ' || e.key === 'return') {
        if (fire(sky, sky.cross.x, sky.cross.y, 'you')) sky.hasFired = true
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        if (fire(sky, sky.cross.x, sky.cross.y, 'you', false, sky.cooldown[Number(e.key) - 1] === 0 ? Number(e.key) - 1 : -1)) sky.hasFired = true
      } else return
      redraw()
    })
    surface.setState({ sky, frame: 0 })
    return draw(sky, surface.elements)
  }
  const sky = surface.state.sky
  sky.props = props
  // The band changed width: lay the ground out again, keeping the game.
  const W = Math.max(24, surface.columns || props.columns)
  if (W !== sky.W) {
    sky.W = W
    sky.silos = layout(W).silos
    sky.cross.x = clamp(sky.cross.x, 0, W - 1)
  }
  return draw(sky, surface.elements)
}

export default BugSky
