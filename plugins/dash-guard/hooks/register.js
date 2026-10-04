// dash-guard: refuses prose that Claude writes with an em dash, an en dash or
// a double hyphen (which of the three: the banned setting), and tells
// Claude which lines to rewrite. Code is left alone: fenced blocks, inline
// code, HTML comments, and files that are not prose. Lines that already had a
// dash before this call are not reported, so old files can still be edited.
//
// It is a style rule, not a safety gate, so a hook failure lets the call
// through (no .catch).

const PROSE_FILE = /\.(md|mdx|markdown|txt)$/i
const MAX_REPORTED = 8

// Exactly two hyphens used as punctuation: "a -- b", "a--b", "end--". A CLI flag such as
// " --force" (a space or start of line before, a letter after) is not punctuation.
const DOUBLE_HYPHEN = /(?<!-)--(?![-\w])|(?<=\w)--(?=\w)/

let enabled = true
// From the settings: which marks are refused, and which MCP tools are checked besides Write and Edit
let banned = new Set(['em', 'en', 'double'])
let mcpTools = null
const LABEL = { em: 'em dashes', en: 'en dashes', double: 'double hyphens' }

export function configure(options) {
  const want = String(options?.banned ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x in LABEL)
  banned = new Set(want.length ? want : ['em', 'en', 'double'])
  mcpTools = null
  const pattern = String(options?.tools ?? '').trim()
  if (pattern) {
    try {
      mcpTools = new RegExp(pattern)
    } catch {
      // An invalid pattern checks Write and Edit only
    }
  }
}

export function register(on, options) {
  configure(options)
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'dash-guard',
      description: 'dash-guard on, off, or status for this session',
      argumentHint: '[on|off]',
    })
    return next(e)
  })

  on('command.run', { command: 'dash-guard' }, async ($, e) => {
    const arg = String(e.args ?? '').trim().toLowerCase()
    if (arg === 'off') enabled = false
    if (arg === 'on') enabled = true
    return { text: 'dash-guard is ' + (enabled ? 'on' : 'off') + ' for this session' }
  })

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    if (!enabled || !PROSE_FILE.test(String(e.file_path ?? ''))) return next(e)
    let before = ''
    if (e.tool === 'Edit') {
      before = e.old_string ?? ''
    } else {
      try {
        before = await $.fs.read(e.file_path)
      } catch {
        // A new file: nothing was there before
      }
    }
    const text = e.tool === 'Edit' ? e.new_string : e.content
    const found = findDashes(text, before)
    return found.length ? { deny: denyText(e.file_path, found) } : next(e)
  })

  // MCP tools that write prose (a document, an email, a message), named by the tools setting
  on('tool.call', { tool: /^mcp__/ }, async ($, e, next) => {
    if (!enabled || !mcpTools || !mcpTools.test(e.tool)) return next(e)
    const { tool, tool_use_id, agentId, ...args } = e
    const found = []
    for (const s of strings(args)) found.push(...findDashes(s, ''))
    return found.length ? { deny: denyText(tool.replace(/^mcp__/, ''), found) } : next(e)
  })
}

// Every string inside the arguments, however deeply nested
function strings(v) {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(strings)
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings)
  return []
}

// Blanks out code so its dashes are not reported: fenced blocks (also indented ones inside a
// list), inline code, HTML comments.
// Newlines are kept, so line numbers still match the original text.
export function stripCode(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return String(text)
    .replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(^[ \t]*\1[^\n]*$|(?![\s\S]))/gm, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/`[^`\n]+`/g, blank)
}

// Lines of `text` holding an em dash, an en dash or exactly two hyphens, skipping code and
// any line that already appears in `before`. Returns [{ line, kind, text }].
export function findDashes(text, before) {
  const old = new Set(String(before ?? '').split('\n').map((l) => l.trim()))
  const raw = String(text ?? '').split('\n')
  const clean = stripCode(text).split('\n')
  const found = []
  clean.forEach((l, i) => {
    const kinds = []
    if (banned.has('em') && l.includes('—')) kinds.push('em dash')
    if (banned.has('en') && l.includes('–')) kinds.push('en dash')
    if (banned.has('double') && DOUBLE_HYPHEN.test(l)) kinds.push('double hyphen')
    if (kinds.length && !old.has(raw[i].trim())) found.push({ line: i + 1, kind: kinds.join(', '), text: raw[i].trim() })
  })
  return found
}

function denyText(where, found) {
  const shown = found.slice(0, MAX_REPORTED).map((f) => '  line ' + f.line + ' (' + f.kind + '): ' + clip(f.text))
  const more = found.length > MAX_REPORTED ? ['  and ' + (found.length - MAX_REPORTED) + ' more'] : []
  return [
    'dash-guard: nothing was written to ' + where + '. The user\'s style rule forbids ' + [...banned].map((k) => LABEL[k]).join(', ') + ' in prose.',
    ...shown,
    ...more,
    'Rewrite those lines: split into a new sentence, or use a comma, colon or parentheses. Put CLI flags and code in backticks. Then try again.',
  ].join('\n')
}

function clip(s) {
  return s.length > 140 ? s.slice(0, 140) + '...' : s
}
