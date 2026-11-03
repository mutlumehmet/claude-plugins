// orca-peers: saves this session's own context reading (tokens, window, percent) to
// ~/.config/orca-strator/context/<sessionId>.json whenever it changes, so /peers in any
// account shows the number Claude Code itself measured. Before this, peers.py estimated
// the fill from the transcript against a guessed window (200k unless the model name said
// otherwise), which read 1M-window sessions two to five times too high and ordered
// handovers that were not needed (3 November 2026). Nothing else: no UI, no command.

let dir = null
let id = null

async function setup($) {
  if (dir && id) return
  const home = (await $.env.get('HOME')) || ''
  dir = home + '/.config/orca-strator/context'
  id = await $.session.id()
}

async function save($, context) {
  if (!context || typeof context.percent !== 'number') return
  await setup($)
  if (!id) return
  const row = {
    sessionId: id,
    tokens: typeof context.tokens === 'number' ? context.tokens : null,
    window: typeof context.window === 'number' ? context.window : null,
    percent: context.percent,
    at: await $.clock.now(),
  }
  await $.fs.write(dir + '/' + id + '.json', JSON.stringify(row) + '\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      const usage = await $.session.usage()
      await save($, usage && usage.context)
    } catch {
      // a session with no reading yet, or a sandbox without a home: the next measure writes it
    }
    return next(e)
  })

  // The main conversation's window only: subagents have their own and do not fire this
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      try {
        await save($, e.context)
      } catch {
        // never let a failed write disturb the session
      }
    }
    return next(e)
  })
}
