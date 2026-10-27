// orca-move: the one part of a move that has to happen inside Claude Code. The switch skill
// writes ~/.config/orca-strator/moves/<first 8 of the session id>.exit and starts a helper that
// waits for this process to end. This mod watches for that request; once it is there it runs
// /exit through Claude Code itself (queued until the session is idle), so nothing is ever typed
// into the prompt. It exits only while the prompt box is empty: a draft would be lost, so instead
// it says so once and waits for the person to clear it or run /exit themselves.

const CHECK_MS = 2000

let id = ''
let dir = ''
let told = false
let leaving = false

export function register(on) {
  on('session.start', async ($, e, next) => {
    const home = (await $.env.get('HOME')) || ''
    dir = home + '/.config/orca-strator/moves'
    id = await $.session.id()
    told = false
    leaving = false
    $.clock.every(CHECK_MS, () => { void check($) })
    return next(e)
  })
}

async function check($) {
  if (leaving || !id) return
  const file = dir + '/' + id.slice(0, 8) + '.exit'
  if (!(await $.fs.exists(file))) return
  let asked = ''
  try {
    asked = String(await $.fs.read(file)).trim()
  } catch {
    return
  }
  if (asked !== id) return
  const box = await $.prompt.read()
  if (box.text.trim()) {
    if (!told) {
      told = true
      $.ui.toast('orca-move is waiting to move this session: clear the prompt box, or run /exit yourself.', { timeoutMs: 15000 })
    }
    return
  }
  leaving = true
  await $.fs.write(file, '')
  try {
    await $.command.run({ command: 'exit' })
  } catch {
    leaving = false
    await $.fs.write(file, id + '\n')
  }
}
