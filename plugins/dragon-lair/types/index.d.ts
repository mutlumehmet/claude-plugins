export type Hoard = { gold: number; meals: number; feats: number }
export type Mood = 'idle' | 'work' | 'sad' | 'sleep' | 'fire'

declare module 'claude-code' {
  interface PluginState {
    'dragon-lair': { hoard: Hoard; mood: Mood; feat: string; isHidden: boolean }
  }
}
