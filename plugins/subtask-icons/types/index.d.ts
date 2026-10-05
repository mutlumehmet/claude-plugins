// The answers that had a list, newest last, and the list pinned in the band. Kept in
// the host's state so a hot reload does not lose them.
export type Pinned = { answer: string; sent: number[] }

declare module 'claude-code' {
  interface PluginState {
    'subtask-icons': { answers: string[]; pinned: Pinned | null }
  }
}
