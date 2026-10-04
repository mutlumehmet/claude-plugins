// secret-guard: when a tool result holds something that looks like a secret,
// the copy Claude reads is masked first, and the user is asked whether Claude
// may read that one result unmasked. Anything but "Show it raw" (a
// dismissed dialog, a claude -p run, this hook failing) keeps it masked.

const KEEP = 'Keep it masked'
const RAW = 'Show it raw'
const QUIET = "Always mask this session, don't ask"

// Each pattern masks the whole match, except bearer-token and secret-value,
// which keep the key name (group 1) and mask the value (group 2). Ordered from most to least specific.
const PATTERNS = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ['anthropic-key', /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['openai-key', /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['google-oauth-token', /\b(?:ya29\.[A-Za-z0-9_-]{20,}|1\/\/0[A-Za-z0-9_-]{20,})/g],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['stripe-key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['bearer-token', /(Bearer\s+)([A-Za-z0-9._~+/=-]{16,})/g],
  ['secret-value', /((?:api[_-]?key|secret|token|passw(?:or)?d|access[_-]?key|client[_-]?secret|auth)["']?\s*[:=]\s*["']?)([^\s"',;]{8,})/gi],
]

// Masks every secret in one string; counts what it found by kind into `found`
export function mask(text, found) {
  let out = text
  for (const [kind, re] of PATTERNS) {
    const keyed = kind === 'bearer-token' || kind === 'secret-value'
    out = out.replace(re, (...m) => {
      const whole = m[0]
      if (keyed) {
        if (m[2].startsWith('[MASKED')) return whole
        found[kind] = (found[kind] ?? 0) + 1
        return m[1] + '[MASKED ' + kind + ', ' + m[2].length + ' chars]'
      }
      found[kind] = (found[kind] ?? 0) + 1
      return '[MASKED ' + kind + ', ' + whole.length + ' chars]'
    })
  }
  return out
}

// The row's content with every text inside a tool_result masked
export function maskContent(content, found) {
  return content.map((block) => {
    if (block.type !== 'tool_result') return block
    if (typeof block.content === 'string') return { ...block, content: mask(block.content, found) }
    if (Array.isArray(block.content)) {
      return {
        ...block,
        content: block.content.map((b) => (b.type === 'text' ? { ...b, text: mask(b.text, found) } : b)),
      }
    }
    return block
  })
}

export const session = { quiet: false }

export function register(on) {
  on('session.append', { door: 'tool-result' }, guard).catch(async ($, e, next) => {
    // Fail closed: mask without asking
    return next({ ...e, message: { ...e.message, content: maskContent(e.message.content, {}) } })
  })
}

export async function guard($, e, next) {
  const found = {}
  const masked = maskContent(e.message.content, found)
  const kinds = Object.keys(found)
  if (kinds.length === 0) return next(e)

  const summary = kinds.map((k) => found[k] + ' × ' + k).join(', ')
  const tool = e.origin?.kind === 'tool' ? e.origin.tool : 'a tool'
  const keepMasked = () => next({ ...e, message: { ...e.message, content: masked } })

  if (session.quiet) {
    $.ui.toast('secret-guard: masked ' + summary + ' in the ' + tool + ' output')
    return keepMasked()
  }

  let answer = KEEP
  try {
    answer = await $.ui.ask(
      'The ' + tool + ' output holds what looks like secrets: ' + summary +
        '.\nClaude will see it masked. Let Claude read the raw output?',
      [KEEP, RAW, QUIET],
    )
  } catch {
    // Dismissed, or nobody there to ask: keep it masked
  }
  if (answer === RAW) return next(e)
  if (answer === QUIET) session.quiet = true
  return keepMasked()
}
