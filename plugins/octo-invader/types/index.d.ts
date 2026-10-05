export type Score = { xp: number; toppled: number; planes: number; tools: number }
export type Mood = 'idle' | 'work' | 'sad' | 'sleep' | 'rampage'

declare module 'claude-code' {
  interface PluginState {
    'octo-invader': { score: Score; mood: Mood; feat: string; isHidden: boolean }
  }
}
