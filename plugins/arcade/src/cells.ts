// A game's cells as a Raster packs them: base64 of little-endian u32 triplets
// [codePoint, foreground, background], row-major; 0x01000000 is the terminal's own colour.
// Decoded by hand: neither the hooks module nor a surface module can count on Uint8Array.fromBase64.

export const DEFAULT = 0x01000000
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function words(cells: string): Uint32Array {
  const clean = cells.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]!) << 18) |
      (B64.indexOf(clean[i + 1] ?? 'A') << 12) |
      (B64.indexOf(clean[i + 2] ?? 'A') << 6) |
      B64.indexOf(clean[i + 3] ?? 'A')
    if (o < bytes.length) bytes[o++] = (n >> 16) & 255
    if (o < bytes.length) bytes[o++] = (n >> 8) & 255
    if (o < bytes.length) bytes[o++] = n & 255
  }
  return new Uint32Array(bytes.buffer, 0, Math.floor(bytes.length / 4))
}

// One terminal cell is twice as tall as wide; a half block is one square pixel.
export const CELL_W = 6
export const CELL_H = 12
const hex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// One frame's cells as squares: runs of one colour in a pixel row become one path, so a frame of
// a 100 column band stays a few kilobytes. Ink in the terminal's own colour takes class "d", which
// the page's light or dark theme colours.
export function framePaths(columns: number, rows: number, cells: string): string {
  const w = words(cells)
  const half = CELL_H / 2
  const runs = new Map<number, string[]>()
  const glyphs: string[] = []
  const rowsOfPixels: (number | null)[][] = []
  for (let y = 0; y < rows; y++) {
    const top: (number | null)[] = []
    const bottom: (number | null)[] = []
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 3
      const ch = w[i] ?? 0x20
      const fg = w[i + 1] ?? DEFAULT
      const bg = w[i + 2] ?? DEFAULT
      const back = bg === DEFAULT ? null : bg
      if (ch === 0x2588) {
        top.push(fg)
        bottom.push(fg)
      } else if (ch === 0x2580) {
        top.push(fg)
        bottom.push(back)
      } else if (ch === 0x2584) {
        top.push(back)
        bottom.push(fg)
      } else {
        top.push(back)
        bottom.push(back)
        if (ch !== 0x20) {
          const ink = fg === DEFAULT ? 'class="d"' : `fill="${hex(fg)}"`
          glyphs.push(`<text x="${x * CELL_W + CELL_W / 2}" y="${y * CELL_H + CELL_H - 2}" ${ink}>${escape(String.fromCodePoint(ch))}</text>`)
        }
      }
    }
    rowsOfPixels.push(top, bottom)
  }
  rowsOfPixels.forEach((row, py) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]
      let end = x + 1
      while (end < row.length && row[end] === c) end++
      if (c !== null && c !== undefined) {
        const list = runs.get(c) ?? []
        list.push(`M${x * CELL_W} ${py * half}h${(end - x) * CELL_W}v${half}h-${(end - x) * CELL_W}z`)
        runs.set(c, list)
      }
      x = end
    }
  })
  const paths = [...runs].map(([c, d]) => (c === DEFAULT ? `<path class="d" d="${d.join('')}"/>` : `<path fill="${hex(c)}" d="${d.join('')}"/>`))
  return paths.join('') + glyphs.join('')
}

// An Svg holds at most 131072 characters; a flipbook stays under this, dropping frames to fit.
const BUDGET = 120000

// A flipbook: the frames of the last moment, each shown in turn for its share of `ms`, the last one
// kept on screen until the next flipbook arrives. The page plays it; nothing redraws in between.
// Drawn this many times its cell size, so the page shrinks it to the band's width rather than
// leaving room at the right (the desktop's cells are wider than CELL_W; seen 16 October 2026).
const OVERSIZE = 2

// One frame of a flipbook: what it shows, and for how long.
export type Page = { paths: string; ms: number }

export function flipbook(columns: number, rows: number, pages: Page[]): string {
  const W = columns * CELL_W
  const H = rows * CELL_H
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * OVERSIZE}" height="${H * OVERSIZE}" shape-rendering="crispEdges">` +
    `<style>.d{fill:#3d3d3a}@media (prefers-color-scheme:dark){.d{fill:#e8e6dc}}` +
    `text{font:${CELL_H - 2}px ui-monospace,Menlo,monospace;text-anchor:middle}` +
    `.p{visibility:hidden}@keyframes on{from,to{visibility:visible}}`
  let list = pages.length > 0 ? pages : [{ paths: '', ms: 66 }]
  for (;;) {
    // A picture shown more than once is drawn once, in defs, and used by each page that shows it.
    const ids = new Map<string, number>()
    for (const p of list) if (!ids.has(p.paths)) ids.set(p.paths, ids.size)
    let at = 0
    const css = list
      .map((p, i) => {
        const isLast = i === list.length - 1
        const rule = `.f${i}{animation:on ${Math.round(p.ms)}ms step-end ${Math.round(at)}ms ${isLast ? 'forwards' : '1'}}`
        at += p.ms
        return rule
      })
      .join('')
    const defs = [...ids].map(([paths, id]) => `<g id="u${id}">${paths}</g>`).join('')
    const body = list.map((p, i) => `<use href="#u${ids.get(p.paths)}" class="p f${i}"/>`).join('')
    const svg = `${head}${css}</style><defs>${defs}</defs>${body}</svg>`
    if (svg.length <= BUDGET || list.length === 1) return svg
    // Too big: every other picture goes, its time given to the one before it.
    const fewer: Page[] = []
    list.forEach((p, i) => {
      if (i % 2 === 0 || i === list.length - 1) fewer.push({ ...p })
      else fewer[fewer.length - 1]!.ms += p.ms
    })
    list = fewer
  }
}
