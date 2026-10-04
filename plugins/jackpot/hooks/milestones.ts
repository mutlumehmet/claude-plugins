// Spots the moments worth celebrating in a session, small, medium and big, coding or not.
// The same file ships inside every game mod (dragon-lair, jackpot, outlaw, tama, tetris),
// so each one works on its own. It holds no `$`: the game's hooks hand it what happened
// and act on the moments it returns.

import type { PluginOptions } from 'claude-code'

export type MilestoneTier = 'small' | 'medium' | 'big'
// kind: turn, file, long, deliverable, commit, push, pr, tests, green, merge, release, deploy,
// skill, subagent, squad, send, plan, page, todos, marathon, praise, streak, record, tools, command.
export type Milestone = { tier: MilestoneTier; kind: string; label: string }

const MARATHON_MS = 10 * 60 * 1000
const MARATHON_TOOLS = 30
const SQUAD = 3
const LONG_FILE_LINES = 200
const RECORDS = [100, 1000, 10000]
const STREAKS = [3, 7, 30, 100]

// Shell commands, first match wins. Big: work that ships. Medium: work that lands.
const COMMANDS: { test: RegExp; tier: MilestoneTier; kind: string; label: string }[] = [
  { test: /\bgh\s+pr\s+merge\b/, tier: 'big', kind: 'merge', label: 'Merged' },
  { test: /\bgh\s+release\s+create\b|\bnpm\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b/, tier: 'big', kind: 'release', label: 'Released' },
  {
    test: /\bvercel\b.*--prod\b|\bnetlify\s+deploy\b.*--prod\b|\bfly\s+deploy\b|\bfirebase\s+deploy\b|\bwrangler\s+(deploy|publish)\b|\brailway\s+up\b/,
    tier: 'big',
    kind: 'deploy',
    label: 'Deployed',
  },
  { test: /\bgh\s+pr\s+create\b/, tier: 'medium', kind: 'pr', label: 'Pull request' },
  { test: /\bgit\b[^|;&]*\bcommit\b/, tier: 'medium', kind: 'commit', label: 'Commit' },
  { test: /\bgit\b[^|;&]*\bpush\b/, tier: 'medium', kind: 'push', label: 'Push' },
]
const TESTS =
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bvitest\b|\bjest\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b|\bplugin\s+test\b|\brspec\b|\bphpunit\b/
const EMPTY = /nothing to commit|no changes added|Everything up-to-date/
// Files that are a thing made, not a note: a report, a deck, a sheet, a picture.
const DELIVERABLE = /\.(pdf|docx?|xlsx?|pptx?|key|pages|numbers|csv|png|jpe?g|svg|gif|mp4|mp3|wav|epub)$/i
// MCP tools that reach outside: they send, create or publish something.
const OUTWARD = /^mcp__.+__.*(send|create|post|publish|schedule|upload|reply|forward|invite|share|comment)/i
const PRAISE = [
  'thanks', 'thank you', 'great', 'perfect', 'amazing', 'awesome', 'brilliant', 'excellent', 'nice work', 'well done', 'love it',
  'gracias', 'genial', 'perfecto', 'merci', 'parfait', 'danke', 'super', 'perfetto', 'grazie', 'obrigado', 'ótimo',
]

const list = (text: unknown) =>
  String(text ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
const regex = (text: unknown) => {
  const source = String(text ?? '').trim()
  if (!source) return null
  try {
    return new RegExp(source, 'i')
  } catch {
    return null
  }
}

// The person's own settings (the plugin's userConfig), read once at load.
const config = {
  bigSkills: [] as string[],
  quietSkills: [] as string[],
  bigCommands: null as RegExp | null,
  mediumCommands: null as RegExp | null,
  praise: PRAISE,
}
// The current turn and the session so far.
const turn = { startedAt: 0, tools: 0, errors: 0, subagents: 0, skills: [] as string[] }
const session = { tools: 0, tasksMade: 0, tasksDone: 0, testsFailed: false, todosDone: false }

export function configureMilestones(options: PluginOptions) {
  config.bigSkills = list(options.big_skills)
  config.quietSkills = list(options.quiet_skills)
  config.bigCommands = regex(options.big_commands)
  config.mediumCommands = regex(options.medium_commands)
  config.praise = [...PRAISE, ...list(options.praise_words)]
}

// Days in a row: called once at the session's start with what the game stored.
export function streakMilestones(
  stored: { last: string; streak: number } | undefined,
  now: number,
): { days: { last: string; streak: number }; found: Milestone[] } {
  const today = new Date(now).toISOString().slice(0, 10)
  const yesterday = new Date(now - 86400000).toISOString().slice(0, 10)
  const days = stored ?? { last: '', streak: 0 }
  if (days.last === today) return { days, found: [] }
  const streak = days.last === yesterday ? days.streak + 1 : 1
  return {
    days: { last: today, streak },
    found: STREAKS.includes(streak) ? [{ tier: 'big', kind: 'streak', label: `${streak} days in a row` }] : [],
  }
}

export function promptMilestones(text: string, now: number): Milestone[] {
  turn.startedAt = now
  turn.tools = 0
  turn.errors = 0
  turn.subagents = 0
  turn.skills = []
  const said = ` ${text.toLowerCase()} `
  const isPraise = config.praise.some(word => new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'u').test(said))
  return isPraise ? [{ tier: 'medium', kind: 'praise', label: 'You said something nice' }] : []
}

export function skillSeen(skill: string) {
  turn.skills.push(skill)
}

export function subagentMilestones(): Milestone[] {
  turn.subagents += 1
  const found: Milestone[] = [{ tier: 'medium', kind: 'subagent', label: 'A subagent finished' }]
  if (turn.subagents === SQUAD) found.push({ tier: 'big', kind: 'squad', label: `${SQUAD} subagents done` })
  return found
}

// A finished turn of the main conversation: its skills, and a marathon or a plain turn.
export function turnMilestones(now: number): Milestone[] {
  const found: Milestone[] = []
  for (const skill of new Set(turn.skills)) {
    const name = skill.toLowerCase().replace(/^.*:/, '')
    const full = skill.toLowerCase()
    if ([name, full].some(n => config.quietSkills.includes(n))) continue
    const isBig = [name, full].some(n => config.bigSkills.includes(n))
    found.push({ tier: isBig ? 'big' : 'medium', kind: 'skill', label: `Skill: ${name}` })
  }
  const isMarathon =
    turn.startedAt > 0 && now - turn.startedAt > MARATHON_MS && turn.tools >= MARATHON_TOOLS && turn.errors === 0
  found.push(
    isMarathon
      ? { tier: 'big', kind: 'marathon', label: 'A marathon turn, no errors' }
      : { tier: 'small', kind: 'turn', label: 'Turn done' },
  )
  turn.skills = []
  return found
}

// A tool call of the main conversation, after it ran.
export function toolMilestones(e: { tool: unknown }, ran: { isError?: boolean; text?: string }): Milestone[] {
  const tool = String(e.tool)
  const input = e as unknown as Record<string, unknown>
  turn.tools += 1
  session.tools += 1
  const found: Milestone[] = []
  if (RECORDS.includes(session.tools)) found.push({ tier: 'big', kind: 'record', label: `${session.tools} tool calls` })
  else if (turn.tools % 10 === 0) found.push({ tier: 'small', kind: 'tools', label: `${turn.tools} tools this turn` })

  if (ran.isError === true) {
    turn.errors += 1
    if (tool === 'Bash' && TESTS.test(String(input.command ?? ''))) session.testsFailed = true
    return found
  }

  if (tool === 'Bash') {
    const command = String(input.command ?? '')
    if (EMPTY.test(ran.text ?? '')) return found
    if (config.bigCommands?.test(command)) return [...found, { tier: 'big', kind: 'command', label: 'Big command done' }]
    const known = COMMANDS.find(c => c.test.test(command))
    if (known) return [...found, { tier: known.tier, kind: known.kind, label: known.label }]
    if (TESTS.test(command)) {
      // Tests that failed earlier this session and pass now: back to green.
      const wasRed = session.testsFailed
      session.testsFailed = false
      return [
        ...found,
        wasRed ? { tier: 'big', kind: 'green', label: 'Tests back to green' } : { tier: 'medium', kind: 'tests', label: 'Tests passed' },
      ]
    }
    if (config.mediumCommands?.test(command)) found.push({ tier: 'medium', kind: 'command', label: 'Command done' })
    return found
  }

  if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
    const path = String(input.file_path ?? input.notebook_path ?? '')
    const name = path.split('/').pop() ?? path
    const lines = String(input.content ?? '').split('\n').length
    if (tool === 'Write' && DELIVERABLE.test(path)) found.push({ tier: 'big', kind: 'deliverable', label: `Made ${name}` })
    else if (tool === 'Write' && lines > LONG_FILE_LINES) found.push({ tier: 'medium', kind: 'long', label: `Wrote ${name}` })
    else found.push({ tier: 'small', kind: 'file', label: `Saved ${name}` })
    return found
  }

  if (tool === 'Artifact') {
    const action = String(input.action ?? 'publish')
    if (action === 'publish' && input.asset !== true && (input.file_path || input.type_url)) {
      found.push({ tier: 'big', kind: 'page', label: 'Published a page' })
    }
    return found
  }

  if (tool === 'ExitPlanMode') return [...found, { tier: 'medium', kind: 'plan', label: 'Plan approved' }]

  // The task list: all done, with at least three on it.
  if (tool === 'TodoWrite') {
    const todos = Array.isArray(input.todos) ? (input.todos as { status?: string }[]) : []
    const isDone = todos.length >= 3 && todos.every(t => t.status === 'completed')
    if (isDone && !session.todosDone) found.push({ tier: 'big', kind: 'todos', label: `All ${todos.length} tasks done` })
    session.todosDone = isDone
    return found
  }
  if (tool === 'TaskCreate') session.tasksMade += 1
  if (tool === 'TaskUpdate' && input.status === 'completed') {
    session.tasksDone += 1
    if (session.tasksMade >= 3 && session.tasksDone >= session.tasksMade) {
      found.push({ tier: 'big', kind: 'todos', label: `All ${session.tasksMade} tasks done` })
      session.tasksMade = 0
      session.tasksDone = 0
    }
    return found
  }

  if (OUTWARD.test(tool)) {
    const verb = tool.match(/(send|create|post|publish|schedule|upload|reply|forward|invite|share|comment)/i)?.[1] ?? 'send'
    found.push({ tier: 'medium', kind: 'send', label: `${verb[0]!.toUpperCase()}${verb.slice(1).toLowerCase()} done` })
  }
  return found
}
