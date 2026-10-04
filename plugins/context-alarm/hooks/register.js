// context-alarm: watches how full the context window is. Past the threshold
// (80% by default) it pins a status line, shows a toast and puts /save-context
// in the empty prompt box as a dim suggestion (Tab takes it). Ten points later
// it warns once more. Before an automatic compaction it warns if save-context
// has not run since the first warning. It never runs save-context itself and
// never stops a compaction.

const REARM_BELOW = 10 // points under the threshold that count as "emptied again"

let warnAt = 80
let level = 0 // 0 quiet, 1 warned at warnAt, 2 warned at warnAt + 10
let percent = null
let saved = false // save-context ran since the first warning

export function register(on, options) {
  const n = Number.parseInt(String(options?.warn_percent ?? '80'), 10)
  warnAt = Number.isFinite(n) && n >= 50 && n <= 95 ? n : 80

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-alarm',
      description: 'Show how full the context is and when context-alarm warns',
    })
    return next(e)
  })

  on('command.run', { command: 'context-alarm' }, async () => {
    const now = percent === null ? 'not measured yet' : percent + '%'
    return {
      text:
        'Context: ' + now + ' · warns at ' + warnAt + '% and ' + (warnAt + 10) + '%' +
        ' · save-context since the warning: ' + (saved ? 'ran' : 'not run'),
    }
  })

  // Every change in the fill. The main conversation's window only: subagents
  // have their own and do not fire this.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') && typeof e.context.percent === 'number') {
      await onPercent($, e.context.percent)
    }
    return next(e)
  })

  // After the turn the prompt box is free, so the suggestion can show
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && level > 0 && !saved) {
      $.clock.after(300, () => suggest($))
    }
    return result
  })

  on('skill.prompt', { skill: 'save-context' }, async ($, e, next) => {
    saved = true
    if (percent !== null) $.ui.status(statusText())
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (!e.agentId && e.trigger === 'auto' && level > 0 && !saved) {
      $.ui.toast('Auto compaction is starting and save-context has not run in this session. The summary may lose some details.', { timeoutMs: 12000 })
    }
    return next(e)
  })
}

async function onPercent($, p) {
  percent = p

  if (p < warnAt - REARM_BELOW) {
    // Emptied, usually by a compaction or /clear: start over
    if (level > 0) $.ui.status(undefined)
    level = 0
    saved = false
    return
  }

  if (p >= warnAt + 10 && level < 2) {
    level = 2
    $.ui.toast('Context ' + p + '% full. Auto compaction is close: run /save-context now.', { timeoutMs: 12000 })
  } else if (p >= warnAt && level < 1) {
    level = 1
    $.ui.toast('Context ' + p + '% full. Time to save decisions with /save-context.', { timeoutMs: 10000 })
  }

  if (level > 0) $.ui.status(statusText())
}

function statusText() {
  return saved
    ? 'Context ' + percent + '% · save-context ran'
    : 'Context ' + percent + '% · /save-context suggested'
}

async function suggest($) {
  try {
    await $.prompt.suggest({ text: '/save-context' })
  } catch {
    // Headless, or the box is busy: the status line still says it
  }
}
