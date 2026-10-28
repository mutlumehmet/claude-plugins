// orca-strator: a session that starts in a project with a fleet config (.claude/orca-strator.json)
// gets one line saying how to start or join the fleet. /orca itself needs no code: Claude Code
// already opens this plugin's orca skill for it. It never starts a fleet by itself.

const UP = 5 // folders to look up for .claude/orca-strator.json

export function register(on) {
  on('session.start', async ($, e, next) => {
    if (await fleetConfig($, e.cwd || (await $.session.cwd()))) {
      $.ui.toast('Orca Strator fleet project. /orca to start or join the fleet, /orca status for every session.', { timeoutMs: 12000 })
    }
    return next(e)
  })
}

async function fleetConfig($, start) {
  let dir = String(start || '').replace(/\/+$/, '')
  for (let i = 0; i < UP && dir; i++) {
    if (await $.fs.exists(dir + '/.claude/orca-strator.json')) return true
    dir = dir.slice(0, dir.lastIndexOf('/'))
  }
  return false
}
