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
import { projectName, useProject } from './save'
import { shown } from './shown'

// Every game in the Arcade, in the order the menus list them. A new game is one file in
// games/, one entry here, and one link in each chain below.
export const GAMES = [dragonGame, jackpotGame, outlawGame, tamaGame, tetrisGame, octopusGame, duckGame, bugsGame, darioGame, townGame]

export const MODES = ['random', 'rotate', 'fixed', 'all', 'off'] as const
type Mode = (typeof MODES)[number]

// Other names a person may type for a game.
const ALIASES: Record<string, string> = { 'dragon-lair': 'dragon', octo: 'octopus', 'octo-invader': 'octopus', 'duck-hunt': 'duck', duckhunt: 'duck', ducks: 'duck', 'bug-command': 'bugs', bugcommand: 'bugs', bug: 'bugs', missile: 'bugs', 'missile-command': 'bugs', mario: 'dario', runner: 'dario', 'block-runner': 'dario', 'block-town': 'town', blocktown: 'town', minecraft: 'town', village: 'town', castle: 'town' }

// The setting this session's games were picked for, so a reload keeps them and a new setting
// picks again.
const pickedFor = atom({ plugin: 'arcade', key: 'pickedFor' } as const, '')

function gameId(word: string) {
  const id = ALIASES[word.toLowerCase()] ?? word.toLowerCase()
  return GAMES.some(g => g.id === id) ? id : undefined
}

function modeOf(value: unknown): Mode {
  return MODES.includes(value as Mode) ? (value as Mode) : 'random'
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
  return ids
}

const title = (id: string) => GAMES.find(g => g.id === id)?.title ?? id

async function status($: EngineInterface, mode: Mode, pool: string[]) {
  const on = await read($, shown)
  const rows = GAMES.map(g => `${on.includes(g.id) ? '●' : '○'} ${g.title} (${g.id})${pool.includes(g.id) ? '' : ', not in the pool'}`)
  const setting =
    mode === 'fixed' ? `fixed on ${title(pool[0] ?? '')}` : mode === 'off' ? 'off' : `${mode}, from ${pool.map(title).join(', ')}`
  return (
    `Arcade on this account: ${setting}.\nThis terminal:\n${rows.join('\n')}\n` +
    '"/arcade <game>" swaps this terminal\'s game, "/arcade <game> all" pins it for every terminal, ' +
    '"/arcade random|rotate|all|off" sets how new terminals pick, ' +
    '"/arcade pool <games>" limits the choice, "/arcade next" swaps this terminal\'s game. ' +
    '"/arcade hide" clears this terminal only. ' +
    `Scores, the town and the pet are kept per project (this one: ${projectName()}); "/<game> reset" or "/arcade reset" starts this project over.`
  )
}

// Saves what /arcade chose. First choice: the plugin's own mode and pool settings, written the way
// the /config menu writes them, so the menu shows the choice and each Claude Code config directory
// keeps its own. Where those rows do not exist (checked 5 October 2026 on 2.1.289: an interactive
// session has them, `claude -p` has none), the choice goes to the plugin store instead, also kept
// per config directory. `over` records the settings it was chosen over: once they change, they win.
type Saved = { mode: string; pool: string; over: string }

const over = (options: PluginOptions) => `${String(options.mode ?? '')}|${String(options.pool ?? '')}`

async function save($: EngineInterface, options: PluginOptions, mode: Mode, pool: string[]) {
  try {
    const keys = new Set((await $.config.list()).map(row => row.key))
    if (keys.has('arcade.mode') && keys.has('arcade.pool')) {
      const a = await $.config.set({ key: 'arcade.mode', value: mode })
      const b = await $.config.set({ key: 'arcade.pool', value: pool.join(',') })
      if (a.deny === undefined && b.deny === undefined) {
        await $.store.delete('setting')
        return
      }
    }
  } catch {
    // No settings rows here; the store below keeps the choice.
  }
  const saved: Saved = { mode, pool: pool.join(','), over: over(options) }
  await $.store.set('setting', saved)
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
  return { ...ran, text: `${ran.text}${list}\n\n/${id} reset starts this game over for this project (it asks first).` }
}

// Resets ask first: "/<game> reset" says what goes, and only "/<game> reset yes" within a minute
// clears it, for this project only. "/arcade reset" does every game at once.
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
        `This clears ${what} for the project ${projectName()}: its score${id === 'town' || id === 'arcade' ? ', its town' : ''}${id === 'tama' || id === 'arcade' ? ', its pet' : ''}. ` +
        `Other projects keep theirs. Type "/${id} reset yes" within a minute to do it; anything else keeps it.`,
    }
  }
  if (now - (asked.get(id) ?? -Infinity) > RESET_WINDOW_MS) {
    return { text: `Nothing cleared. Type "/${id} reset" first, then "/${id} reset yes" within a minute.` }
  }
  asked.delete(id)
  for (const g of id === 'arcade' ? GAMES.map(x => x.id) : [id]) await resetGame($, g)
  return { text: `${what === title(id) ? what : 'Every Arcade game'} cleared for ${projectName()}. Other terminals of this project start from it on their next save.` }
}

// A plugin hooks each event once, so register chains the games' hooks for it: each game's next
// is the following game's hook and the last one's is the engine, the order separate plugins would run in.
export const register: Register = (on, options: PluginOptions) => {
  configureMilestones(options)
  const setting = { mode: modeOf(options.mode), pool: poolOf(options.pool) }

  on('session.start', async ($, e, next) => {
    // Every game keeps its values per project, so the project comes first.
    await useProject($, String(e.cwd ?? ''))
    await $.command.register({
      name: 'arcade',
      description: 'Which Arcade games show: "/arcade <game>" for this terminal, "/arcade <game> all" pins one everywhere, "/arcade random|rotate|all|off", "/arcade pool <games>", "/arcade next" or "/arcade hide" for this terminal.',
    })
    const saved = (await $.store.get('setting')) as Saved | undefined
    if (saved?.over === over(options)) Object.assign(setting, { mode: modeOf(saved.mode), pool: poolOf(saved.pool) })
    if ((await read($, pickedFor)) !== `${setting.mode}|${setting.pool.join(',')}`) await apply($, setting.mode, setting.pool)

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

    if (first === '') return { text: await status($, setting.mode, setting.pool) }

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
      await save($, options, setting.mode, pool)
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
      return { text: `${title(id)} in this terminal. "/arcade ${id} all" pins it for every terminal.` }
    }
    // "/arcade tetris all" pins Tetris: fixed mode with Tetris first in the pool.
    const pool = id === undefined ? setting.pool : [id, ...setting.pool.filter(x => x !== id)]
    const next = id === undefined ? (mode as Mode) : 'fixed'
    await save($, options, next, pool)
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

  // The games draw at the right of the band, beside whatever else is there.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => dragonRender($, e, ((e1: typeof e) => jackpotRender($, e1, ((e2: typeof e) => outlawRender($, e2, ((e3: typeof e) => tamaRender($, e3, ((e4: typeof e) => tetrisRender($, e4, ((e5: typeof e) => octopusRender($, e5, ((e6: typeof e) => duckRender($, e6, ((e7: typeof e) => bugsRender($, e7, ((e8: typeof e) => darioRender($, e8, ((e9: typeof e) => townRender($, e9, next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next)) as typeof next))
}
