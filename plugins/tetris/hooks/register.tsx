import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Tally } from '../types'
import { configureMilestones, promptMilestones, skillSeen, streakMilestones, subagentMilestones, toolMilestones, turnMilestones } from './milestones'
import type { Milestone } from './milestones'

// A classic Tetris in a small handheld screen at the right end of the band above the
// prompt. Claude's work plays it: every tool drops a piece, a failed tool pushes up a
// garbage row, and the moments its milestones spot (a commit, a finished task list, a
// deploy) clear rows. The next piece is never shown: each one is a surprise.
const RASTER = 'well'
const G = 10 // the well's width, in blocks
const H = 8 // its depth, in blocks
// A block is 2 pixels wide and 1 high, so ten columns fit a band-sized screen.
const W = 2 + G * 2
// A pixel row each for the lid and the floor, so the well is a closed box.
const PIXEL_ROWS = H + 2
const ROWS = PIXEL_ROWS / 2
const FPS_MS = 66
// The terminal's own text colour, so it takes on whatever theme is set.
const INK = 0x01000000
const NONE = 0x01000000

const tally = atom({ plugin: 'tetris', key: 'tally' } as const, { score: 0, lines: 0, best: 0, games: 0 })
const isHidden = atom({ plugin: 'tetris', key: 'isHidden' } as const, false)

// A hidden game stays quiet: its notifications are hidden too.
async function notify($: EngineInterface, text: string) {
  if (!(await read($, isHidden))) $.ui.toast(text)
}

// The classic scoring for 1 to 4 lines at once, times the level plus one.
const LINE_SCORE = [0, 40, 100, 300, 1200]
// Rows a milestone clears from the bottom.
const CLEARS = { small: 0, medium: 1, big: 3 }

type Cell = readonly [number, number] // [row, column]
const SHAPES: Cell[][] = [
  [[0, 0], [0, 1], [0, 2], [0, 3]], // I
  [[0, 0], [0, 1], [1, 0], [1, 1]], // O
  [[0, 0], [0, 1], [0, 2], [1, 1]], // T
  [[0, 1], [0, 2], [1, 0], [1, 1]], // S
  [[0, 0], [0, 1], [1, 1], [1, 2]], // Z
  [[0, 0], [0, 1], [0, 2], [1, 0]], // L
  [[0, 0], [0, 1], [0, 2], [1, 2]], // J
]
const normalise = (cells: Cell[]): Cell[] => {
  const r0 = Math.min(...cells.map(c => c[0]))
  const c0 = Math.min(...cells.map(c => c[1]))
  return cells.map(([r, c]) => [r - r0, c - c0] as const)
}
const keyOf = (cells: Cell[]) => JSON.stringify([...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]))
const rotations = (shape: Cell[]): Cell[][] => {
  const out: Cell[][] = []
  let cur = normalise(shape)
  for (let i = 0; i < 4; i++) {
    if (!out.some(o => keyOf(o) === keyOf(cur))) out.push(cur)
    cur = normalise(cur.map(([r, c]) => [c, -r] as const))
  }
  return out
}
const ROTATIONS = SHAPES.map(rotations)
const widthOf = (cells: Cell[]) => Math.max(...cells.map(c => c[1])) + 1

type Piece = { cells: Cell[]; col: number; targetCol: number; row: number; targetRow: number }
type Grid = number[][] // [row][col]: 0 empty, 1 block, 2 garbage

const emptyGrid = (): Grid => Array.from({ length: H }, () => Array<number>(G).fill(0))

const sim = {
  t: 0,
  grid: emptyGrid(),
  queue: 0,
  bombs: [] as number[],
  garbage: 0,
  active: null as Piece | null,
  flash: null as null | { rows: number[]; until: number; isBomb: boolean },
  wipe: -1,
  requestId: null as string | null,
  isBlitting: false,
}

const isFree = (grid: Grid, cells: Cell[], row: number, col: number) =>
  cells.every(([r, c]) => {
    const y = row + r
    const x = col + c
    if (x < 0 || x >= G || y >= H) return false
    return y < 0 || grid[y]![x] === 0
  })

// Drops a piece straight down a column: the row it comes to rest at.
function landing(grid: Grid, cells: Cell[], col: number): number {
  let row = -2
  while (isFree(grid, cells, row + 1, col)) row += 1
  return row
}

const fullRows = (grid: Grid) => [...Array(H).keys()].filter(r => grid[r]!.every(v => v !== 0))

// Where to put the piece: the well-known weights for height, lines, holes and bumpiness.
function choose(shape: number): Piece | null {
  let best: { piece: Piece; value: number } | null = null
  for (const cells of ROTATIONS[shape]!) {
    for (let col = 0; col + widthOf(cells) <= G; col++) {
      const row = landing(sim.grid, cells, col)
      if (cells.some(([r]) => row + r < 0)) continue
      const grid = sim.grid.map(r => [...r])
      for (const [r, c] of cells) grid[row + r]![col + c] = 1
      const lines = fullRows(grid).length
      const heights = [...Array(G).keys()].map(c => {
        const top = grid.findIndex(r => r[c] !== 0)
        return top < 0 ? 0 : H - top
      })
      let holes = 0
      for (let c = 0; c < G; c++) {
        let isUnder = false
        for (let r = 0; r < H; r++) {
          if (grid[r]![c]) isUnder = true
          else if (isUnder) holes += 1
        }
      }
      const bump = heights.slice(1).reduce((s, height, i) => s + Math.abs(height - heights[i]!), 0)
      const value = -0.51 * heights.reduce((s, height) => s + height, 0) + 0.76 * lines - 0.36 * holes - 0.18 * bump
      if (!best || value > best.value) {
        const start = Math.floor((G - widthOf(cells)) / 2)
        best = { piece: { cells, col: start, targetCol: col, row: -2, targetRow: row }, value }
      }
    }
  }
  return best?.piece ?? null
}

function removeRows(rows: number[]) {
  const doomed = new Set(rows)
  const kept = sim.grid.filter((_, i) => !doomed.has(i))
  sim.grid = [...Array.from({ length: H - kept.length }, () => Array<number>(G).fill(0)), ...kept]
}

async function scoreLines($: EngineInterface, lines: number, isBomb: boolean) {
  if (lines === 0) return
  const before = await read($, tally)
  const level = Math.floor(before.lines / 10)
  const points = isBomb ? 50 * lines * (level + 1) : LINE_SCORE[Math.min(4, lines)]! * (level + 1)
  const saved = await update($, tally, old => ({ ...old, score: old.score + points, lines: old.lines + lines }))
  await $.store.set('tally', saved)
  if (!isBomb && lines >= 4) void notify($, '🧱 TETRIS! Four lines at once')
  if (Math.floor(saved.lines / 10) > level) void notify($, `🧱 Level ${Math.floor(saved.lines / 10)}`)
}

async function gameOver($: EngineInterface) {
  sim.wipe = 0
  sim.active = null
  const saved = await update($, tally, old => ({
    score: 0,
    lines: 0,
    best: Math.max(old.best, old.score),
    games: old.games + 1,
  }))
  await $.store.set('tally', saved)
  void notify($, `🧱 Game over. Best ${saved.best}`)
}

// Medium moments clear a row from the bottom, big ones three.
async function onMilestone($: EngineInterface, tier: string, _kind: string, label: string) {
  const rows = CLEARS[tier as keyof typeof CLEARS] ?? 0
  if (rows === 0) return
  sim.bombs.push(rows)
  void notify($, `🧱 ${label}: ${rows} row${rows > 1 ? 's' : ''} cleared`)
}

function step($: EngineInterface) {
  sim.t += 1
  const { t } = sim

  // Game over: the well empties from the top down, a row a frame.
  if (sim.wipe >= 0) {
    if (sim.wipe < H) sim.grid[sim.wipe] = Array<number>(G).fill(0)
    sim.wipe = sim.wipe >= H ? -1 : sim.wipe + 1
    return
  }
  if (sim.flash) {
    if (t < sim.flash.until) return
    const { rows, isBomb } = sim.flash
    sim.flash = null
    removeRows(rows)
    void scoreLines($, rows.length, isBomb)
    return
  }
  if (sim.active) {
    const piece = sim.active
    const isFast = sim.queue > 1
    if (piece.col !== piece.targetCol) {
      // Slide across at the top first, then fall.
      if (t % 2 === 0 || isFast) piece.col += piece.targetCol > piece.col ? 1 : -1
    } else if (piece.row < piece.targetRow) {
      piece.row = Math.min(piece.targetRow, piece.row + (isFast ? 2 : 1))
    } else {
      for (const [r, c] of piece.cells) sim.grid[piece.row + r]![piece.col + c] = 1
      sim.active = null
      const rows = fullRows(sim.grid)
      if (rows.length > 0) sim.flash = { rows, until: t + 8, isBomb: false }
    }
    return
  }

  // A failed tool pushes up a garbage row with one gap in it.
  if (sim.garbage > 0) {
    sim.garbage -= 1
    const isFull = sim.grid[0]!.some(v => v !== 0)
    const gap = Math.floor(Math.random() * G)
    sim.grid = [...sim.grid.slice(1), Array.from({ length: G }, (_, c) => (c === gap ? 0 : 2))]
    if (isFull) void gameOver($)
    return
  }
  // A milestone clears rows from the bottom.
  if (sim.bombs.length > 0) {
    const n = sim.bombs.shift()!
    const rows = [...Array(H).keys()].reverse().filter(r => sim.grid[r]!.some(v => v !== 0)).slice(0, n)
    if (rows.length > 0) sim.flash = { rows, until: t + 10, isBomb: true }
    return
  }
  if (sim.queue > 0) {
    sim.queue -= 1
    // A surprise: the shape is picked only as it enters.
    const piece = choose(Math.floor(Math.random() * SHAPES.length))
    if (!piece) {
      void gameOver($)
      return
    }
    sim.active = piece
  }
}

function frame(): string {
  const ink = new Uint8Array(W * PIXEL_ROWS)
  const block = (r: number, c: number, kind: number) => {
    if (r < 0 || r >= H) return
    for (let dx = 0; dx < 2; dx++) {
      // Garbage is drawn half-filled, so it reads grey in one colour.
      if (kind === 2 && (dx + r) % 2 === 1) continue
      ink[(1 + r) * W + 1 + c * 2 + dx] = 1
    }
  }
  // The well: a closed box, lid, walls and floor, like a handheld's screen.
  for (let y = 0; y < PIXEL_ROWS; y++) {
    ink[y * W] = 1
    ink[y * W + W - 1] = 1
  }
  for (let x = 0; x < W; x++) {
    ink[x] = 1
    ink[(PIXEL_ROWS - 1) * W + x] = 1
  }

  const blink = sim.flash && Math.floor(sim.t / 2) % 2 === 0
  sim.grid.forEach((row, r) =>
    row.forEach((v, c) => {
      if (!v || (blink && sim.flash!.rows.includes(r))) return
      block(r, c, v)
    }),
  )
  const piece = sim.active
  if (piece) for (const [r, c] of piece.cells) block(piece.row + r, piece.col + c, 1)

  // Pack: half blocks in the terminal's own colour, nothing behind them.
  const words = new Uint32Array(W * ROWS * 3)
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = (cy * W + cx) * 3
      const top = ink[cy * 2 * W + cx] === 1
      const bottom = ink[(cy * 2 + 1) * W + cx] === 1
      words[i] = top && bottom ? 0x2588 : top ? 0x2580 : bottom ? 0x2584 : 0x20
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

const centred = (text: string) => ' '.repeat(Math.max(0, Math.floor((W - text.length) / 2))) + text

// Hands each moment the session's milestones spotted to the game.
async function celebrateAll($: EngineInterface, found: Milestone[]) {
  for (const m of found) await onMilestone($, m.tier, m.kind, m.label)
}

export const register: Register = (on, options) => {
  configureMilestones(options)

  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('tally')) as Tally | undefined
    if (saved) await update($, tally, () => saved)
    await $.command.register({
      name: 'tetris',
      description: 'The Tetris above the prompt: the score. "/tetris drop" adds pieces, "/tetris clear" clears a row, "/tetris hide|show" to put it away or bring it back.',
    })
    $.clock.every(FPS_MS, () => {
      step($)
      const requestId = sim.requestId
      if (requestId === null || sim.isBlitting) return
      sim.isBlitting = true
      void $.ui.blit({ requestId, key: RASTER, cells: frame() })
        .then(r => {
          if (r.deny !== undefined) sim.requestId = null
        })
        .finally(() => {
          sim.isBlitting = false
        })
    })

    // Days in a row: counted once a day, at the session's start.
    const streak = streakMilestones((await $.store.get('days')) as { last: string; streak: number } | undefined, await $.clock.now())
    await $.store.set('days', streak.days)
    await celebrateAll($, streak.found)

    return next(e)
  })

  on('skill.prompt', (_$, e, next) => {
    skillSeen(e.skill)
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const ran = await next(e)
    await celebrateAll($, subagentMilestones())
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    const ran = await next(e)
    await celebrateAll($, promptMilestones(String(e.text ?? ''), await $.clock.now()))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && !e.isAborted) await celebrateAll($, turnMilestones(await $.clock.now()))
    return ran
  })

  on('command.run', { command: 'tetris' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (arg === 'drop') {
      sim.queue += 3
      return { text: 'Three pieces on their way.' }
    }
    if (arg === 'clear') {
      sim.bombs.push(1)
      return { text: 'One row cleared from the bottom.' }
    }
    // Two explicit commands, not a toggle, so a repeat never flips it back by surprise.
    if (arg === 'hide' || arg === 'show') {
      const wantHidden = arg === 'hide'
      if ((await read($, isHidden)) === wantHidden) {
        return { text: wantHidden ? 'The handheld is already hidden. "/tetris show" brings it back.' : 'The handheld is already showing.' }
      }
      await update($, isHidden, () => wantHidden)
      return { text: wantHidden ? 'The handheld goes in your pocket.' : 'The handheld is back.' }
    }
    const t = await read($, tally)

    return {
      text:
        `▤ ${t.lines} lines · ◆ ${t.score} · Lv ${Math.floor(t.lines / 10)} · best ${t.best}\n` +
        'Every tool Claude runs drops a piece; a full row clears. A failed tool pushes up a garbage row. ' +
        'Medium moments (a commit, a skill, a sent message) clear a row, big ones (a merge, a deploy, a finished task list) clear three.',
    }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined) await celebrateAll($, toolMilestones(e, ran))
    if (e.agentId !== undefined || ran.deny !== undefined) return ran
    if (ran.isError === true) sim.garbage += 1
    else sim.queue += 1
    return ran
  })

  // The handheld sits at the right end of the band, beside whatever else is there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'terminal' || e.props.hasSurvey || (await read($, isHidden))) {
      sim.requestId = null
      return below
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    sim.requestId = e.requestId
    const t = await read($, tally)

    return (
      <Box flexDirection="row" alignItems="flex-end">
        <Box flexGrow={1} flexDirection="column">
          {below ?? null}
        </Box>
        <Box flexDirection="column" flexShrink={0} minWidth={W} marginLeft={2}>
          <Raster key={RASTER} columns={W} rows={ROWS} cells={frame()} />
          <Text key="stats" dimColor wrap="truncate">
            {centred(`▤ ${t.lines}  ◆ ${t.score}  Lv ${Math.floor(t.lines / 10)}`)}
          </Text>
        </Box>
      </Box>
    )
  })
}
