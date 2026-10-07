import type { EngineInterface } from 'claude-code'

// The Arcade's games keep nothing between sessions: every terminal starts each game, the town and
// the pet from zero, and they last until the terminal closes (a reload of the plugin's code keeps
// them). Decided 7 October 2026, replacing the per project saves of 0.8.0.
//
// What earlier versions saved is deleted once, at session start: each game's key, bare (before
// 0.8.0) or with `@` and a project's hash (0.8.0 to 0.8.4), and the list of projects. The Arcade's
// own `setting`, `rotate` and `days` stay.
const OLD_KEYS = [
  'dragon.hoard',
  'jackpot.bank',
  'outlaw.score',
  'tama.pet',
  'tetris.tally',
  'octopus.score',
  'duck.score',
  'bugs.score',
  'dario.score',
  'town.score',
  'town.map',
  'arcade.projects',
]

const isOld = (key: string) => OLD_KEYS.some(k => key === k || key.startsWith(`${k}@`))

export async function forgetSaves($: EngineInterface) {
  try {
    for (const key of await $.store.keys()) if (isOld(key)) await $.store.delete(key)
  } catch {
    // No store keys here (a test, `claude -p`): nothing to forget.
  }
}
