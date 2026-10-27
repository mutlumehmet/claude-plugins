import { expect, test } from 'claude-code/testing'

const HOME = '/home/u'
const ID = '1a2b3c4d-0000-4000-8000-000000000000'
const EXIT = HOME + '/.config/orca-strator/moves/1a2b3c4d.exit'

// Stands for Claude Code: a disk, the prompt box, the timer (released by hand), commands and toasts
function engine(on, { files = {}, draft = '' } = {}) {
  const disk: Record<string, string> = { ...files }
  const seen = { commands: [] as string[], toasts: [] as string[], draft }
  let release: (() => void) | null = null
  on('env.get', ($, e) => ({ value: ({ HOME })[e.name] }))
  on('session.id', () => ({ value: ID }))
  on('fs.exists', ($, e) => ({ value: e.path in disk }))
  on('fs.read', ($, e) => (e.path in disk ? { value: disk[e.path] } : { deny: 'ENOENT' }) as never)
  on('fs.write', ($, e) => { disk[e.path] = e.text; return { value: undefined } })
  on('prompt.read', () => ({ value: { text: seen.draft, cursor: seen.draft.length } }))
  on('command.run', ($, e) => { seen.commands.push(e.command); return { value: { text: '' } } })
  on('ui.toast', ($, e) => { seen.toasts.push(e.text); return { value: undefined } })
  on('clock.every', () => new Promise(r => { release = () => r({ value: undefined } as never) }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  const tick = async () => {
    const r = release
    release = null
    r?.()
    for (let i = 0; i < 20 && !release; i++) await new Promise(res => setTimeout(res, 5))
    await new Promise(res => setTimeout(res, 20))
  }
  return { disk, seen, tick }
}

const start = $ => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

test('does nothing without a move request', async ($, on) => {
  const { seen, tick } = engine(on)
  await start($)
  await tick()
  expect(seen.commands).toEqual([])
})

test('exits when asked and the prompt box is empty', async ($, on) => {
  const { disk, seen, tick } = engine(on, { files: { [EXIT]: ID + '\n' } })
  await start($)
  await tick()
  expect(seen.commands).toEqual(['exit'])
  expect(disk[EXIT]).toBe('')
})

test('waits while the prompt box holds a draft, says so once, then exits once it is clear', async ($, on) => {
  const { seen, tick } = engine(on, { files: { [EXIT]: ID + '\n' }, draft: 'half a sentence' })
  await start($)
  await tick()
  await tick()
  expect(seen.commands).toEqual([])
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toContain('clear the prompt box')
  seen.draft = ''
  await tick()
  expect(seen.commands).toEqual(['exit'])
})

test("ignores a request written for another session", async ($, on) => {
  const { seen, tick } = engine(on, { files: { [EXIT]: '1a2b3c4d-9999-4000-8000-000000000000\n' } })
  await start($)
  await tick()
  expect(seen.commands).toEqual([])
})
