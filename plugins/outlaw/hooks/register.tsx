import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Score } from '../types'
import { configureMilestones, promptMilestones, skillSeen, streakMilestones, subagentMilestones, toolMilestones, turnMilestones } from './milestones'
import type { Milestone } from './milestones'

const RASTER = 'outlaw'
const W = 40
const PIXEL_ROWS = 10
const ROWS = PIXEL_ROWS / 2
const FPS_MS = 66
// The terminal's own text colour, so the duel takes on whatever theme is set.
const INK = 0x01000000
const NONE = 0x01000000

const score = atom({ plugin: 'outlaw', key: 'score' } as const, { you: 0, bugs: 0, streak: 0, best: 0 })
const isHidden = atom({ plugin: 'outlaw', key: 'isHidden' } as const, false)

const HIT_CHANCE = { you: 0.8, bug: 0.5 }

// The gunslinger facing right, 7 by 9 pixels. The bug is the same, mirrored.
const BODY = {
  stand: ['..##...', '.####..', '######.', '..##...', '.####..', '#.##...', '..##...', '.#..#..', '.#..#..'],
  ready: ['..##...', '.####..', '######.', '..##...', '.####..', '#.##.#.', '..##...', '.#..#..', '.#..#..'],
  // Aimed at eye level: the shot clears the cactus.
  high: ['..##...', '.####..', '######.', '..#####', '.###...', '..##...', '..##...', '.#..#..', '.#..#..'],
  // Aimed from the hip: the shot meets the cactus.
  low: ['..##...', '.####..', '######.', '..##...', '.####..', '#.#####', '..##...', '.#..#..', '.#..#..'],
  stepA: ['..##...', '.####..', '######.', '..##...', '.####..', '#.##...', '..##...', '.#..#..', '#....#.'],
  stepB: ['..##...', '.####..', '######.', '..##...', '.####..', '#.##...', '..##...', '..##...', '..##...'],
  // Weight on the other leg, for the idle sway.
  shift: ['..##...', '.####..', '######.', '..##...', '.####..', '#.##...', '..##...', '..#.#..', '..#..#.'],
  // A hand to the hat brim.
  tip: ['..##.#.', '.####.#', '######.', '..##...', '.####..', '#.##...', '..##...', '.#..#..', '.#..#..'],
}
// Shot down: lying on the ground, head away from the cactus.
const FALLEN = ['........##', '#..######.', '##.######.']
const GUN_ROW = { high: 3, low: 5 }
const CACTUS_ART = ['#..##..#', '##.##.##', '.######.', '...##...', '...##...']
const CACTUS = { x: 16, y: 5 }
const BIRD = [
  ['#...#', '.#.#.'],
  ['.....', '##.##'],
]
const TUMBLE = [
  ['.#.', '#.#', '.#.'],
  ['#.#', '.#.', '#.#'],
]

type Side = 'you' | 'bug'
type Pose = keyof typeof BODY
type Shot = { by: Side; isPractice: boolean }
type Duel = { by: Side; aim: 'high' | 'low'; phase: 'draw' | 'fly'; since: number; x: number; y: number }
type Glyph = { x: number; y: number; ch: string; until: number }

const sim = {
  t: 0,
  isTurn: false,
  queue: [] as Shot[],
  duel: null as Duel | null,
  restUntil: 0,
  practice: false,
  men: {
    you: { y: 1, goal: 1, fallUntil: -1 },
    bug: { y: 1, goal: 1, fallUntil: -1 },
  },
  cactus: new Set<number>(),
  tumble: null as null | { x: number },
  bird: null as null | { x: number; y: number },
  tipUntil: { you: -1, bug: -1 },
  glyphs: [] as Glyph[],
  requestId: null as string | null,
  isBlitting: false,
}

const cycle = <T,>(frames: T[], n: number) => frames[Math.floor(sim.t / n) % frames.length]!
const xOf = (side: Side) => (side === 'you' ? 1 : W - 8)
const other = (side: Side): Side => (side === 'you' ? 'bug' : 'you')

const CACTUS_PIXELS = CACTUS_ART.flatMap((row, y) =>
  [...row].flatMap((c, x) => (c === '#' ? [(CACTUS.y + y) * W + CACTUS.x + x] : [])),
)
for (const at of CACTUS_PIXELS) sim.cactus.add(at)

function say(x: number, y: number, text: string, frames: number) {
  // Kept inside the scene, so a word near the edge is never cut off.
  x = Math.max(0, Math.min(W - text.length, x))
  text.split('').forEach((ch, i) => sim.glyphs.push({ x: x + i, y, ch, until: sim.t + frames }))
}

function startDuel(shot: Shot) {
  const isHit = Math.random() < HIT_CHANCE[shot.by]
  const aim = isHit ? 'high' : 'low'
  sim.duel = { by: shot.by, aim, phase: 'draw', since: sim.t, x: 0, y: 0 }
  sim.practice = shot.isPractice
}

async function land($: EngineInterface, duel: Duel, isHit: boolean) {
  sim.duel = null
  sim.restUntil = sim.t + 12
  if (!isHit) {
    say(Math.round(duel.x), Math.floor(duel.y / 2), '*', 4)
    return
  }
  const target = other(duel.by)
  sim.men[target].fallUntil = sim.t + 36
  say(xOf(target) + 2, 0, duel.by === 'you' ? 'GOT HIM' : 'OUCH', 20)
  if (sim.practice) return
  const next = await update($, score, old => {
    const streak = duel.by === 'you' ? old.streak + 1 : 0
    return {
      you: old.you + (duel.by === 'you' ? 1 : 0),
      bugs: old.bugs + (duel.by === 'bug' ? 1 : 0),
      streak,
      best: Math.max(old.best, streak),
    }
  })
  await $.store.set('score', next)
}

function step($: EngineInterface) {
  sim.t += 1
  const { t } = sim

  // The duel: draw, then the bullet flies two pixels a frame.
  const duel = sim.duel
  if (duel && duel.phase === 'draw' && t - duel.since >= 6) {
    const shooter = sim.men[duel.by]
    duel.phase = 'fly'
    duel.x = duel.by === 'you' ? xOf('you') + 7 : xOf('bug') - 1
    duel.y = shooter.y + GUN_ROW[duel.aim]
    say(duel.by === 'you' ? 9 : W - 13, 0, 'BANG', 4)
  }
  if (duel && duel.phase === 'fly') {
    const dir = duel.by === 'you' ? 1 : -1
    for (let i = 0; i < 2 && sim.duel; i++) {
      duel.x += dir
      const at = duel.y * W + Math.round(duel.x)
      if (sim.cactus.has(at)) {
        // The cactus takes the bullet and loses a chunk.
        sim.cactus.delete(at)
        sim.cactus.delete(at + dir)
        void land($, duel, false)
        break
      }
      const target = other(duel.by)
      const tx = xOf(target)
      const ty = sim.men[target].y
      if (duel.x >= tx && duel.x <= tx + 6 && duel.y >= ty && duel.y <= ty + 8) {
        void land($, duel, true)
        break
      }
      if (duel.x < 0 || duel.x >= W) {
        void land($, duel, false)
        break
      }
    }
  }
  if (!sim.duel && t >= sim.restUntil && sim.queue.length > 0) startDuel(sim.queue.shift()!)

  // Between duels the two pace up and down, and the cactus grows back.
  for (const side of ['you', 'bug'] as Side[]) {
    const man = sim.men[side]
    if (!sim.duel && !sim.isTurn && t % 30 === (side === 'you' ? 0 : 15)) man.goal = Math.random() < 0.5 ? 0 : 1
    if (t % 4 === 0 && man.y !== man.goal) man.y += man.goal > man.y ? 1 : -1
  }
  if (!sim.duel && t % 40 === 0) {
    // The cactus grows back a pixel at a time.
    const missing = CACTUS_PIXELS.filter(at => !sim.cactus.has(at))
    if (missing.length > 0) sim.cactus.add(missing[Math.floor(Math.random() * missing.length)]!)
  }
  if (!sim.tumble && !sim.duel && !sim.isTurn && t % 160 === 80) sim.tumble = { x: W }
  // A vulture circles over now and then; the gunslingers tip their hats.
  if (!sim.bird && t % 240 === 20) sim.bird = { x: -5, y: Math.random() < 0.5 ? 0 : 1 }
  if (sim.bird) {
    sim.bird.x += 0.4
    if (sim.bird.x > W) sim.bird = null
  }
  if (!sim.duel && t % 110 === 55) sim.tipUntil[Math.random() < 0.5 ? 'you' : 'bug'] = t + 10
  if (sim.tumble) {
    sim.tumble.x -= 0.5
    if (sim.tumble.x < -3) sim.tumble = null
  }
  sim.glyphs = sim.glyphs.filter(g => g.until > t)
}

function frame(): string {
  const ink = new Uint8Array(W * PIXEL_ROWS)
  const set = (x: number, y: number) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi >= 0 && xi < W && yi >= 0 && yi < PIXEL_ROWS) ink[yi * W + xi] = 1
  }
  const stamp = (rows: string[], x: number, y: number, isMirror: boolean) => {
    rows.forEach((row, dy) => {
      const r = isMirror ? [...row].reverse().join('') : row
      for (let dx = 0; dx < r.length; dx++) if (r[dx] === '#') set(x + dx, y + dy)
    })
  }

  for (const at of sim.cactus) ink[at] = 1

  for (const side of ['you', 'bug'] as Side[]) {
    const man = sim.men[side]
    const isMirror = side === 'bug'
    if (sim.t < man.fallUntil) {
      stamp(FALLEN, side === 'you' ? 0 : W - 10, PIXEL_ROWS - 3, isMirror)
      continue
    }
    let pose: Pose = 'stand'
    const duel = sim.duel
    if (duel && duel.by === side) pose = duel.aim
    else if (duel || sim.isTurn) pose = 'ready'
    else if (man.y !== man.goal) pose = cycle(['stepA', 'stepB'] as Pose[], 2)
    else if (sim.t < sim.tipUntil[side]) pose = 'tip'
    else pose = cycle(['stand', 'shift'] as Pose[], side === 'you' ? 14 : 17)
    stamp(BODY[pose], xOf(side), man.y, isMirror)
  }

  if (sim.duel && sim.duel.phase === 'fly') {
    set(sim.duel.x, sim.duel.y)
    set(sim.duel.x - (sim.duel.by === 'you' ? 1 : -1), sim.duel.y)
  }
  if (sim.tumble) stamp(TUMBLE[Math.floor(sim.t / 3) % 2]!, sim.tumble.x, PIXEL_ROWS - 3 - (Math.floor(sim.t / 4) % 2), false)
  if (sim.bird) stamp(BIRD[Math.floor(sim.t / 4) % 2]!, sim.bird.x, sim.bird.y, false)

  const over = new Map<number, string>()
  for (const g of sim.glyphs) if (g.x >= 0 && g.x < W && g.y >= 0 && g.y < ROWS) over.set(g.y * W + g.x, g.ch)

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

const statsLine = (s: Score) => `YOU ${s.you} : ${s.bugs} BUGS  ▲ ${s.streak}  ★ ${s.best}`


// Medium moments are one shot at the bug, big ones three.
async function onMilestone($: EngineInterface, tier: string, _kind: string, label: string) {
  const shots = tier === 'big' ? 3 : tier === 'medium' ? 1 : 0
  if (shots === 0) return
  for (let i = 0; i < shots; i++) sim.queue.push({ by: 'you', isPractice: false })
  $.ui.toast(`🤠 ${label}! ${shots > 1 ? `${shots} shots` : 'Draw!'}`)
}

// Hands each moment the session's milestones spotted to the game.
async function celebrateAll($: EngineInterface, found: Milestone[]) {
  for (const m of found) await onMilestone($, m.tier, m.kind, m.label)
}

export const register: Register = (on, options) => {
  configureMilestones(options)

  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('score')) as Score | undefined
    if (saved) await update($, score, () => saved)
    await $.command.register({
      name: 'outlaw',
      description: 'The duel above the prompt: the score. "/outlaw draw" for a practice duel, "/outlaw hide" to toggle it.',
    })
    $.clock.every(FPS_MS, () => {
      step($)
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

  on('command.run', { command: 'outlaw' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (arg === 'draw') {
      sim.queue.push({ by: 'you', isPractice: true }, { by: 'bug', isPractice: true })
      return { text: 'Practice duel: one shot each, no score.' }
    }
    if (arg === 'hide') {
      const hidden = await update($, isHidden, was => !was)
      return { text: hidden ? 'The outlaws ride off.' : 'The outlaws are back.' }
    }

    return {
      text:
        `${statsLine(await read($, score))}\n` +
        'You fire once on a medium moment (a commit, a skill, a sent message) and three times on a big one (a merge, a deploy, a finished task list); the bug fires when a tool fails. ' +
        '▲ is your run of hits without being hit, ★ your best run.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    sim.isTurn = true
    const ran = await next(e)
    await celebrateAll($, promptMilestones(String(e.text ?? ''), await $.clock.now()))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) sim.isTurn = false
    const ran = await next(e)
    if (e.agentId === undefined && !e.isAborted) await celebrateAll($, turnMilestones(await $.clock.now()))
    return ran
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined) await celebrateAll($, toolMilestones(e, ran))
    if (e.agentId !== undefined || ran.deny !== undefined) return ran
    if (ran.isError === true) {
      sim.queue.push({ by: 'bug', isPractice: false })
      return ran
    }

    return ran
  })

  // The duel sits at the right end of the band, beside whatever else is there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'terminal' || e.props.hasSurvey || (await read($, isHidden))) {
      sim.requestId = null
      return below
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    sim.requestId = e.requestId
    const s = await read($, score)
    const line = statsLine(s)
    const pad = ' '.repeat(Math.max(0, Math.floor((W - line.length) / 2)))

    return (
      <Box flexDirection="row" alignItems="flex-end">
        <Box flexGrow={1} flexDirection="column">
          {below ?? null}
        </Box>
        <Box flexDirection="column" flexShrink={0} minWidth={W} marginLeft={2}>
          <Raster key={RASTER} columns={W} rows={ROWS} cells={frame()} />
          <Text key="stats" dimColor wrap="truncate">
            {pad + line}
          </Text>
        </Box>
      </Box>
    )
  })
}
