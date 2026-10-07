import { read, update, atom } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook } from 'claude-code'

import type { BugsScore as Score, BugsFeed as Feed } from '../../types'
import type { SkyEvent, SkyGain, SkyProps } from '../clients/bug-sky'
import type { Milestone } from '../milestones'
import { isShown } from '../shown'
import type { Game } from '../shown'

// Bug Command, the one Arcade game you can play along with. The sky is a Client
// (clients/bug-sky.tsx): it runs the game loop and takes the person's clicks and keys. This
// side hands it the session as events through an atom (a write redraws the band, which hands the
// sky its next props) and keeps the score the sky posts back.

const ID = 'bugs'
const SKY = 'bug-sky'
const ROWS = 8
const MIN_COLUMNS = 24
const MAX_COLUMNS = 512
const CITIES = 6
// The sky needs only the latest few: it plays each event once, by id.
const KEEP = 12

const score = atom({ plugin: 'arcade', key: 'bugsScore' } as const, { kills: 0, mine: 0, lost: 0, ends: 0, cities: CITIES, tools: 0 })
const feed = atom({ plugin: 'arcade', key: 'bugsFeed' } as const, { events: [], next: 1, working: false } as Feed)
const feat = atom({ plugin: 'arcade', key: 'bugsFeat' } as const, '')

const sim = { working: 0, isTurn: false }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// A hidden game stays quiet: its notifications are hidden too.
async function notify($: EngineInterface, text: string) {
  if (await isShown($, ID)) $.ui.toast(text)
}

async function push($: EngineInterface, kind: SkyEvent['kind'], practice = false) {
  await update($, feed, f => ({ ...f, next: f.next + 1, events: [...f.events, { id: f.next, kind, practice }].slice(-KEEP) }))
}

async function setWorking($: EngineInterface) {
  const working = sim.isTurn || sim.working > 0
  if ((await read($, feed)).working !== working) await update($, feed, f => ({ ...f, working }))
}

const statsLine = (s: Score) => `✸ ${s.kills}  ☞ ${s.mine}  ✝ ${s.lost}  ⚒ ${s.tools}`

async function save($: EngineInterface, change: (s: Score) => Score) {
  const next = await update($, score, change)
  return next
}

// ---- Moments ----

async function celebrate($: EngineInterface, label: string, kind: 'small' | 'medium' | 'big', isPractice = false) {
  await push($, kind, isPractice)
  if (kind === 'small' || isPractice) return
  const what = kind === 'medium' ? 'a bug shot down' : 'a salvo'
  await update($, feat, () => `${label}: ${what}`)
  void notify($, `🚀 ${label}! ${kind === 'medium' ? 'Bug down' : 'Sky clear'}!`)
}

export async function celebrateMoments($: EngineInterface, found: Milestone[]) {
  for (const m of found) await celebrate($, m.label, m.tier)
}

// ---- Hooks, chained by the Arcade's register with the other games' ----

export const start: Hook<'session.start'> = async ($, e, next) => {
  await $.command.register({
    name: 'bugs',
    description: 'Bug Command above the prompt: the score. Click the sky to fire. "/bugs shot|salvo|incoming" to show off.',
  })
  return next(e)
}

export const command: MatchedHook<'command.run', { command: 'bugs' }> = async ($, e) => {
  const arg = (e.args ?? '').trim()
  const practice: Record<string, 'small' | 'medium' | 'big'> = { shot: 'medium', salvo: 'big', flare: 'small' }
  if (practice[arg]) {
    await celebrate($, 'Practice', practice[arg]!, true)
    return { text: 'Practice: nothing counts.' }
  }
  if (arg === 'incoming') {
    await push($, 'fail', true)
    return { text: 'A practice bug is falling: shoot it down.' }
  }
  const last = await read($, feat)
  return {
    text:
      `${statsLine(await read($, score))}${last ? `\nLast win: ${last}` : ''}\n` +
      'Bugs fall on your cities while Claude works, and a failed tool drops a fast one. Every finished tool call fires a shot (most hit), ' +
      'a medium moment (a commit, a skill, a sent message) is a sure hit, a big one (a merge, a deploy) a salvo that clears the sky and rebuilds a city. ' +
      'You can fire too: click the sky to shoot from the nearest silo. After a click the sky has the keyboard: arrows move the crosshair, ' +
      'space fires, 1 2 3 fire from the left, middle or right silo; Esc gives the keyboard back to the prompt. ' +
      '✸ bugs shot down, ☞ the ones you shot yourself, ✝ cities lost, ⚒ tool calls; ⌂ in the band is the cities standing.',
  }
}

export const prompt: Hook<'prompt.submit'> = async ($, e, next) => {
  sim.isTurn = true
  await setWorking($)
  return next(e)
}

export const turn: Hook<'turn.complete'> = async ($, e, next) => {
  if (e.agentId === undefined) sim.isTurn = false
  await setWorking($)
  return next(e)
}

export const tool: Hook<'tool.call'> = async ($, e, next) => {
  if (e.agentId !== undefined) return next(e)
  sim.working += 1
  await setWorking($)
  const ran = await next(e).finally(() => {
    sim.working = Math.max(0, sim.working - 1)
  })
  await setWorking($)
  if (ran.deny !== undefined) return ran
  const counted = await update($, score, old => ({ ...old, tools: old.tools + 1 }))
  await push($, ran.isError === true ? 'fail' : 'tool')
  return ran
}

// What the sky posted: bugs down, cities lost, a lost round; the answer is its next props.
export const message: Hook<'ui.message'> = async ($, e, next) => {
  if (e.element !== SKY) return next(e)
  const g = e.data as Partial<SkyGain>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
  const s = await save($, old => ({
    ...old,
    kills: old.kills + n(g.kills),
    mine: old.mine + n(g.mine),
    lost: old.lost + n(g.lost),
    ends: old.ends + n(g.ends),
    cities: clamp(typeof g.cities === 'number' ? Math.floor(g.cities) : old.cities, 0, CITIES),
  }))
  if (n(g.ends) > 0) void notify($, '🚀 THE END: every city fell. New cities are up.')
  if (n(g.mine) > 0 && s.mine % 10 === 0) void notify($, `🚀 ${s.mine} bugs shot down by hand!`)
  return { props: await skyProps($, 0) }
}

async function skyProps($: EngineInterface, columns: number): Promise<SkyProps> {
  const f = await read($, feed)
  const s = await read($, score)
  return { events: [...f.events], stats: statsLine(s), working: f.working, cities: s.cities, columns }
}

// The sky runs the full width of the band, above whatever else is there.
export const render: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  const below = await next(e)
  if (e.surface !== 'terminal' || e.props.hasSurvey || !(await isShown($, ID))) return below
  const { Box, Client } = $.ui.resolve(e)
  const W = clamp(e.props.bodyColumns, MIN_COLUMNS, MAX_COLUMNS)

  return (
    <Box flexDirection="column">
      <Client key={SKY} module="./bug-sky.js" width={W} height={ROWS} props={await skyProps($, W)} />
      {below ?? null}
    </Box>
  )
}

// Clears this terminal's defence and rebuilds its cities; the Arcade asks first (`/bugs reset`, then `/bugs reset yes`).
export async function reset($: EngineInterface) {
  await update($, score, () => score.initial)
  await update($, feat, () => '')
}

export const game: Game = { id: ID, title: 'Bug Command' }
