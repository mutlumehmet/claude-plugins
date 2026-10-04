import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bank } from '../types'
import { PALETTE, SYMBOLS, SYMBOL_SIZE } from './symbols'
import type { SymbolId } from './symbols'
import { configureMilestones, promptMilestones, skillSeen, streakMilestones, subagentMilestones, toolMilestones, turnMilestones } from './milestones'
import type { Milestone } from './milestones'

const RASTER = 'machine'
const FPS_MS = 66
// 28 by 12 pixels: three rows of headroom for coins and the win text, then the machine.
const W = 28
// The lights sit right above and right below the reel window, no strip between.
const H = 12
const ROWS = H / 2
const TOP = 3
// The reel window: the symbol with a pixel of air above it, so the lights never touch it.
const WINDOW = SYMBOL_SIZE + 1
const REEL_W = 8
const PERIOD = SYMBOL_SIZE + 2
const CLEAR = -1
const DEFAULT = 0x01000000

const bank = atom({ plugin: 'jackpot', key: 'bank' } as const, { chips: 0, spins: 0, jackpots: 0, best: 0, streak: 0 })
const golden = atom({ plugin: 'jackpot', key: 'golden' } as const, 0)
const last = atom({ plugin: 'jackpot', key: 'last' } as const, '')
const isHidden = atom({ plugin: 'jackpot', key: 'isHidden' } as const, false)

const ORDER: SymbolId[] = ['seven', 'dragon', 'diamond', 'bell', 'star', 'cherry']
const TRIPLE_PAY: Record<SymbolId, number> = { seven: 100, dragon: 50, diamond: 25, bell: 15, star: 10, cherry: 8 }
// Each reel's strip, so a spin scrolls past real neighbours.
const STRIPS: SymbolId[][] = [
  ['cherry', 'star', 'seven', 'bell', 'cherry', 'diamond', 'star', 'dragon', 'bell', 'cherry', 'star', 'diamond'],
  ['star', 'cherry', 'bell', 'dragon', 'cherry', 'star', 'seven', 'diamond', 'cherry', 'bell', 'star', 'diamond'],
  ['bell', 'diamond', 'cherry', 'star', 'seven', 'cherry', 'bell', 'star', 'dragon', 'cherry', 'diamond', 'star'],
]


type Win = 'none' | 'pair' | 'triple' | 'jackpot'
type Spin = { isGolden: boolean; isPractice: boolean; forced?: SymbolId[] }
type Reel = { from: number; to: number; start: number; frames: number; landedAt: number }
type Coin = { x: number; y: number; vx: number; vy: number; age: number }

const sim = {
  t: 0,
  queue: [] as Spin[],
  spin: null as null | Spin,
  reels: [0, 0, 0].map((_, i) => ({ from: i * 2 * PERIOD, to: i * 2 * PERIOD, start: -100, frames: 1, landedAt: -100 })) as Reel[],
  result: ['seven', 'seven', 'seven'] as SymbolId[],
  win: 'none' as Win,
  winUntil: -1,
  payout: 0,
  coins: [] as Coin[],
  hadError: false,
  requestId: null as string | null,
  isBlitting: false,
  isLooping: false,
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!
const cycle = <T,>(frames: T[], n: number) => frames[Math.floor(sim.t / n) % frames.length]!
const multiplier = (streak: number) => Math.min(5, 1 + Math.floor(streak / 5))

// The odds are set by outcome first, then the symbols are picked to match.
export function outcome(isGolden: boolean, roll = Math.random()): SymbolId[] {
  const odds = isGolden
    ? { jackpot: 1 / 20, dragon: 1 / 10, triple: 1 / 4, pair: 1 }
    : { jackpot: 1 / 200, dragon: 1 / 80, triple: 1 / 15, pair: 1 / 3 }
  let edge = odds.jackpot
  if (roll < edge) return ['seven', 'seven', 'seven']
  edge += odds.dragon
  if (roll < edge) return ['dragon', 'dragon', 'dragon']
  edge += odds.triple
  if (roll < edge) {
    const s = pick(['diamond', 'bell', 'star', 'cherry'] as SymbolId[])
    return [s, s, s]
  }
  edge += odds.pair
  if (roll < edge) {
    const s = pick(ORDER)
    const other = pick(ORDER.filter(o => o !== s))
    const at = Math.floor(Math.random() * 3)
    return [0, 1, 2].map(i => (i === at ? other : s))
  }
  // A loss; now and then a teasing near miss on the sevens.
  if (Math.random() < 0.2) return ['seven', 'seven', pick(ORDER.filter(o => o !== 'seven'))]
  const [a, b, c] = [...ORDER].sort(() => Math.random() - 0.5)
  return [a!, b!, c!]
}

export function score(symbols: SymbolId[]): { win: Win; pay: number } {
  const [a, b, c] = symbols
  if (a === b && b === c) return { win: a === 'seven' ? 'jackpot' : 'triple', pay: TRIPLE_PAY[a!] }
  if (a === b || b === c || a === c) {
    const pair = a === b || a === c ? a! : b!
    return { win: 'pair', pay: pair === 'cherry' ? 3 : 2 }
  }
  return { win: 'none', pay: 0 }
}

function startSpin(spin: Spin) {
  sim.spin = spin
  sim.win = 'none'
  sim.result = spin.forced ?? outcome(spin.isGolden)
  sim.reels = sim.reels.map((reel, i) => {
    const strip = STRIPS[i]!
    const len = strip.length * PERIOD
    const now = ((reel.to % len) + len) % len
    const index = strip.indexOf(sim.result[i]!)
    // Whole turns of the strip first, more for each later reel, then the target.
    const target = (2 + i) * len + index * PERIOD
    return { from: now, to: target, start: sim.t, frames: 14 + i * 7, landedAt: -100 }
  })
}

function reelPos(reel: Reel, i: number): number {
  const k = Math.min(1, (sim.t - reel.start) / reel.frames)
  if (k >= 1) {
    if (reel.landedAt < 0) reel.landedAt = sim.t
    // A small bounce as the reel locks.
    const since = sim.t - reel.landedAt
    return reel.to + ([-2, -1, 1, 0][since] ?? 0)
  }
  void i
  return reel.from + (reel.to - reel.from) * (1 - (1 - k) ** 3)
}

async function finishSpin($: EngineInterface) {
  const spin = sim.spin!
  sim.spin = null
  const { win, pay } = score(sim.result)
  const before = await read($, bank)
  const mult = multiplier(before.streak) * (spin.isGolden ? 2 : 1)
  const payout = spin.isPractice ? 0 : pay * mult
  sim.win = win
  sim.payout = payout
  sim.winUntil = sim.t + (win === 'jackpot' ? 75 : win === 'triple' ? 40 : win === 'pair' ? 18 : 6)
  if (win === 'triple' || win === 'jackpot') {
    for (let i = 0; i < (win === 'jackpot' ? 30 : 12); i++) {
      sim.coins.push({ x: rand(4, W - 4), y: TOP + 4, vx: rand(-0.6, 0.6), vy: rand(-1.4, -0.7), age: 0 })
    }
  }
  if (spin.isPractice) return
  const next = await update($, bank, old => ({
    ...old,
    chips: old.chips + payout,
    spins: old.spins + 1,
    jackpots: old.jackpots + (win === 'jackpot' ? 1 : 0),
    best: Math.max(old.best, payout),
  }))
  await $.store.set('bank', next)
  const names = sim.result.join(' ')
  await update($, last, () => (payout > 0 ? `${names}: +${payout}` : names))
  if (win === 'jackpot') $.ui.toast(`🎰 JACKPOT! 7 7 7 pays ${payout} chips`)
  else if (win === 'triple') $.ui.toast(`🎰 Three ${sim.result[0]}s! +${payout} chips`)
}

function tick($: EngineInterface) {
  sim.t += 1
  if (sim.spin) {
    const isDone = sim.reels.every(r => sim.t - r.start >= r.frames + 4)
    if (isDone) void finishSpin($)
  } else if (sim.t >= sim.winUntil && sim.queue.length > 0) {
    const spin = sim.queue.shift()!
    if (spin.isGolden && !spin.isPractice) void update($, golden, n => Math.max(0, n - 1))
    startSpin(spin)
  }
  for (const c of sim.coins) {
    c.x += c.vx
    c.y += c.vy
    c.vy += 0.12
    c.age += 1
  }
  sim.coins = sim.coins.filter(c => c.age < 30 && c.y < H && c.x >= 0 && c.x < W)
}

const hueColour = (h: number) => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return (f(5) << 16) | (f(3) << 8) | f(1)
}

function frame(): string {
  const px = new Int32Array(W * H).fill(CLEAR)
  const over = new Map<number, { ch: string; fg: number }>()
  const set = (x: number, y: number, c: number) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi >= 0 && xi < W && yi >= 0 && yi < H) px[yi * W + xi] = c
  }
  const isWinning = sim.t < sim.winUntil && sim.win !== 'none'
  const isJackpot = isWinning && sim.win === 'jackpot'
  const isSpinning = sim.spin !== null

  // Cabinet.
  const body = isJackpot ? hueColour((sim.t * 24) % 360) : 0x6b4e16
  for (let y = TOP; y < H; y++) {
    for (let x = 0; x < W; x++) set(x, y, body)
  }

  // Marquee lights round the edge: a slow chase at rest, a fast one while spinning, a strobe on a win.
  const ring: [number, number][] = []
  for (let x = 0; x < W; x++) ring.push([x, TOP])
  for (let y = TOP + 1; y < H - 1; y++) ring.push([W - 1, y])
  for (let x = W - 1; x >= 0; x--) ring.push([x, H - 1])
  for (let y = H - 2; y > TOP; y--) ring.push([0, y])
  const speed = isSpinning ? 1 : 4
  const phase = Math.floor(sim.t / speed)
  ring.forEach(([x, y], i) => {
    let isOn = (i + phase) % 4 === 0
    if (isWinning) isOn = sim.win === 'pair' ? Math.floor(sim.t / 3) % 2 === 0 : (i + sim.t) % 2 === 0
    const lit = isJackpot ? hueColour((i * 20 + sim.t * 30) % 360) : 0xffd34d
    set(x, y, isOn ? lit : 0x3a2a0a)
  })

  // Reels.
  sim.reels.forEach((reel, i) => {
    const x0 = 1 + i * (REEL_W + 1)
    const strip = STRIPS[i]!
    const len = strip.length * PERIOD
    const pos = isSpinning || reel.landedAt >= 0 ? reelPos(reel, i) : reel.to
    const isSlow = sim.t - reel.start >= reel.frames
    const flash = isWinning && sim.win !== 'pair' && Math.floor(sim.t / 2) % 2 === 0
    for (let r = 0; r < WINDOW; r++) {
      const at = (((Math.round(pos) + r - 1) % len) + len) % len
      const sym = strip[Math.floor(at / PERIOD)]!
      const row = at % PERIOD
      for (let c = 0; c < REEL_W; c++) {
        const x = x0 + c
        const y = TOP + 1 + r
        let colour = flash ? 0x3a2f12 : 0x101018
        if (row < SYMBOL_SIZE && c >= 1 && c <= SYMBOL_SIZE) {
          const letter = SYMBOLS[sym][row]![c - 1]!
          if (letter !== '.') colour = PALETTE[letter] ?? colour
        }
        // A fast reel blurs: every other row dims.
        if (!isSlow && isSpinning && (r + sim.t) % 2 === 0 && colour !== 0x101018) colour = (colour >> 1) & 0x7f7f7f
        set(x, y, colour)
      }
    }
  })

  // Coins.
  for (const c of sim.coins) set(c.x, c.y, (c.age + Math.round(c.x)) % 3 === 0 ? 0xffffff : 0xffd34d)

  // The win text, in the headroom above the cabinet.
  if (isWinning) {
    const text = isJackpot ? cycle(['JACKPOT!', `+${sim.payout}`], 8) : sim.payout > 0 ? `+${sim.payout}` : ''
    const start = Math.floor((W - text.length) / 2)
    const fg = isJackpot ? hueColour((sim.t * 40) % 360) : 0xffd34d
    text.split('').forEach((ch, i) => over.set(start + i, { ch, fg }))
  } else if (sim.queue.some(s => s.isGolden) || sim.spin?.isGolden) {
    'GOLDEN'.split('').forEach((ch, i) => over.set(11 + i, { ch, fg: cycle([0xffd34d, 0xfff2a8], 4) }))
  }

  // Pack: one upper half block per cell; a clear pixel shows the terminal through.
  const words = new Uint32Array(W * ROWS * 3)
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = (cy * W + cx) * 3
      const top = px[cy * 2 * W + cx]!
      const bottom = px[(cy * 2 + 1) * W + cx]!
      const o = over.get(cy * W + cx)
      if (o) {
        words[i] = o.ch.codePointAt(0)!
        words[i + 1] = o.fg
        words[i + 2] = bottom === CLEAR ? DEFAULT : bottom
      } else if (top === CLEAR && bottom === CLEAR) {
        words[i] = 0x20
        words[i + 1] = DEFAULT
        words[i + 2] = DEFAULT
      } else if (top === bottom) {
        // One colour top to bottom: paint the cell's background, which fills the whole
        // line height. A block glyph leaves a hairline where the font stops short.
        words[i] = 0x20
        words[i + 1] = DEFAULT
        words[i + 2] = top
      } else if (top === CLEAR) {
        words[i] = 0x2584
        words[i + 1] = bottom
        words[i + 2] = DEFAULT
      } else {
        words[i] = 0x2580
        words[i + 1] = top
        words[i + 2] = bottom === CLEAR ? DEFAULT : bottom
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

// One line under the machine: ◉ chips, × multiplier, ▲ clean streak, ✦ golden spins waiting, ♛ jackpots.
const statsLine = (b: Bank, g: number) =>
  `◉ ${b.chips}  ×${multiplier(b.streak)}  ▲ ${b.streak}  ✦ ${g}  ♛ ${b.jackpots}`

// The frame clock: started once per load, from whichever hook needs it first.
function startLoop($: EngineInterface) {
  if (sim.isLooping) return
  sim.isLooping = true
  $.clock.every(FPS_MS, () => {
    tick($)
    const requestId = sim.requestId
    if (requestId === null || sim.isBlitting) return
    sim.isBlitting = true
    void $.ui
      .blit({ requestId, key: RASTER, cells: frame() })
      .then(r => {
        if (r.deny !== undefined) sim.requestId = null
      })
      .finally(() => {
        sim.isBlitting = false
      })
  })
}

const pull = ($: EngineInterface, spin: Spin) => {
  sim.queue.push(spin)
  startLoop($)
}


// Medium moments earn a golden spin, big ones three.
async function onMilestone($: EngineInterface, tier: string, _kind: string, label: string) {
  const spins = tier === 'big' ? 3 : tier === 'medium' ? 1 : 0
  if (spins === 0) return
  for (let i = 0; i < spins; i++) pull($, { isGolden: true, isPractice: false })
  await update($, golden, n => n + spins)
  $.ui.toast(`✦ ${label}: ${spins} golden spin${spins > 1 ? 's' : ''} queued`)
}

// Hands each moment the session's milestones spotted to the game.
async function celebrateAll($: EngineInterface, found: Milestone[]) {
  for (const m of found) await onMilestone($, m.tier, m.kind, m.label)
}

export const register: Register = (on, options) => {
  configureMilestones(options)

  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('bank')) as Bank | undefined
    if (saved) await update($, bank, () => ({ ...saved, streak: saved.streak ?? 0 }))
    await $.command.register({
      name: 'jackpot',
      description: 'The slot machine above the prompt: your chips. "/jackpot spin|golden|demo" to try it, "/jackpot hide" to toggle it.',
    })
    startLoop($)

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

  on('command.run', { command: 'jackpot' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (arg === 'spin') {
      pull($, { isGolden: false, isPractice: true })
      return { text: 'A practice pull: it pays nothing.' }
    }
    if (arg === 'golden') {
      pull($, { isGolden: true, isPractice: true })
      return { text: 'A practice golden pull: it pays nothing.' }
    }
    if (arg === 'demo') {
      pull($, { isGolden: true, isPractice: true, forced: ['seven', 'seven', 'seven'] })
      return { text: 'A practice jackpot: it pays nothing.' }
    }
    if (arg === 'hide') {
      const hidden = await update($, isHidden, was => !was)
      return { text: hidden ? 'The machine is covered.' : 'The machine is back.' }
    }
    const b = await read($, bank)
    const g = await read($, golden)
    const l = await read($, last)

    return {
      text:
        `${statsLine(b, g)}\n` +
        `${b.spins} spins, best win ${b.best}.${l ? ` Last: ${l}.` : ''}\n` +
        'Every finished turn pulls the lever. A medium moment (a commit, a skill, a sent message) earns a golden spin (better odds, double pay); ' +
        'a big one (a merge, a deploy, a finished task list, a PDF made) earns 3. Five clean turns in a row raise the multiplier, up to ×5; a tool error resets it.',
    }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined) await celebrateAll($, toolMilestones(e, ran))
    if (ran.deny !== undefined) return ran
    if (ran.isError === true) {
      sim.hadError = true
      return ran
    }

    return ran
  })

  // Every finished turn of the main conversation pulls the lever once.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || e.isAborted) return ran
    await celebrateAll($, turnMilestones(await $.clock.now()))
    const hadError = sim.hadError
    sim.hadError = false
    const b = await update($, bank, old => ({ ...old, streak: hadError ? 0 : old.streak + 1 }))
    await $.store.set('bank', b)
    pull($, { isGolden: false, isPractice: false })

    return ran
  })

  // The machine sits at the right end of the band, like the dragon, the rest of the band beside it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'terminal' || e.props.hasSurvey || (await read($, isHidden))) {
      sim.requestId = null
      return below
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    sim.requestId = e.requestId
    startLoop($)
    const b = await read($, bank)
    const g = await read($, golden)

    return (
      <Box flexDirection="row" alignItems="flex-end">
        <Box flexGrow={1} flexDirection="column">
          {below ?? null}
        </Box>
        <Box flexDirection="column" flexShrink={0} minWidth={W} marginLeft={2}>
          <Raster key={RASTER} columns={W} rows={ROWS} cells={frame()} />
          <Text key="stats" dimColor wrap="truncate">
            {statsLine(b, g)}
          </Text>
        </Box>
      </Box>
    )
  })
}
