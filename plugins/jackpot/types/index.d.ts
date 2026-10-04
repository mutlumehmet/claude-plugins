export type Bank = {
  chips: number
  spins: number
  jackpots: number
  best: number
  streak: number
}

declare module 'claude-code' {
  interface PluginState {
    jackpot: { bank: Bank; golden: number; last: string; isHidden: boolean }
  }
}
