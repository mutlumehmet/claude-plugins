import type { EngineInterface } from 'claude-code'

// Where the Arcade's games keep what lasts between sessions: per project, so each repository has
// its own town, score and pet, shared by every terminal and every worktree of it.
//
// - The project is the repository the session runs in: the folder holding `.git`, or for a git
//   worktree the main repository its `.git` file points at. Outside any repository, the folder
//   itself. Nothing is written into the project: the values live in Claude Code's plugin store,
//   under the key with `@` and a short hash of the project's path appended.
// - A save reads the stored value, applies the change to it and writes the result, so two
//   terminals of the same project add up instead of writing over each other. Changes are written
//   as functions of the old value (`old => ({ ...old, hits: old.hits + 1 })`), never as a copy.
// - A reset writes the initial value rather than deleting the key, so another terminal's next
//   save starts from the reset too.
// - A project nobody opened for 90 days is forgotten: its keys are deleted.
// - Scores from before 0.8.0 move to the home folder's project (`~`), the first time any session
//   of the account starts.

const FORGET_AFTER_MS = 90 * 24 * 60 * 60 * 1000
const PROJECTS = 'arcade.projects'

// One object, not two `let`s: the build turns every top-level `var` into a `const`.
const here = { project: '', path: '', home: '' }

// FNV-1a, 32 bits, in base 36: short, stable, and not the path itself.
function hash(text: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export const scoped = (key: string) => (here.project ? `${key}@${here.project}` : key)
export const projectName = () => here.path.split('/').filter(Boolean).pop() ?? here.path

// The repository root above `cwd`, a worktree's main repository, or `cwd` when there is none.
async function rootOf($: EngineInterface, cwd: string) {
  let dir = cwd.replace(/\/+$/, '') || '/'
  for (let i = 0; i < 64; i++) {
    const git = `${dir === '/' ? '' : dir}/.git`
    let isThere = false
    try {
      isThere = await $.fs.exists(git)
    } catch {
      return cwd
    }
    if (isThere) {
      try {
        // A worktree's `.git` is a file: "gitdir: <main>/.git/worktrees/<name>".
        const line = (await $.fs.read(git)).match(/^gitdir:\s*(.+)$/m)?.[1]?.trim() ?? ''
        const at = line.indexOf('/.git/worktrees/')
        if (at > 0) return line.slice(0, at)
      } catch {
        // A directory: this is the repository's own root.
      }
      return dir
    }
    if (dir === '/') break
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  }
  return cwd
}

// Called once at session start, before any game loads its values.
export async function useProject($: EngineInterface, cwd: string) {
  here.path = await rootOf($, cwd)
  here.project = hash(here.path)
  // The home folder's project: where scores from before per project saving go.
  let home: string | undefined
  try {
    home = await $.env.get('HOME')
  } catch {
    home = undefined
  }
  here.home = home ? hash(await rootOf($, home)) : here.project
  // Remember when each project was last opened, and forget the ones left for 90 days.
  try {
    const now = await $.clock.now()
    // Values come back from the store frozen: work on a copy.
    const seen = { ...(((await $.store.get(PROJECTS)) as Record<string, { path: string; at: number }> | undefined) ?? {}) }
    seen[here.project] = { path: here.path, at: now }
    const stale = Object.keys(seen).filter(p => now - seen[p]!.at > FORGET_AFTER_MS)
    if (stale.length > 0) {
      for (const key of await $.store.keys()) if (stale.some(p => key.endsWith(`@${p}`))) await $.store.delete(key)
      for (const p of stale) delete seen[p]
    }
    await $.store.set(PROJECTS, seen)
  } catch {
    // No clock or store keys here (a test, `claude -p`): nothing to forget.
  }
}

// Reads a value for this project. A value saved before the Arcade kept values per project moves,
// once, to the home folder's project (the one Claude Code opens in from `~`), so the old scores
// have one place to be found; every other project starts fresh.
export async function loadKept($: EngineInterface, key: string): Promise<unknown> {
  const value = await $.store.get(scoped(key))
  if (value !== undefined || scoped(key) === key) return value
  const old = await $.store.get(key)
  if (old === undefined) return undefined
  const homeKey = `${key}@${here.home || here.project}`
  if ((await $.store.get(homeKey)) === undefined) await $.store.set(homeKey, old)
  await $.store.delete(key)
  return homeKey === scoped(key) ? old : undefined
}

// Saves are queued per key, so two saves in one session never read the same old value.
const queues = new Map<string, Promise<unknown>>()

// Returns the change for the game's own atom: `await update($, score, await keep($, 'duck.score',
// await read($, score), change))`. The atom is written at the call site, where the engine's scan
// can see which value it is; the stored value only falls back to the atom's when nothing is stored.
export function keep<T>($: EngineInterface, key: string, current: T, change: (old: T) => T): Promise<() => T> {
  const k = scoped(key)
  const run = (queues.get(k) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const stored = (await $.store.get(k)) as T | undefined
    const next = change(stored ?? current)
    await $.store.set(k, next)
    return () => next
  })
  queues.set(k, run)
  return run
}
