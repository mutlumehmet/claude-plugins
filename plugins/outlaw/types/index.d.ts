export type Score = { you: number; bugs: number; streak: number; best: number }

declare module 'claude-code' {
  interface PluginState {
    outlaw: { score: Score; isHidden: boolean }
  }
}
