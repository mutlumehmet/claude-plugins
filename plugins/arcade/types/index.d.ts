// dragon-lair
export type Hoard = { gold: number; meals: number; feats: number }
export type DragonMood = 'idle' | 'work' | 'sad' | 'sleep' | 'fire'

// jackpot
export type Bank = {
  chips: number
  spins: number
  jackpots: number
  best: number
  streak: number
}

// outlaw
export type OutlawScore = { you: number; bugs: number; streak: number; best: number }

// tama
export type Stage = 'egg' | 'baby' | 'child' | 'teen' | 'worker' | 'rascal' | 'chubby'

export type Pet = {
  stage: Stage
  // Epoch milliseconds: when it hatched, and when hunger and joy last ticked down.
  born: number
  hungerAt: number
  joyAt: number
  hunger: number
  joy: number
  poops: number
  // Since when hunger has sat at 0; it leaves after twelve hours of it.
  starvingSince: number
  eggTurns: number
  turns: number
  wins: number
  errors: number
  cleanRun: number
  generation: number
  // Hand care left today, and which day that is (YYYY-MM-DD).
  careDay: string
  careLeft: number
}

// tetris
export type Tally = { score: number; lines: number; best: number; games: number }

// octo-invader
export type OctoScore = { xp: number; toppled: number; planes: number; tools: number }
export type OctoMood = 'idle' | 'work' | 'sad' | 'sleep' | 'rampage'
// duck-hunt
export type DuckScore = { hits: number; escaped: number; tools: number }

declare module 'claude-code' {
  interface PluginState {
    arcade: {
      // Which games this session shows, and the setting they were picked for.
      shown: readonly string[]
      pickedFor: string
      dragonHoard: Hoard
      dragonMood: DragonMood
      dragonFeat: string
      jackpotBank: Bank
      jackpotGolden: number
      jackpotLast: string
      outlawScore: OutlawScore
      tamaPet: Pet
      tetrisTally: Tally
      octopusScore: OctoScore
      octopusMood: OctoMood
      octopusFeat: string
      duckScore: DuckScore
      duckFeat: string
    }
  }
}
