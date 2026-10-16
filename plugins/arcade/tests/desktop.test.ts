import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { begin, pin } from './start'

// The Desktop Code tab draws the games too: the same pixels as the terminal's Raster, as an Svg
// flipbook of the last second's frames, and the controls above.
const GAMES = [
  ['octopus', 'Octo Invader'],
  ['duck', 'Duck Hunt'],
  ['dario', 'Dario'],
  ['town', 'Block Town'],
  ['dragon', 'Dragon Lair'],
  ['jackpot', 'Jackpot'],
  ['outlaw', 'Outlaw'],
  ['tama', 'Tama'],
  ['tetris', 'Tetris'],
] as const

const band = (surface: 'terminal' | 'desktop' | 'vscode') =>
  ({
    plugin: 'arcade',
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, bodyColumns: 100 } as never,
  }) as const

function world(on: On) {
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'account · project') as never
  })
}

type SvgFound = { props: { source: string; alt: string } } | undefined

for (const [id, title] of GAMES) {
  test(`${title} draws a flipbook on the desktop and a Raster in the terminal`, async ($, on) => {
    pin({ mode: 'fixed', pool: id })
    world(on)
    await begin($, on)
    const desk = await $.ui.mount(band('desktop'))
    const svg = (await desk.find({ type: 'Svg' } as never)) as unknown as SvgFound
    expect(svg).toBeDefined()
    expect(svg!.props.alt).toBe(title)
    expect(svg!.props.source.startsWith('<svg')).toBe(true)
    expect(svg!.props.source.length).toBeLessThan(131072)
    expect(svg!.props.source).toMatch(/class="f0"/)
    expect(await desk.find({ type: 'Text', text: /project/ })).toBeDefined()
    expect(await desk.find({ type: 'Button', key: 'arcade-next' } as never)).toBeDefined()
    await desk.unmount()
    const term = await $.ui.mount(band('terminal'))
    expect(await term.find({ type: 'Raster' })).toBeDefined()
    await term.unmount()
  })
}

test('Bug Command runs its sky in the hooks on the desktop and draws it as a flipbook', async ($, on) => {
  pin({ mode: 'fixed', pool: 'bugs' })
  world(on)
  const clock = mock.clock(on)
  await begin($, on, true)
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ type: 'Client' } as never)).toBeUndefined()
  await clock.advance(1000)
  const svg = (await ui.find({ type: 'Svg' } as never)) as unknown as SvgFound
  expect(svg!.props.alt).toBe('Bug Command')
  expect(svg!.props.source).toMatch(/class="f5"/)
  await ui.unmount()
  const term = await $.ui.mount(band('terminal'))
  expect(await term.find({ type: 'Client' } as never)).toBeDefined()
  await term.unmount()
})

test('the VS Code chat panel still draws no game, only what was there', async ($, on) => {
  pin({ mode: 'fixed', pool: 'octopus' })
  world(on)
  await begin($, on)
  const ui = await $.ui.mount(band('vscode'))
  expect(await ui.find({ type: 'Svg' } as never)).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'arcade-next' } as never)).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /project/ })).toBeDefined()
  await ui.unmount()
})

test('on the desktop a game never blits: a second of frames comes as one flipbook', async ($, on) => {
  pin({ mode: 'fixed', pool: 'tetris' })
  world(on)
  const clock = mock.clock(on)
  const blits = { n: 0 }
  on('ui.blit', ($, e, next) => {
    blits.n += 1
    return next(e)
  })
  await begin($, on, true)
  const ui = await $.ui.mount(band('desktop'))
  await $.command.run({ command: 'tetris', args: 'drop' } as never)
  await clock.advance(1000)
  const svg = (await ui.find({ type: 'Svg' } as never)) as unknown as SvgFound
  expect(blits.n).toBe(0)
  expect(svg!.props.source).toMatch(/class="f5"/)
  await ui.unmount()
})
