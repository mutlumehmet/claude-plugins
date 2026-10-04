// The reel symbols as 6 by 6 pixel art. A letter is a colour from PALETTE,
// '.' is the reel window showing through.

export const PALETTE: Record<string, number> = {
  R: 0xff3b4e, r: 0xb3122a, Y: 0xffd34d, y: 0xc9961c, G: 0x4cd07d, g: 0x23874a,
  C: 0x5fd8ff, c: 0x2a8fbf, W: 0xffffff, P: 0xc07bff, O: 0xff9a3d, K: 0x15151d,
}

export type SymbolId = 'seven' | 'dragon' | 'diamond' | 'bell' | 'star' | 'cherry'

// One solid colour each and a bold silhouette, so they read at a glance.
export const SYMBOLS: Record<SymbolId, string[]> = {
  seven: ['RRRRRR', 'RRRRRR', '...RR.', '..RR..', '..RR..', '..RR..'],
  dragon: ['G....G', 'GG..GG', 'GGGGGG', 'G.GG.G', 'GGGGGG', '.GGGG.'],
  diamond: ['..CC..', '.CCCC.', 'CCCCCC', 'CCCCCC', '.CCCC.', '..CC..'],
  bell: ['..YY..', '.YYYY.', '.YYYY.', 'YYYYYY', '......', '..YY..'],
  star: ['..PP..', '..PP..', 'PPPPPP', '.PPPP.', '.P..P.', 'P....P'],
  cherry: ['...GG.', '..G.G.', '.G..G.', 'RR.RR.', 'RR.RR.', '......'],
}

export const SYMBOL_SIZE = 6
