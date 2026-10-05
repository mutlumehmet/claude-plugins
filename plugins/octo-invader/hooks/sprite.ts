// The octopus and everything it meets, as pixel masks: '#' is a pixel, anything else is empty.

export const OCTO_WIDTH = 16
export const OCTO_HEIGHT = 12

// The head: a dome with two eyes cut out of it.
const HEAD = [
  '......####......',
  '...##########...',
  '..############..',
  '.##############.',
  '.###..####..###.',
  '.###..####..###.',
  '.##############.',
  '..############..',
]
// Eyes shut: blinking or asleep.
const HEAD_SHUT = [...HEAD.slice(0, 4), '.##############.', ...HEAD.slice(5)]

export type Legs = 'walkA' | 'walkB' | 'fly' | 'smash' | 'curl' | 'stand'
const LEGS: Record<Legs, string[]> = {
  stand: [
    '..##.##..##.##..',
    '..#..#....#..#..',
    '.#...#....#...#.',
    '.#...#....#...#.',
  ],
  walkA: [
    '..##.##..##.##..',
    '.##..#....#..##.',
    '#...##....##...#',
    '#..#........#..#',
  ],
  walkB: [
    '..##.##..##.##..',
    '..#..##..##..#..',
    '.#...#....#...#.',
    '.#..#......#..#.',
  ],
  // Tentacles trail below while it flies.
  fly: [
    '..#.#.#..#.#.#..',
    '..#.#.#..#.#.#..',
    '...#.#.##.#.#...',
    '...#.#....#.#...',
  ],
  // Spread wide to stomp a building.
  smash: [
    '#.##.##..##.##.#',
    '#.#...#..#...#.#',
    '..#...#..#...#..',
    '.#....#..#....#.',
  ],
  curl: [
    '.#.##.#..#.##.#.',
    '#.#..#.##.#..#.#',
    '................',
    '................',
  ],
}

export function octopus(legs: Legs, isShut: boolean): string[] {
  return [...(isShut ? HEAD_SHUT : HEAD), ...LEGS[legs]]
}

// A hatchling for each subagent.
export const BABY = [
  ['.###.', '#.#.#', '#####', '#.#.#'],
  ['.###.', '#.#.#', '#####', '.#.#.'],
]

// A plane, nose to the right; flipped for one flying left.
export const PLANE = [
  '.#.......',
  '.##....#.',
  '########.',
  '...##....',
]

export const FLAG = ['####', '###.', '#...', '#...', '#...']
