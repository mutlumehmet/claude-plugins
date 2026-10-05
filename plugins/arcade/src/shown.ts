import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

// One game of the Arcade. Its file also exports one hook per event (start, command, prompt,
// turn, tool, render) and `celebrate`, which register.tsx calls by name: the engine takes `$`
// handed only to functions named in the module, never through a list.
export type Game = { id: string; title: string }

// The games this session shows. Every game keeps playing while hidden; it only stops drawing
// and stays quiet, so showing it again picks up where it is.
export const shown = atom({ plugin: 'arcade', key: 'shown' } as const, [] as readonly string[])

export async function isShown($: EngineInterface, id: string) {
  return (await read($, shown)).includes(id)
}

