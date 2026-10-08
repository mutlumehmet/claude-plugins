import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import {
  start as dragonStart,
  command as dragonCommand,
  prompt as dragonPrompt,
  turn as dragonTurn,
  tool as dragonTool,
  render as dragonRender,
  celebrateMoments as dragonCelebrate,
  game as dragonGame,
  reset as dragonReset,
} from './games/dragon-lair'
import {
  start as duckStart,
  command as duckCommand,
  prompt as duckPrompt,
  turn as duckTurn,
  tool as duckTool,
  render as duckRender,
  celebrateMoments as duckCelebrate,
  game as duckGame,
  reset as duckReset,
} from './games/duck-hunt'
import {
  start as jackpotStart,
  command as jackpotCommand,
  prompt as jackpotPrompt,
  turn as jackpotTurn,
  tool as jackpotTool,
  render as jackpotRender,
  celebrateMoments as jackpotCelebrate,
  game as jackpotGame,
  reset as jackpotReset,
} from './games/jackpot'
import {
  start as octopusStart,
  command as octopusCommand,
  prompt as octopusPrompt,
  turn as octopusTurn,
  tool as octopusTool,
  render as octopusRender,
  celebrateMoments as octopusCelebrate,
  game as octopusGame,
  reset as octopusReset,
} from './games/octo-invader'
import {
  start as outlawStart,
  command as outlawCommand,
  prompt as outlawPrompt,
  turn as outlawTurn,
  tool as outlawTool,
  render as outlawRender,
  celebrateMoments as outlawCelebrate,
  game as outlawGame,
  reset as outlawReset,
} from './games/outlaw'
import {
  start as tamaStart,
  command as tamaCommand,
  prompt as tamaPrompt,
  turn as tamaTurn,
  tool as tamaTool,
  render as tamaRender,
  celebrateMoments as tamaCelebrate,
  game as tamaGame,
  reset as tamaReset,
} from './games/tama'
import {
  start as tetrisStart,
  command as tetrisCommand,
  prompt as tetrisPrompt,
  turn as tetrisTurn,
  tool as tetrisTool,
  render as tetrisRender,
  celebrateMoments as tetrisCelebrate,
  game as tetrisGame,
  reset as tetrisReset,
} from './games/tetris'
import {
  start as bugsStart,
  command as bugsCommand,
  prompt as bugsPrompt,
  turn as bugsTurn,
  tool as bugsTool,
  message as bugsMessage,
  render as bugsRender,
  celebrateMoments as bugsCelebrate,
  game as bugsGame,
  reset as bugsReset,
} from './games/bug-command'
import {
  start as darioStart,
  command as darioCommand,
  prompt as darioPrompt,
  turn as darioTurn,
  tool as darioTool,
  render as darioRender,
  celebrateMoments as darioCelebrate,
  game as darioGame,
  reset as darioReset,
} from './games/dario'
import {
  start as townStart,
  command as townCommand,
  prompt as townPrompt,
  turn as townTurn,
  tool as townTool,
  render as townRender,
  celebrateMoments as townCelebrate,
  game as townGame,
  reset as townReset,
} from './games/block-town'
import { configureMilestones, promptMilestones, skillSeen, streakMilestones, subagentMilestones, toolMilestones, turnMilestones } from './milestones'
import type { Milestone } from './milestones'
import { forgetSaves } from './save'
import { shown } from './shown'

// Every game in the Arcade, in the order the menus list them. The first is the game a new player
// starts with (decided 8 October 2026: Octo Invader, every terminal, until they pick another).
// A new game is one file in games/, one entry here, one line in BLURBS, and one link in each
// chain below.
export const GAMES = [octopusGame, duckGame, bugsGame, darioGame, townGame, dragonGame, jackpotGame, outlawGame, tamaGame, tetrisGame]

// One line per game for the game menu.
const BLURBS: Record<string, string> = {
  octopus: 'a pixel octopus smashes a city while Claude edits',
  duck: 'your commits shoot the ducks, failed tools let them fly',
  bugs: 'bugs fall on six cities; click the sky to fire too',
  dario: 'a side scroller: tool calls bring coins, bugs knock in',
  town: 'your agents build a block town, a castle on merges',
  dragon: 'a pixel dragon that breathes fire when you ship',
  jackpot: 'a slot machine: every finished turn pulls the lever',
  outlaw: 'an Atari duel: you against the bugs',
  tama: 'a Tamagotchi your work feeds',
  tetris: "Tetris where Claude's tools drop the pieces",
}

export const MODES = ['random', 'rotate', 'fixed', 'all', 'off'] as const
type Mode = (typeof MODES)[number]

// Other names a person may type for a game.
const ALIASES: Record<string, string> = { 'dragon-lair': 'dragon', octo: 'octopus', 'octo-invader': 'octopus', 'duck-hunt': 'duck', duckhunt: 'duck', ducks: 'duck', 'bug-command': 'bugs', bugcommand: 'bugs', bug: 'bugs', missile: 'bugs', 'missile-command': 'bugs', mario: 'dario', runner: 'dario', 'block-runner': 'dario', 'block-town': 'town', blocktown: 'town', minecraft: 'town', village: 'town', castle: 'town' }

// The setting this session's games were picked for, so a reload keeps them and a new setting
// picks again.
const pickedFor = atom({ plugin: 'arcade', key: 'pickedFor' } as const, '')

// The game new terminals start with ('' when the setting is not one fixed game), so the controls
// can offer to make the game on screen the default; and whether the first sessions' hint shows.
const defaultGame = atom({ plugin: 'arcade', key: 'defaultGame' } as const, '')
const hint = atom({ plugin: 'arcade', key: 'hint' } as const, false)

const MENU = 'arcade-menu'
// How many sessions show the hint under the game; the first one also shows the welcome notice.
const HINT_SESSIONS = 3

function gameId(word: string) {
  const id = ALIASES[word.toLowerCase()] ?? word.toLowerCase()
  return GAMES.some(g => g.id === id) ? id : undefined
}

function modeOf(value: unknown): Mode {
  return MODES.includes(value as Mode) ? (value as Mode) : 'fixed'
}

// The pool setting as game ids; empty or unreadable means every game.
function poolOf(value: unknown) {
  const ids = String(value ?? '')
    .split(/[\s,]+/)
    .map(w => (w ? gameId(w) : undefined))
    .filter((id): id is string => id !== undefined)
  return ids.length > 0 ? [...new Set(ids)] : GAMES.map(g => g.id)
}

async function pick($: EngineInterface, mode: Mode, pool: string[]): Promise<string[]> {
  if (mode === 'off') return []
  if (mode === 'all') return pool
  if (mode === 'fixed') return pool.slice(0, 1)
  if (mode === 'random') return pool.slice(0, pool.length).sort(() => Math.random() - 0.5).slice(0, 1)
  // rotate: the game after the one the last terminal showed, kept in this account's store.
  const last = String((await $.store.get('rotate')) ?? '')
  const next = pool[(pool.indexOf(last) + 1) % pool.length] ?? pool[0] ?? ''
  await $.store.set('rotate', next)
  return [next]
}

async function apply($: EngineInterface, mode: Mode, pool: string[]) {
  const ids = await pick($, mode, pool)
  await update($, shown, () => ids)
  await update($, pickedFor, () => `${mode}|${pool.join(',')}`)
  await update($, defaultGame, () => (mode === 'fixed' ? (pool[0] ?? '') : ''))
  return ids
}

const title = (id: string) => GAMES.find(g => g.id === id)?.title ?? id

async function status($: EngineInterface, mode: Mode, pool: string[]) {
  // Not called `on`: the directory reads that name as the hook registration function everywhere.
  const showing = await read($, shown)
  const rows = GAMES.map(g => `${showing.includes(g.id) ? '●' : '○'} ${g.title} (${g.id})${pool.includes(g.id) ? '' : ', not in the pool'}`)
  const setting =
    mode === 'fixed' ? `fixed on ${title(pool[0] ?? '')}` : mode === 'off' ? 'off' : `${mode}, from ${pool.map(title).join(', ')}`
  return (
    `Arcade on this account: ${setting}.\nThis terminal:\n${rows.join('\n')}\n` +
    '"/arcade <game>" swaps this terminal\'s game, "/arcade default <game>" makes it the game every new terminal starts with, ' +
    '"/arcade random|rotate|all|off" sets how new terminals pick, ' +
    '"/arcade pool <games>" limits the choice, "/arcade next" swaps this terminal\'s game. ' +
    '"/arcade hide" clears this terminal only. "/arcade moments" tunes what counts as a big moment. ' +
    'Scores, the town and the pet start from zero in every terminal and last until it closes; "/<game> reset" or "/arcade reset" starts this terminal over.'
  )
}

// Saves what /arcade chose in the plugin's store, so each Claude Code config directory (an account)
// keeps its own. Since 0.10.0 the Arcade declares no userConfig, so installing it asks nothing; a
// setting from 0.9.0 or earlier in pluginConfigs is still read until /arcade saves one here.
type Saved = { mode: string; pool: string }

async function save($: EngineInterface, mode: Mode, pool: string[]) {
  const saved: Saved = { mode, pool: pool.join(',') }
  await $.store.set('setting', saved)
}

// What counts as a big or a medium moment, set with "/arcade moments <key> <value>".
const MOMENT_KEYS = ['big_skills', 'quiet_skills', 'big_commands', 'medium_commands', 'praise_words'] as const
const MOMENT_HELP: Record<string, string> = {
  big_skills: 'skills whose run is a big moment, comma separated',
  quiet_skills: 'skills that celebrate nothing, comma separated',
  big_commands: 'a regular expression of shell commands whose success is big',
  medium_commands: 'a regular expression of shell commands whose success is medium',
  praise_words: 'extra words that count as praise in your messages, comma separated',
}

async function moments($: EngineInterface, options: PluginOptions) {
  const stored = ((await $.store.get('moments')) ?? {}) as Record<string, string>
  const merged: Record<string, string> = {}
  for (const key of MOMENT_KEYS) merged[key] = stored[key] ?? String(options[key] ?? '')
  return merged
}

async function momentsCommand($: EngineInterface, options: PluginOptions, args: string) {
  const rest = args.trim().replace(/^moments\s*/i, '')
  const key = rest.split(/\s+/)[0]?.toLowerCase() ?? ''
  const now = await moments($, options)
  if (key === '') {
    const rows = MOMENT_KEYS.map(k => `  ${k}: ${now[k] === '' ? '(none)' : now[k]}  (${MOMENT_HELP[k]})`)
    return `What counts as a moment, on this account:\n${rows.join('\n')}\n"/arcade moments <key> <value>" sets one, "/arcade moments <key> none" clears it.`
  }
  if (!MOMENT_KEYS.includes(key as (typeof MOMENT_KEYS)[number])) {
    return `No moments setting called "${key}". Settings: ${MOMENT_KEYS.join(', ')}.`
  }
  const raw = rest.slice(key.length).trim()
  const value = raw.toLowerCase() === 'none' ? '' : raw
  const stored = { ...now, [key]: value }
  await $.store.set('moments', stored)
  configureMilestones(stored)
  return `${key}: ${value === '' ? '(none)' : value}`
}

// Makes one game the one every new terminal starts with (fixed mode, that game first in the pool).
async function makeDefault($: EngineInterface, setting: { mode: Mode; pool: string[] }, id: string) {
  const pool = [id, ...setting.pool.filter(x => x !== id)]
  await save($, 'fixed', pool)
  Object.assign(setting, { mode: 'fixed', pool })
  await update($, pickedFor, () => `fixed|${pool.join(',')}`)
  await update($, defaultGame, () => id)
}

// Swaps this terminal to the game before or after the one it shows, through every game.
async function step($: EngineInterface, by: number) {
  const now = await read($, shown)
  const at = GAMES.findIndex(g => g.id === now[now.length - 1])
  const id = GAMES[(at + by + GAMES.length) % GAMES.length]?.id ?? ''
  await update($, shown, () => [id])
}

async function openMenu($: EngineInterface) {
  try {
    const opened = await $.ui.open({ id: MENU, title: 'Arcade', focus: true, closeOnEscape: true, rows: GAMES.length + 5, columns: 64 })
    return opened.isPlaced
  } catch {
    // No panes here (a test, `claude -p`): /arcade's text lists the games instead.
    return false
  }
}

// Hands each moment to every game; a hidden game keeps score and stays quiet.
async function celebrate($: EngineInterface, found: Milestone[]) {
  if (found.length === 0) return
  await dragonCelebrate($, found)
  await jackpotCelebrate($, found)
  await outlawCelebrate($, found)
  await tamaCelebrate($, found)
  await tetrisCelebrate($, found)
  await octopusCelebrate($, found)
  await duckCelebrate($, found)
  await bugsCelebrate($, found)
  await darioCelebrate($, found)
  await townCelebrate($, found)
}

// What each game's own command can show off, listed under its help ("/<game>" alone) so every move
// can be previewed. None of it counts. A new game adds its moves here.
const PREVIEWS: Record<string, [string, string][]> = {
  dragon: [['puff', 'a puff of smoke (small moment)'], ['fire', 'a breath of fire (medium)'], ['blaze', 'a blaze (big)'], ['roar', 'a roar (merge, release, deploy)']],
  jackpot: [['spin', 'a practice pull'], ['golden', 'a golden spin (medium or big moment)'], ['demo', 'a jackpot']],
  outlaw: [['draw', 'a practice duel, one shot each']],
  tama: [['feed', 'feed it (hand care, counts toward its day)'], ['play', 'play with it'], ['clean', 'clean up after it']],
  tetris: [['drop', 'three pieces drop'], ['clear', 'a row cleared']],
  octopus: [['ink', 'a squirt of ink (small)'], ['plane', 'a plane pulled down (medium)'], ['rampage', 'a rampage (big)'], ['conquer', 'the city taken (merge, release, deploy)']],
  duck: [['shot', 'a shot (small)'], ['hunt', 'a duck down (medium)'], ['double', 'a double (big)'], ['perfect', 'a perfect round (merge, release, deploy)'], ['flyaway', 'a duck gets away (failed tool)']],
  bugs: [['flare', 'a flare (small)'], ['shot', 'a sure hit (medium)'], ['salvo', 'a salvo that clears the sky (big)'], ['incoming', 'a fast bug to shoot down yourself (failed tool)']],
  dario: [['coin', 'a ? block and a coin (tool call)'], ['ouch', 'a bug knocks into Dario (failed tool)'], ['stomp', 'a bug stomped (medium)'], ['clear', 'the flag pole, course clear (big)'], ['world', 'world clear with fireworks (merge, release, deploy)']],
  town: [['build', 'six blocks go up (tool calls)'], ['tree', 'a tree planted (small)'], ['finish', 'the building going up is finished (medium)'], ['castle', 'a third of the castle (big)'], ['creeper', 'a creeper blows a hole (failed tool)']],
}

// The game's help, with its moves to preview and how to start over appended.
function withPreview<R extends { text?: string }>(id: string, args: string | undefined, ran: R): R {
  if ((args ?? '').trim() !== '' || typeof ran.text !== 'string') return ran
  const moves = (PREVIEWS[id] ?? []).map(([arg, what]) => `  /${id} ${arg}  ${what}`)
  const list = moves.length > 0 ? `\n\nPreview a move (practice, nothing counts):\n${moves.join('\n')}` : ''
  return { ...ran, text: `${ran.text}${list}\n\n/${id} reset starts this game over in this terminal (it asks first).` }
}

// Resets ask first: "/<game> reset" says what goes, and only "/<game> reset yes" within a minute
// clears it, in this terminal only. "/arcade reset" does every game at once.
const RESET_WINDOW_MS = 60_000
const asked = new Map<string, number>()

async function resetGame($: EngineInterface, id: string) {
  if (id === 'dragon') return dragonReset($)
  if (id === 'jackpot') return jackpotReset($)
  if (id === 'outlaw') return outlawReset($)
  if (id === 'tama') return tamaReset($)
  if (id === 'tetris') return tetrisReset($)
  if (id === 'octopus') return octopusReset($)
  if (id === 'duck') return duckReset($)
  if (id === 'bugs') return bugsReset($)
  if (id === 'dario') return darioReset($)
  if (id === 'town') return townReset($)
}

// Answers "reset" and "reset yes" for one game ("arcade" for all of them); anything else is not ours.
async function askReset($: EngineInterface, id: string, args: string | undefined) {
  const arg = (args ?? '').trim().toLowerCase()
  if (arg !== 'reset' && arg !== 'reset yes') {
    asked.delete(id)
    return undefined
  }
  const what = id === 'arcade' ? 'every Arcade game' : title(id)
  const now = await $.clock.now()
  if (arg === 'reset') {
    asked.set(id, now)
    return {
      text:
        `This clears ${what} in this terminal: its score${id === 'town' || id === 'arcade' ? ', its town' : ''}${id === 'tama' || id === 'arcade' ? ', its pet' : ''}. ` +
        `Other terminals keep theirs. Type "/${id} reset yes" within a minute to do it; anything else keeps it.`,
    }
  }
  if (now - (asked.get(id) ?? -Infinity) > RESET_WINDOW_MS) {
    return { text: `Nothing cleared. Type "/${id} reset" first, then "/${id} reset yes" within a minute.` }
  }
  asked.delete(id)
  for (const g of id === 'arcade' ? GAMES.map(x => x.id) : [id]) await resetGame($, g)
  return { text: `${what === title(id) ? what : 'Every Arcade game'} cleared in this terminal.` }
}

// A plugin hooks each event once, so register chains the games' hooks for it: each game's next
// is the following game's hook and the last one's is the engine, the order separate plugins would run in.
export const register: Register = (on, options: PluginOptions) => {
  configureMilestones(options)
  const setting = { mode: modeOf(options.mode), pool: poolOf(options.pool) }

  on('session.start', async ($, e, next) => {
    // The games keep nothing between sessions; what older versions saved goes.
    await forgetSaves($)
    await $.command.register({
      name: 'arcade',
      description: 'The Arcade\'s game menu. "/arcade <game>" plays one in this terminal, "/arcade default <game>" makes it the game new terminals start with, "/arcade next", "/arcade random|rotate|all|off", "/arcade pool <games>", "/arcade moments", "/arcade hide".',
    })
    const saved = (await $.store.get('setting')) as Saved | undefined
    if (saved !== undefined) Object.assign(setting, { mode: modeOf(saved.mode), pool: poolOf(saved.pool) })
    configureMilestones(await moments($, options))
    if ((await read($, pickedFor)) !== `${setting.mode}|${setting.pool.join(',')}`) await apply($, setting.mode, setting.pool)

    // The first sessions on an account say where the controls are; the very first says it aloud.
    const seen = Number((await $.store.get('welcome')) ?? 0)
    if (seen < HINT_SESSIONS) {
      await $.store.set('welcome', seen + 1)
      await update($, hint, () => true)
      const first = (await read($, shown))[0]
      if (seen === 0 && first !== undefined) {
        $.ui.toast(
          `Arcade: ${title(first)} is your game. ▶ under it tries the next one, ☰ lists all ${GAMES.length} and sets the game new terminals start with (or type /arcade).`,
          { timeoutMs: 15000 },
        )
      }
    }

    const ran = await dragonStart($, e, ((e1: typeof e) => jackpotStart($, e1, ((e2: typeof e) => outlawStart($, e2, ((e3: typeof e) => tamaStart($, e3, ((e4: typeof e) => tetrisStart($, e4, ((e5: typeof e) => octopusStart($, e5, ((e6: typeof e) => duckStart($, e6, ((e7: typeof e) => bugsStart($, e7, ((e8: typeof e) => darioStart($, e8, ((e9: typeof e) => townStart($, e9, next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)
    // Days in a row: counted once a day, at the session's start.
    const streak = streakMilestones((await $.store.get('days')) as { last: string; streak: number } | undefined, await $.clock.now())
    await $.store.set('days', streak.days)
    await celebrate($, streak.found)
    return ran
  })

  on('command.run', { command: 'arcade' }, async ($, e) => {
    const words = (e.args ?? '').trim().split(/[\s,]+/).filter(Boolean)
    const [first = '', ...rest] = words.map(w => w.toLowerCase())

    if (first === '' || first === 'menu') {
      if (await openMenu($)) return { text: 'Arcade menu open: pick a game, ☆ makes it your default. Esc closes. "/arcade help" lists the commands.' }
      return { text: await status($, setting.mode, setting.pool) }
    }
    if (first === 'help' || first === 'status') return { text: await status($, setting.mode, setting.pool) }

    if (first === 'moments') return { text: await momentsCommand($, options, e.args ?? '') }

    if (first === 'default') {
      const id = gameId(rest[0] ?? '')
      if (id === undefined) return { text: `Name the game: ${GAMES.map(g => g.id).join(', ')}.` }
      await makeDefault($, setting, id)
      await update($, shown, () => [id])
      return { text: `${title(id)} is the game every new terminal starts with, and plays here now.` }
    }

    const reset = await askReset($, 'arcade', e.args)
    if (reset) return reset

    if (first === 'hide') {
      await update($, shown, () => [])
      return { text: 'No game in this terminal. "/arcade next" brings one back; new terminals still follow the setting.' }
    }

    if (first === 'next') {
      const now = await read($, shown)
      const at = setting.pool.indexOf(now[now.length - 1] ?? '')
      const id = setting.pool[(at + 1) % setting.pool.length] ?? ''
      await update($, shown, () => [id])
      return { text: `${title(id)} in this terminal. New terminals still follow the setting.` }
    }

    if (first === 'pool') {
      const ids = rest.map(gameId)
      if (rest.length === 0 || ids.includes(undefined)) {
        return { text: `Name the games for the pool: ${GAMES.map(g => g.id).join(', ')}.` }
      }
      const pool = poolOf(ids.join(','))
      await save($, setting.mode, pool)
      setting.pool = pool
      await apply($, setting.mode, pool)
      return { text: await status($, setting.mode, pool) }
    }

    const mode = MODES.find(m => m === first)
    const id = gameId(first)
    if (mode === undefined && id === undefined) {
      return { text: `No game or mode called "${first}". Games: ${GAMES.map(g => g.id).join(', ')}. Modes: ${MODES.join(', ')}.` }
    }
    // "/arcade tetris" swaps only this terminal; the setting and other terminals stay as they are.
    if (id !== undefined && rest[0] !== 'all') {
      await update($, shown, () => [id])
      return { text: `${title(id)} in this terminal. "/arcade default ${id}" makes it the game new terminals start with.` }
    }
    // "/arcade tetris all" pins Tetris: fixed mode with Tetris first in the pool.
    const pool = id === undefined ? setting.pool : [id, ...setting.pool.filter(x => x !== id)]
    const next = id === undefined ? (mode as Mode) : 'fixed'
    await save($, next, pool)
    Object.assign(setting, { mode: next, pool })
    await apply($, next, pool)
    return { text: await status($, next, pool) }
  })

  on('skill.prompt', (_$, e, next) => {
    skillSeen(e.skill)
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const ran = await next(e)
    await celebrate($, subagentMilestones())
    return ran
  })

  // The games' own commands.
  on('command.run', { command: 'dragon' }, async ($, e, next) => (await askReset($, 'dragon', e.args)) ?? withPreview('dragon', e.args, await dragonCommand($, e, next)))
  on('command.run', { command: 'jackpot' }, async ($, e, next) => (await askReset($, 'jackpot', e.args)) ?? withPreview('jackpot', e.args, await jackpotCommand($, e, next)))
  on('command.run', { command: 'outlaw' }, async ($, e, next) => (await askReset($, 'outlaw', e.args)) ?? withPreview('outlaw', e.args, await outlawCommand($, e, next)))
  on('command.run', { command: 'tama' }, async ($, e, next) => (await askReset($, 'tama', e.args)) ?? withPreview('tama', e.args, await tamaCommand($, e, next)))
  on('command.run', { command: 'tetris' }, async ($, e, next) => (await askReset($, 'tetris', e.args)) ?? withPreview('tetris', e.args, await tetrisCommand($, e, next)))
  on('command.run', { command: 'octopus' }, async ($, e, next) => (await askReset($, 'octopus', e.args)) ?? withPreview('octopus', e.args, await octopusCommand($, e, next)))
  on('command.run', { command: 'duck' }, async ($, e, next) => (await askReset($, 'duck', e.args)) ?? withPreview('duck', e.args, await duckCommand($, e, next)))
  on('command.run', { command: 'bugs' }, async ($, e, next) => (await askReset($, 'bugs', e.args)) ?? withPreview('bugs', e.args, await bugsCommand($, e, next)))
  on('command.run', { command: 'dario' }, async ($, e, next) => (await askReset($, 'dario', e.args)) ?? withPreview('dario', e.args, await darioCommand($, e, next)))
  on('command.run', { command: 'town' }, async ($, e, next) => (await askReset($, 'town', e.args)) ?? withPreview('town', e.args, await townCommand($, e, next)))

  // What a game's Client posts from the band (only Bug Command draws one).
  on('ui.message', ($, e, next) => bugsMessage($, e, next))

  on('prompt.submit', async ($, e, next) => {
    const ran = await dragonPrompt($, e, ((e1: typeof e) => jackpotPrompt($, e1, ((e2: typeof e) => outlawPrompt($, e2, ((e3: typeof e) => tamaPrompt($, e3, ((e4: typeof e) => tetrisPrompt($, e4, ((e5: typeof e) => octopusPrompt($, e5, ((e6: typeof e) => duckPrompt($, e6, ((e7: typeof e) => bugsPrompt($, e7, ((e8: typeof e) => darioPrompt($, e8, ((e9: typeof e) => townPrompt($, e9, next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)
    await celebrate($, promptMilestones(String(e.text ?? ''), await $.clock.now()))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await dragonTurn($, e, ((e1: typeof e) => jackpotTurn($, e1, ((e2: typeof e) => outlawTurn($, e2, ((e3: typeof e) => tamaTurn($, e3, ((e4: typeof e) => tetrisTurn($, e4, ((e5: typeof e) => octopusTurn($, e5, ((e6: typeof e) => duckTurn($, e6, ((e7: typeof e) => bugsTurn($, e7, ((e8: typeof e) => darioTurn($, e8, ((e9: typeof e) => townTurn($, e9, next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)
    if (e.agentId === undefined && !e.isAborted) await celebrate($, turnMilestones(await $.clock.now()))
    return ran
  })

  on('tool.call', async ($, e, next) => {
    const ran = await dragonTool($, e, ((e1: typeof e) => jackpotTool($, e1, ((e2: typeof e) => outlawTool($, e2, ((e3: typeof e) => tamaTool($, e3, ((e4: typeof e) => tetrisTool($, e4, ((e5: typeof e) => octopusTool($, e5, ((e6: typeof e) => duckTool($, e6, ((e7: typeof e) => bugsTool($, e7, ((e8: typeof e) => darioTool($, e8, ((e9: typeof e) => townTool($, e9, next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)
    if (e.agentId === undefined && ran.deny === undefined) await celebrate($, toolMilestones(e, ran))
    return ran
  })

  // The games draw at the right of the band, beside whatever else is there; above them, a row of
  // small controls (on top, so a short terminal that scrolls the band still shows them): the previous and next game, the menu, and (when this terminal shows a game other
  // than the default) a button to make it the default.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const tree = await dragonRender($, e, ((e1: typeof e) => jackpotRender($, e1, ((e2: typeof e) => outlawRender($, e2, ((e3: typeof e) => tamaRender($, e3, ((e4: typeof e) => tetrisRender($, e4, ((e5: typeof e) => octopusRender($, e5, ((e6: typeof e) => duckRender($, e6, ((e7: typeof e) => bugsRender($, e7, ((e8: typeof e) => darioRender($, e8, ((e9: typeof e) => townRender($, e9, next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)
    const ids = await read($, shown)
    if (e.surface !== 'terminal' || e.props.hasSurvey || ids.length !== 1 || tree === null || tree === undefined) return tree
    const { Box, Button, Text } = $.ui.resolve(e)
    const id = ids[0] ?? ''
    const fallback = await read($, defaultGame)
    const isHinted = await read($, hint)
    return (
      <Box flexDirection="column">
        <Box key="arcade-controls" flexDirection="row" justifyContent="flex-end" height={1}>
          {isHinted ? <Text key="arcade-hint" dimColor wrap="truncate">{'▶ next game  ☰ all games and your default    '}</Text> : null}
          <Button key="arcade-prev" label="◀" plain dimColor onPress={() => step($, -1)} />
          <Text key="arcade-title" dimColor>{` ${title(id)} `}</Text>
          <Button key="arcade-next" label="▶" plain dimColor onPress={() => step($, 1)} />
          <Text key="arcade-gap"> </Text>
          <Button key="arcade-menu" label="☰" plain dimColor onPress={() => openMenu($)} />
          {fallback !== id ? <Text key="arcade-gap2"> </Text> : null}
          {fallback !== id ? <Button key="arcade-default" label="☆ make default" plain dimColor onPress={() => makeDefault($, setting, id)} /> : null}
        </Box>
        {tree}
      </Box>
    )
  })

  // The game menu: every game with a line about it, its name a button that plays it here, and a
  // star that makes it the game new terminals start with. Narrow when docked, so the line about each
  // game is the part that gives way.
  on('ui.render', { component: 'Pane', requestId: MENU }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const ids = await read($, shown)
    const fallback = await read($, defaultGame)
    const width = Math.max(...GAMES.map(g => g.title.length)) + 1
    return (
      <Box flexDirection="column">
        {GAMES.map(g => (
          <Box key={`row-${g.id}`} flexDirection="row" height={1}>
            <Text key={`on-${g.id}`} color="green">{ids.includes(g.id) ? '● ' : '  '}</Text>
            <Box key={`name-${g.id}`} width={width} flexShrink={0}>
              <Button key={`play-${g.id}`} label={g.title} plain onPress={() => update($, shown, () => [g.id])} />
            </Box>
            <Box key={`fav-${g.id}`} width={3} flexShrink={0}>
              {fallback === g.id ? (
                <Text key={`is-${g.id}`} color="yellow">★</Text>
              ) : (
                <Button key={`make-${g.id}`} label="☆" plain dimColor onPress={() => makeDefault($, setting, g.id)} />
              )}
            </Box>
            <Text key={`what-${g.id}`} dimColor wrap="truncate">{BLURBS[g.id] ?? ''}</Text>
          </Box>
        ))}
        <Text key="menu-gap"> </Text>
        <Text key="menu-help" dimColor wrap="wrap">
          {`A name plays it here. ☆ makes it the game new terminals start with${fallback === '' ? ` (now: ${setting.mode})` : ''}. Esc closes.`}
        </Text>
      </Box>
    )
  })

}
