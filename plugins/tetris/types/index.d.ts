export type Tally = { score: number; lines: number; best: number; games: number }

declare module 'claude-code' {
  interface PluginState {
    tetris: { tally: Tally; isHidden: boolean }
  }
}
