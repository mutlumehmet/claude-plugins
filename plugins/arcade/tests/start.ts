import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// The setting a test plays under: pin() at the top of the test, begin() applies it through /arcade,
// the way a player would (the Arcade has no install settings since 0.10.0).
type Pin = { mode: string; pool: string; big_commands?: string }
const pending: { pin: Pin | null } = { pin: null }
export function pin(setting: Pin) {
  pending.pin = setting
}

// Starts the session the way the engine does (session.start does not fire by itself in a test),
// then applies the pinned setting. The games' frame timers need a clock.
export async function begin($: Engine, on: On, hasClock = false) {
  if (!hasClock) mock.clock(on)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }) as never)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const setting = pending.pin
  pending.pin = null
  if (setting === null) return
  if (setting.pool.trim() !== '') await $.command.run({ command: 'arcade', args: `pool ${setting.pool}` } as never)
  await $.command.run({ command: 'arcade', args: setting.mode } as never)
  if (setting.big_commands) await $.command.run({ command: 'arcade', args: `moments big_commands ${setting.big_commands}` } as never)
}
