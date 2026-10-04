// shared-file-guard: refuses a Bash command that would write a shared file
// (STATUS.md, CLAUDE.md and MEMORY.md by default; the watched_files setting) when this
// session never read it, or another session changed it since this session
// last saw it. The Edit and Write tools already refuse a stale file on their
// own, so the guard only records what they saw; the gap it closes is the
// shell: heredocs, python scripts, sed -i, tee, mv and cp.
//
// It fails open: if the hook crashes, the command runs as it would without
// the mod, because blocking every Bash call on a bug would be worse than the
// race it guards against.

// Basenames that count as shared, from the watched_files setting: names, * matching any run of
// name characters (such as *register*.md)
const DEFAULT_WATCHED = 'STATUS.md,CLAUDE.md,MEMORY.md'
let SHARED = /$^/
// Path-like tokens in a shell command that end in a shared basename
let TOKEN = /$^/g

export function configure(options) {
  const names = String(options?.watched_files || DEFAULT_WATCHED).split(',').map((x) => x.trim()).filter(Boolean)
  const alt = (star) => names.map((n) => n.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join(star)).join('|')
  SHARED = new RegExp('(^|/)(' + alt('[^/\\s\'"]*') + ')$', 'i')
  TOKEN = new RegExp('[~\\w./-]*(?:' + alt('[\\w.-]*') + ')', 'gi')
}

// Anything that can change a file. -i counts only after sed or perl (an in place edit); for grep
// it means ignore case. Redirects to a file descriptor or /dev/null are removed before this runs.
// Interpreters count as writes, because a script can open the file for writing.
const WRITES = /(>|\btee\b|\b(?:sed|perl)\b[^|;&]*\s-i(?:\b|['"])|--in-place|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bdd\b|\bpython3?\b|\bnode\b|\bperl\b|\bruby\b|\bosascript\b|\bgit\s+(checkout|restore|reset|stash|apply|merge|rebase|pull|mv|rm)\b)/

// What this session last saw of each shared file: absolute path -> "mtimeMs:size"
const seen = new Map()
let isOn = true

export function register(on, options) {
  configure(options)
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'shared-file-guard',
      description: 'Show which shared files this session has seen, or turn the guard off|on',
      argumentHint: '[off|on]',
    })
    return next(e)
  })

  on('command.run', { command: 'shared-file-guard' }, async ($, e) => {
    const arg = String(e.args ?? '').trim()
    if (arg === 'off') isOn = false
    if (arg === 'on') isOn = true
    const files = [...seen.keys()]
    return {
      text: 'Guard ' + (isOn ? 'on' : 'off') + '. Shared files this session has seen: ' + (files.length ? files.join(', ') : 'none yet'),
    }
  })

  // Read, Edit and Write: let them run, then remember the version they left
  on('tool.call', { tool: ['Read', 'Edit', 'Write'] }, async ($, e, next) => {
    const result = await next(e)
    if (!result.deny && !result.isError && e.file_path && SHARED.test(e.file_path)) {
      await remember($, e.file_path)
    }
    return result
  })

  // Bash: check before a write, remember after any command that touched one
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const paths = await sharedPaths($, e.command)
    if (!paths.length) return next(e)

    if (isOn && looksLikeWrite(e.command)) {
      const problems = []
      for (const p of paths) {
        const now = await version($, p)
        if (now === null) continue // does not exist yet: creating it is fine
        const before = seen.get(p)
        if (before === undefined) problems.push(p + ' has not been read in this session')
        else if (before !== now) problems.push(p + ' changed since this session last read it (another session or process wrote it)')
      }
      if (problems.length) {
        $.ui.log('shared-file-guard held a write: ' + problems.join('; '))
        return {
          deny:
            'shared-file-guard refused this command, so nothing ran. ' + problems.join('; ') + '. ' +
            'Read the file again with the Read tool, merge your change into what is there now, then write it. ' +
            'If the user wants to skip the check, they can run /shared-file-guard off.',
        }
      }
    }

    const result = await next(e)
    // Whatever the command did, the file as it is now is what this session has seen
    for (const p of paths) await remember($, p)
    return result
  })
}

function looksLikeWrite(command) {
  const cleaned = String(command)
    .replace(/\d*>&\d/g, ' ')
    .replace(/&>\s*\/dev\/null/g, ' ')
    .replace(/\d*>\s*\/dev\/null/g, ' ')
  return WRITES.test(cleaned)
}

// Absolute paths of the shared files a command names that exist on disk now
async function sharedPaths($, command) {
  const tokens = String(command).match(TOKEN) ?? []
  if (!tokens.length) return []
  const home = await $.env.get('HOME')
  const cwd = await $.session.cwd()
  const out = new Set()
  for (const t of tokens) {
    let p = t
    if (p.startsWith('~/')) p = home + p.slice(1)
    else if (!p.startsWith('/')) p = cwd + '/' + p
    p = normalize(p)
    if (SHARED.test(p) && (await version($, p)) !== null) out.add(p)
  }
  return [...out]
}

function normalize(p) {
  const parts = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

async function version($, path) {
  try {
    const s = await $.fs.stat(path)
    return s.kind === 'file' ? s.mtimeMs + ':' + s.size : null
  } catch {
    return null
  }
}

async function remember($, path) {
  const p = normalize(path)
  const v = await version($, p)
  if (v !== null) seen.set(p, v)
}
