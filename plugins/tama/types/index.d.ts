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

declare module 'claude-code' {
  interface PluginState {
    tama: { pet: Pet; isHidden: boolean }
  }
}
