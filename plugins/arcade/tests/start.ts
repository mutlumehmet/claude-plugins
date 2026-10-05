import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// Starts the session the way the engine does, so the Arcade picks the game a test pinned in its
// options (session.start does not fire by itself in a test). The games' frame timers need a clock.
export async function begin($: Engine, on: On, hasClock = false) {
  if (!hasClock) mock.clock(on)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}
