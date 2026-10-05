import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pet, Stage } from '../types'
import { configureMilestones, promptMilestones, skillSeen, streakMilestones, subagentMilestones, toolMilestones, turnMilestones } from './milestones'
import type { Milestone } from './milestones'

const RASTER = 'tama'
const W = 30
const PIXEL_ROWS = 10
const ROWS = PIXEL_ROWS / 2
const FPS_MS = 100
// The terminal's own text colour, so the LCD takes on whatever theme is set.
const INK = 0x01000000
const NONE = 0x01000000

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const HUNGER_MS = 20 * MINUTE
const JOY_MS = HOUR
const LEAVES_AFTER = 12 * HOUR
const CARE_PER_DAY = 6
const FULL = 4

const pet = atom({ plugin: 'tama', key: 'pet' } as const, fresh(0, 1))
const isHidden = atom({ plugin: 'tama', key: 'isHidden' } as const, false)

// A hidden game stays quiet: its notifications are hidden too.
async function notify($: EngineInterface, text: string) {
  if (!(await read($, isHidden))) $.ui.toast(text)
}


// One sprite per stage; the eye row's holes close for a blink.
const SPRITES: Record<Stage, { rows: string[]; eyes: number }> = {
  egg: { rows: ['.###.', '#####', '##.##', '#####', '#####', '.###.'], eyes: -1 },
  baby: { rows: ['.###.', '#.#.#', '#####', '.#.#.'], eyes: 1 },
  child: { rows: ['..###..', '.#####.', '##.#.##', '#######', '.#####.', '.#...#.'], eyes: 2 },
  teen: { rows: ['.#...#.', '.#####.', '##.#.##', '#######', '#.###.#', '.#####.', '.#...#.'], eyes: 2 },
  worker: {
    rows: ['..#####..', '.#######.', '##.###.##', '#########', '.#######.', '..##.##..', '.#######.', '.##...##.'],
    eyes: 2,
  },
  rascal: {
    rows: ['#.......#', '##.###.##', '.#######.', '##.###.##', '#########', '.#######.', '..#...#..', '.##...##.'],
    eyes: 3,
  },
  chubby: {
    rows: ['..#####..', '.#######.', '##.###.##', '#########', '#########', '#########', '.#######.', '..#...#..'],
    eyes: 2,
  },
}
const STAGE_NAMES: Record<Stage, string> = {
  egg: 'an egg', baby: 'a baby', child: 'a child', teen: 'a teen',
  worker: 'a hard-working adult', rascal: 'a rascal of an adult', chubby: 'a well-fed adult',
}
const HEART = ['#.#', '###', '.#.']
const POOP = ['.#.', '###']
const RICE = ['.#.', '###', '###']
const CASE = ['.##.', '####', '####']

function fresh(now: number, generation: number): Pet {
  return {
    stage: 'egg', born: now, hungerAt: now, joyAt: now, hunger: FULL, joy: FULL, poops: 0, starvingSince: 0,
    eggTurns: 0, turns: 0, wins: 0, errors: 0, cleanRun: 0, generation, careDay: '', careLeft: CARE_PER_DAY,
  }
}

const isSick = (p: Pet) => p.stage !== 'egg' && (p.poops >= 3 || p.hunger === 0)

// Real time passes even while Claude Code is closed: hunger and joy tick down, and it grows up.
function age(p: Pet, now: number): Pet {
  if (p.stage === 'egg') return { ...p, hungerAt: now, joyAt: now }
  const hungerTicks = Math.floor((now - p.hungerAt) / HUNGER_MS)
  const joyTicks = Math.floor((now - p.joyAt) / JOY_MS)
  const hunger = Math.max(0, p.hunger - hungerTicks)
  const joy = Math.max(0, p.joy - joyTicks)
  const lived = now - p.born
  let stage = p.stage
  if (stage === 'baby' && lived > HOUR) stage = 'child'
  if (stage === 'child' && lived > DAY) stage = 'teen'
  if (stage === 'teen' && lived > 3 * DAY) {
    stage = p.errors > p.wins ? 'rascal' : p.turns > 3 * p.wins + 10 ? 'chubby' : 'worker'
  }
  return {
    ...p,
    stage,
    hunger,
    joy,
    hungerAt: p.hungerAt + hungerTicks * HUNGER_MS,
    joyAt: p.joyAt + joyTicks * JOY_MS,
    starvingSince: hunger > 0 ? 0 : p.starvingSince || now,
  }
}

type Particle = { x: number; y: number; vy: number; age: number; life: number; art: 'heart' | 'glyph'; ch?: string }

const sim = {
  t: 0,
  now: 0,
  x: 12,
  dir: 1,
  hopUntil: -1,
  eatUntil: -1,
  leaveFrom: -1,
  particles: [] as Particle[],
  requestId: null as string | null,
  isBlitting: false,
  pet: fresh(0, 1),
}

const cycle = <T,>(frames: T[], n: number) => frames[Math.floor(sim.t / n) % frames.length]!
const today = (now: number) => new Date(now).toISOString().slice(0, 10)
const isNight = (now: number) => {
  const hour = new Date(now).getHours()
  return hour >= 23 || hour < 7
}

async function change($: EngineInterface, fn: (p: Pet) => Pet) {
  const now = await $.clock.now()
  sim.now = now
  const changed = await update($, pet, p => fn(age(p, now)))
  sim.pet = changed
  await $.store.set('pet', changed)
  return changed
}

function hearts(count: number) {
  for (let i = 0; i < count; i++) {
    sim.particles.push({ x: sim.x + i * 3 - 2, y: 3, vy: -0.2, age: -i * 4, life: 14, art: 'heart' })
  }
  sim.hopUntil = sim.t + 10
}

function step() {
  sim.t += 1
  const p = sim.pet
  const sprite = SPRITES[p.stage]
  const width = sprite.rows[0]!.length
  const isAsleep = isNight(sim.now)
  const isLeaving = sim.leaveFrom >= 0

  // It wanders the screen, unless asleep, sick, eating, or an egg.
  if (isLeaving) sim.x += 0.5
  else if (p.stage !== 'egg' && !isAsleep && !isSick(p) && sim.t >= sim.eatUntil && sim.t % 6 === 0) {
    sim.x += sim.dir
    const left = 6 + p.poops * 0
    if (sim.x <= left || sim.x + width >= W - 2 || Math.random() < 0.08) sim.dir = -sim.dir
    sim.x = Math.max(left, Math.min(W - 2 - width, sim.x))
  }
  if (isAsleep && sim.t % 25 === 0) sim.particles.push({ x: sim.x + width, y: 0, vy: 0, age: 0, life: 20, art: 'glyph', ch: cycle(['z', 'Z'], 25) })
  if (isSick(p) && sim.t % 20 === 0) sim.particles.push({ x: sim.x + width, y: 0, vy: 0, age: 0, life: 12, art: 'glyph', ch: '+' })
  for (const q of sim.particles) {
    q.age += 1
    if (q.age > 0) q.y += q.vy
  }
  sim.particles = sim.particles.filter(q => q.age < q.life)
}

function frame(): string {
  const ink = new Uint8Array(W * PIXEL_ROWS)
  const set = (x: number, y: number) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi > 0 && xi < W - 1 && yi > 0 && yi < PIXEL_ROWS - 1) ink[yi * W + xi] = 1
  }
  const stamp = (rows: string[], x: number, y: number) =>
    rows.forEach((row, dy) => [...row].forEach((c, dx) => c === '#' && set(x + dx, y + dy)))
  const over = new Map<number, string>()
  const glyph = (x: number, cell: number, ch: string) => {
    const xi = Math.round(x)
    if (xi > 0 && xi < W - 1 && cell >= 0 && cell < ROWS) over.set(cell * W + xi, ch)
  }

  // The LCD's frame.
  for (let x = 0; x < W; x++) {
    ink[x] = 1
    ink[(PIXEL_ROWS - 1) * W + x] = 1
  }
  for (let y = 0; y < PIXEL_ROWS; y++) {
    ink[y * W] = 1
    ink[y * W + W - 1] = 1
  }

  const p = sim.pet
  const sprite = SPRITES[p.stage]
  const isAsleep = isNight(sim.now)
  const floor = PIXEL_ROWS - 1
  let rows = sprite.rows
  const isBlink = isAsleep || isSick(p) || sim.t % 40 < 2
  if (isBlink && sprite.eyes >= 0) {
    rows = rows.map((row, i) => (i === sprite.eyes ? row.replace(/(?<=#)\.(?=.*#)/g, '#') : row))
  }
  if (p.stage === 'egg' && p.eggTurns >= 2) rows = ['.###.', '##.##', '#.#.#', '#####', '#####', '.###.']
  const hop = sim.t < sim.hopUntil ? cycle([1, 1, 0], 2) : sim.t < sim.eatUntil ? cycle([0, 1], 3) : 0
  const wobble = p.stage === 'egg' && p.eggTurns >= 2 ? cycle([0, 1, 0, -1], 3) : 0
  stamp(rows, sim.x + wobble, floor - rows.length - hop)

  if (sim.leaveFrom >= 0) stamp(CASE, sim.x + rows[0]!.length + 1, floor - CASE.length)
  if (sim.t < sim.eatUntil) {
    // The rice ball, eaten down a row at a time.
    const left = Math.ceil(((sim.eatUntil - sim.t) / 18) * RICE.length)
    stamp(RICE.slice(RICE.length - left), sim.x - 4, floor - left)
  }
  for (let i = 0; i < Math.min(3, p.poops); i++) {
    stamp(POOP, 1 + i * 4 - 0, floor - POOP.length)
    if (sim.t % 12 < 8) glyph(2 + i * 4, 2, '~')
  }
  for (const q of sim.particles) {
    if (q.age < 0) continue
    if (q.art === 'heart') stamp(HEART, q.x, q.y)
    else glyph(q.x, Math.floor(q.y / 2), q.ch ?? '*')
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

const bar = (n: number) => '▮'.repeat(n) + '▯'.repeat(FULL - n)
// One line under the LCD: ♨ hunger (full is good), ♥ joy, ✧ clean.
const statsLine = (p: Pet) =>
  p.stage === 'egg' ? `an egg · ${Math.max(0, 3 - p.eggTurns)} turns to hatch` : `♨ ${bar(p.hunger)}  ♥ ${bar(p.joy)}  ✧ ${bar(FULL - Math.min(FULL, p.poops))}`


// Medium moments cheer it up a little, big ones a lot.
async function onMilestone($: EngineInterface, tier: string, _kind: string, _label: string) {
  const joy = tier === 'big' ? 2 : tier === 'medium' ? 1 : 0
  if (joy === 0 || sim.pet.stage === 'egg') return
  await change($, q => ({ ...q, wins: q.wins + 1, joy: Math.min(FULL, q.joy + joy), joyAt: sim.now }))
  hearts(joy)
}

// Hands each moment the session's milestones spotted to the game.
async function celebrateAll($: EngineInterface, found: Milestone[]) {
  for (const m of found) await onMilestone($, m.tier, m.kind, m.label)
}

export const register: Register = (on, options) => {
  configureMilestones(options)

  on('session.start', async ($, e, next) => {
    sim.now = await $.clock.now()
    const saved = (await $.store.get('pet')) as Pet | undefined
    const start = saved ?? fresh(sim.now, 1)
    sim.pet = await update($, pet, () => age(start, sim.now))
    await $.store.set('pet', sim.pet)
    await $.command.register({
      name: 'tama',
      description: 'The Tamagotchi above the prompt: how it is doing. "/tama feed|play|clean" to care for it by hand, "/tama hide" to toggle it.',
    })
    $.clock.every(FPS_MS, () => {
      step()
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
    // Once a minute: time passes, and a long-starved pet packs its bags.
    $.clock.every(MINUTE, () => {
      void (async () => {
        const p = await change($, q => q)
        if (p.starvingSince > 0 && sim.now - p.starvingSince > LEAVES_AFTER && sim.leaveFrom < 0) {
          sim.leaveFrom = sim.t
          void notify($, '🧳 Left hungry for too long, your Tamagotchi packs its bags. It leaves an egg behind.')
          $.clock.after(6000, () => {
            sim.leaveFrom = -1
            sim.x = 12
            void change($, q => fresh(sim.now, q.generation + 1))
          })
        }
      })()
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

  on('command.run', { command: 'tama' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (arg === 'hide') {
      const hidden = await update($, isHidden, was => !was)
      return { text: hidden ? 'The Tamagotchi goes in your pocket.' : 'The Tamagotchi is back.' }
    }
    if (arg === 'feed' || arg === 'play' || arg === 'clean') {
      const now = await $.clock.now()
      const p = age(await read($, pet), now)
      if (p.stage === 'egg') return { text: 'It is still an egg. Finish a few turns to hatch it.' }
      const left = p.careDay === today(now) ? p.careLeft : CARE_PER_DAY
      if (left <= 0) return { text: 'That is enough hand care for today. Your work feeds it too.' }
      await change($, q => ({
        ...q,
        careDay: today(now),
        careLeft: left - 1,
        hunger: arg === 'feed' ? Math.min(FULL, q.hunger + 1) : q.hunger,
        hungerAt: arg === 'feed' ? now : q.hungerAt,
        joy: arg === 'play' ? Math.min(FULL, q.joy + 1) : q.joy,
        joyAt: arg === 'play' ? now : q.joyAt,
        poops: arg === 'clean' ? 0 : q.poops,
      }))
      if (arg === 'feed') sim.eatUntil = sim.t + 18
      if (arg === 'play') hearts(1)
      return { text: `${arg === 'feed' ? 'Fed' : arg === 'play' ? 'Played with' : 'Cleaned up after'} it. ${left - 1} hand care left today.` }
    }

    const p = age(await read($, pet), await $.clock.now())
    const days = Math.floor((sim.now - p.born) / DAY)
    const mood = isSick(p) ? 'It is sick: feed it and clean up.' : p.hunger <= 1 ? 'It is hungry.' : p.joy <= 1 ? 'It is bored.' : 'It is doing fine.'
    return {
      text:
        `Generation ${p.generation}: ${STAGE_NAMES[p.stage]}, ${days} day${days === 1 ? '' : 's'} old. ${statsLine(p)}\n${mood}\n` +
        'Finished turns feed it, commits, tests and PRs cheer it up, tool errors leave a mess (five clean turns tidy one away).',
    }
  })

  // A finished turn is a meal; five clean turns in a row tidy up one mess.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || e.isAborted) return ran
    await celebrateAll($, turnMilestones(await $.clock.now()))
    const before = sim.pet
    const p = await change($, q => {
      if (q.stage === 'egg') {
        const eggTurns = q.eggTurns + 1
        return eggTurns >= 3 ? { ...q, stage: 'baby', eggTurns, born: sim.now, hungerAt: sim.now, joyAt: sim.now } : { ...q, eggTurns }
      }
      const cleanRun = q.cleanRun + 1
      return {
        ...q,
        turns: q.turns + 1,
        hunger: Math.min(FULL, q.hunger + 1),
        hungerAt: sim.now,
        cleanRun: cleanRun >= 5 ? 0 : cleanRun,
        poops: cleanRun >= 5 ? Math.max(0, q.poops - 1) : q.poops,
      }
    })
    if (before.stage === 'egg' && p.stage === 'baby') {
      hearts(2)
      void notify($, '🥚 Your Tamagotchi hatched!')
    } else if (p.stage !== 'egg') {
      sim.eatUntil = sim.t + 18
    }

    return ran
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined) await celebrateAll($, toolMilestones(e, ran))
    if (e.agentId !== undefined || ran.deny !== undefined || sim.pet.stage === 'egg') return ran
    if (ran.isError === true) {
      await change($, q => ({ ...q, errors: q.errors + 1, cleanRun: 0, poops: Math.min(3, q.poops + 1) }))
      return ran
    }

    return ran
  })

  // The LCD sits at the right end of the band, beside whatever else is there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'terminal' || e.props.hasSurvey || (await read($, isHidden))) {
      sim.requestId = null
      return below
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    sim.requestId = e.requestId
    const line = statsLine(await read($, pet))
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
