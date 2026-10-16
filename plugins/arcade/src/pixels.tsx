import type { EngineInterface, RenderElement, RenderInput, RenderSurface } from 'claude-code'

import { CELL_W, flipbook, framePaths } from './cells'

// The games draw a grid of cells (half blocks, mostly) fifteen times a second. The terminal takes
// each frame as a Raster repainted by $.ui.blit. The Desktop Code tab has neither a Raster nor a
// way to repaint one: there each frame is kept, and once a second the band is drawn again with the
// second's frames as one Svg flipbook of square pixels that the page plays by itself. The same
// picture as the terminal's, a second behind, and the band redrawn once a second rather than for
// every frame (ten redraws a second left its buttons no time to be pressed; seen live on
// 16 October 2026, Claude Code 2.1.299). Text cells do not work there either: the desktop draws
// text in a proportional font and the half blocks do not line up.

// The surfaces a game draws on; elsewhere (VS Code chat, the phone) it keeps playing unseen.
export const drawsGames = (surface: RenderSurface) => surface === 'terminal' || surface === 'desktop'

// Which surface each drawn site is on, so a game's frame loop knows whether it can blit.
const sites = new Map<string, RenderSurface>()
// Each game's frames since its last flipbook on the desktop, by its key.
const pending = new Map<string, string[]>()

// How long a flipbook covers, and how long each frame of it shows (the games' frame clock).
const BOOK_MS = 1000
const FRAME_MS = 66

const onDesktop = () => [...sites.values()].includes('desktop')

// Called once at session start: the clock that hands the desktop a new flipbook each second.
export function startFlipbooks($: EngineInterface) {
  $.clock.every(BOOK_MS, () => {
    if (onDesktop() && [...pending.values()].some(f => f.length > 0)) $.ui.invalidate('ui.render')
  })
}

// Something happened (a tool, a prompt, a command): the desktop draws the band again now, so the
// text around the games (a score under one) is current too.
export function redrawDesktop($: EngineInterface) {
  if (onDesktop()) $.ui.invalidate('ui.render')
}

type Site = RenderInput<'AbovePrompt'>
type Grid = { key: string; columns: number; rows: number; cells: string; alt: string }

// The game's cells as the surface draws them: a Raster in the terminal, a flipbook on the desktop.
export function pixels($: EngineInterface, e: Site, g: Grid): RenderElement | null {
  sites.set(e.requestId, e.surface)
  if (e.surface === 'terminal') {
    const { Raster } = $.ui.resolve(e)
    return <Raster key={g.key} columns={g.columns} rows={g.rows} cells={g.cells} />
  }
  if (e.surface === 'desktop') {
    const { Svg } = $.ui.resolve(e)
    // Frames from before a resize do not fit this band: only this size's go in the book.
    const kept = (pending.get(g.key) ?? []).filter(cells => cells.length === g.cells.length)
    pending.set(g.key, [])
    const frames = (kept.length > 0 ? kept : [g.cells]).map(cells => framePaths(g.columns, g.rows, cells))
    const source = flipbook(g.columns, g.rows, frames, frames.length * FRAME_MS)
    return <Svg key={g.key} alt={g.alt} source={source} width={g.columns * CELL_W} />
  }
  return null
}

// Repaints a game's cells: a blit in the terminal; on the desktop the frame joins the next flipbook.
export function repaint($: EngineInterface, args: { requestId: string; key: string; cells: string; columns?: number }) {
  if (sites.get(args.requestId) === 'desktop') {
    const kept = pending.get(args.key) ?? []
    kept.push(args.cells)
    // Never more than a few seconds behind, should the band not be drawn for a while.
    if (kept.length > 45) kept.splice(0, kept.length - 45)
    pending.set(args.key, kept)
    return Promise.resolve({} as { deny?: unknown })
  }
  return $.ui.blit(args)
}
