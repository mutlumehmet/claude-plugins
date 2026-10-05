// The dragon as parts, facing right, 26 by 8 pixels, standing on the bottom
// of a 10 pixel canvas: the two rows above are headroom, so a hop, flight or
// a raised wing never crops the head. '#' is ink. A pose picks one frame per part.

export const DRAGON_WIDTH = 26
export const PIXEL_ROWS = 10
const BASE = 2

type Part = { x: number; y: number; frames: Record<string, string[]> }

const BODY: Part = {
  x: 7,
  y: 4,
  frames: {
    still: ['..#########', '############', '..##########'],
    breathe: ['..#########', '.###########', '..##########'],
  },
}

// Anchored two rows up, in the headroom, so the raised wing can reach into it.
const WING: Part = {
  x: 6,
  y: -2,
  frames: {
    up: ['#.......', '##......', '######..', '.#.#.##.', '..#.#.##', '...#####'],
    mid: ['........', '........', '#.......', '.######.', '..#.#.##', '...#####'],
    down: ['........', '........', '........', '........', '.######.', '#.#.#.##'],
  },
}

const HEAD: Part = {
  x: 16,
  y: 0,
  frames: {
    look: ['...#.#....', '..######..', '.##.######', '.##...###.', '##........'],
    blink: ['...#.#....', '..######..', '.#########', '.##...###.', '##........'],
    up: ['...#.#....', '..##.###..', '.#########', '.##...###.', '##........'],
    open: ['...#.#....', '..######..', '.##.######', '.##.......', '##....###.'],
    droop: ['..........', '...#.#....', '..######..', '.##.######', '##....###.'],
    doze: ['..........', '...#.#....', '..######..', '.#########', '##....###.'],
  },
}

const TAIL: Part = {
  x: 0,
  y: 3,
  frames: {
    low: ['#........', '##.......', '.##......', '..#####..'],
    high: ['##.......', '#........', '##.......', '.######..'],
    flat: ['.........', '.........', '###......', '..#####..'],
  },
}

const LEGS: Part = {
  x: 8,
  y: 7,
  frames: {
    stand: ['##.##..##.##'],
    stepA: ['#..##...#..##'],
    stepB: ['##..#...##..#'],
    tuck: ['............'],
  },
}

export type Pose = { body: string; wing: string; head: string; tail: string; legs: string }

// Where things are on the canvas when the dragon stands still.
export const MOUTH = { x: 26, y: BASE + 2 }
export const NOSTRIL = { x: 25, y: BASE + 2 }
export const EYE = { x: 19, y: BASE + 2 }

// `dx`, `dy` move the whole dragon: dy -1 or -2 is a hop or flight.
export function draw(ink: Uint8Array, columns: number, pose: Pose, dx = 0, dy = 0) {
  const put = (part: Part, frame: string) => {
    const rows = part.frames[frame] ?? Object.values(part.frames)[0] ?? []
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') continue
        const px = part.x + x + dx
        const py = BASE + part.y + y + dy
        if (px >= 0 && px < columns && py >= 0 && py < PIXEL_ROWS) ink[py * columns + px] = 1
      }
    })
  }
  put(TAIL, pose.tail)
  put(BODY, pose.body)
  put(LEGS, pose.legs)
  put(WING, pose.wing)
  put(HEAD, pose.head)
}

// A hatchling for each subagent: 6 by 5 pixels, two wingbeats.
const BABY: Record<string, string[]> = {
  up: ['.#....', '#.#...', '.###.#', '..####', '..#...'],
  down: ['......', '....#.', '.####.', '#.###.', '..#...'],
}
export const BABY_WIDTH = 6
export const BABY_HEIGHT = 5

export function drawBaby(ink: Uint8Array, columns: number, x: number, y: number, frame: 'up' | 'down') {
  BABY[frame]!.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx] !== '#') continue
      const px = Math.round(x) + dx
      const py = Math.round(y) + dy
      if (px >= 0 && px < columns && py >= 0 && py < PIXEL_ROWS) ink[py * columns + px] = 1
    }
  })
}
