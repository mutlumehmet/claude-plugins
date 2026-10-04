import { expect, test } from 'claude-code/testing'
// @ts-ignore: plain JS module
import { buildRisky } from '../hooks/register.js'

// The first option of every dialog, to check the safe choice leads
const firstOptions: string[] = []

const CHROME = 'mcp__claude-in-chrome__'
const PW = 'mcp__plugin_playwright_playwright__'
const DT = 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__'

// One tool.call stub stands for Claude Code: it answers the guard's question
// with `answer`, returns `snapshots[tool]` as a tool's text when given, and
// records every tool that actually got to run.
function engine(on, answer: string | null, asked: string[], ran: string[], snapshots: Record<string, string> = {}) {
  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') {
      const q = e.questions[0].question
      firstOptions.push(String(e.questions[0].options?.[0]?.label ?? e.questions[0].options?.[0]))
      asked.push(q)
      if (answer === null) return { deny: 'dismissed' }
      return { result: { answers: { [q]: answer } } }
    }
    ran.push(e.tool)
    return { result: 'ok', text: snapshots[e.tool] ?? 'ok' }
  })
}

test('a click whose summary says Submit is held, and runs on Continue', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran)
  await $.tool.call({ tool: CHROME + 'computer', action: 'left_click', coordinate: [10, 10], tabId: 1, action_summary: 'Submits the job application' })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('Submits the job application')
  expect(ran).toEqual([CHROME + 'computer'])
})

test('Stop refuses, and the click never runs', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Stop', asked, ran)
  const out = await $.tool.call({ tool: CHROME + 'computer', action: 'left_click', coordinate: [10, 10], tabId: 1, action_summary: 'Confirm the order' })
  expect(out.deny).toBeDefined()
  expect(ran).toEqual([])
})

test('a dismissed dialog or a typed answer refuses', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, null, asked, ran)
  const out = await $.tool.call({ tool: PW + 'browser_click', target: 'e5', element: 'Pay now button' })
  expect(out.deny).toBeDefined()
  expect(ran).toEqual([])
})

test('a click by ref is named from an earlier read_page, even with a vague summary', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Stop', asked, ran, { [CHROME + 'read_page']: 'textbox [ref_1]\nbutton "Submit order" [ref_13]\n' })
  await $.tool.call({ tool: CHROME + 'read_page', tabId: 7, filter: 'interactive' })
  const out = await $.tool.call({ tool: CHROME + 'computer', action: 'left_click', ref: 'ref_13', tabId: 7, action_summary: 'Clicks the button' })
  expect(asked[0]).toContain('button "Submit order"')
  expect(out.deny).toBeDefined()
})

test('a DevTools click by uid is named from an earlier take_snapshot', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran, { [DT + 'take_snapshot']: 'uid=1_4 link "Home"\nuid=1_9 button "Apply now"\n' })
  await $.tool.call({ tool: DT + 'take_snapshot', pageId: 1 })
  await $.tool.call({ tool: DT + 'click', pageId: 1, uid: '1_4' })
  expect(asked).toEqual([])
  await $.tool.call({ tool: DT + 'click', pageId: 1, uid: '1_9' })
  expect(asked[0]).toContain('button "Apply now"')
})

test('Enter presses are held on all three servers', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran)
  await $.tool.call({ tool: CHROME + 'computer', action: 'key', text: 'Return', tabId: 1, action_summary: 'Sends the message' })
  await $.tool.call({ tool: PW + 'browser_press_key', key: 'Enter' })
  await $.tool.call({ tool: DT + 'press_key', pageId: 1, key: 'Enter' })
  expect(asked.length).toBe(3)
})

test('every page script is held, even one that only reads', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran)
  await $.tool.call({ tool: CHROME + 'javascript_tool', action: 'javascript_exec', tabId: 1, text: 'document.title' })
  await $.tool.call({ tool: PW + 'browser_evaluate', function: '() => document.forms[0]["sub" + "mit"]()' })
  await $.tool.call({ tool: PW + 'browser_run_code_unsafe', code: "async (page) => { await page.getByRole('button', { name: 'Apply' }).click() }" })
  await $.tool.call({ tool: DT + 'evaluate_script', pageId: 1, function: '() => 1' })
  expect(asked.length).toBe(4)
})

test('a batch with one risky step asks once and names it', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran)
  await $.tool.call({
    tool: CHROME + 'browser_batch',
    actions: [
      { name: 'computer', input: { action: 'type', text: 'hello', tabId: 1, action_summary: 'Types the cover note' } },
      { name: 'computer', input: { action: 'left_click', coordinate: [5, 5], tabId: 1, action_summary: 'Clicks Next to go to step 3' } },
    ],
  })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('Clicks Next to go to step 3')
})

test('ordinary browsing passes without a question', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran)
  await $.tool.call({ tool: CHROME + 'navigate', tabId: 1, url: 'https://example.com' })
  await $.tool.call({ tool: CHROME + 'computer', action: 'left_click', coordinate: [1, 1], tabId: 1, action_summary: 'Opens the Filters menu' })
  await $.tool.call({ tool: CHROME + 'computer', action: 'type', text: 'Submit', tabId: 1, action_summary: 'Types the search term' })
  await $.tool.call({ tool: PW + 'browser_click', target: 'e3', element: 'Pricing tab' })
  expect(asked).toEqual([])
  expect(ran.length).toBe(4)
})

test('a click on an element with no known label is held (the security finding)', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Stop', asked, ran)
  // DevTools uid from a snapshot the mod never saw
  const a = await $.tool.call({ tool: DT + 'click', pageId: 1, uid: '9_99' })
  // Chrome click by a ref that was never read, with no summary
  const b = await $.tool.call({ tool: CHROME + 'computer', action: 'left_click', ref: 'ref_77', tabId: 3 })
  // Chrome click by coordinate with no summary
  const c = await $.tool.call({ tool: CHROME + 'computer', action: 'left_click', coordinate: [40, 40], tabId: 3 })
  // Playwright click with neither a cached label nor an element description
  const d = await $.tool.call({ tool: PW + 'browser_click', target: 'e42' })
  expect(asked.length).toBe(4)
  expect(asked[0]).toContain('label unknown')
  expect(asked[0]).toContain('uid 9_99')
  expect(asked[2]).toContain('x 40, y 40')
  for (const out of [a, b, c, d]) expect(out.deny).toBeDefined()
  expect(ran).toEqual([])
})

test('browser_type with submit is held, without submit it is not', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran)
  await $.tool.call({ tool: PW + 'browser_type', target: 'e7', element: 'Search box', text: 'flats', submit: false })
  expect(asked).toEqual([])
  await $.tool.call({ tool: PW + 'browser_type', target: 'e7', element: 'Search box', text: 'flats', submit: true })
  await $.tool.call({ tool: DT + 'type_text', pageId: 1, text: 'flats', submitKey: 'Enter' })
  await $.tool.call({ tool: CHROME + 'computer', action: 'type', tabId: 1, text: 'line one\n', action_summary: 'Types the note' })
  expect(asked.length).toBe(3)
  expect(asked[0]).toContain('Type and press Enter (may submit the form)')
})

test('form_input passes on a known harmless field and is held on an unknown one', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran, { [CHROME + 'find']: '- ref_2: textbox "Email" - the email field\n' })
  await $.tool.call({ tool: CHROME + 'find', tabId: 5, query: 'email field' })
  await $.tool.call({ tool: CHROME + 'form_input', tabId: 5, ref: 'ref_2', value: 'a@example.com' })
  expect(asked).toEqual([])
  await $.tool.call({ tool: CHROME + 'form_input', tabId: 5, ref: 'ref_9', value: true })
  expect(asked[0]).toContain('Form field (label unknown): ref_9')
})

test('uploads, accepted page dialogs and unknown tools are held; fills and reads are not', async ($, on) => {
  const asked: string[] = [], ran: string[] = []
  engine(on, 'Continue', asked, ran)
  await $.tool.call({ tool: PW + 'browser_fill_form', fields: [{ target: 'e1', name: 'Name', type: 'textbox', value: 'x' }] })
  await $.tool.call({ tool: DT + 'fill', pageId: 1, uid: '1_1', value: 'x' })
  await $.tool.call({ tool: DT + 'take_screenshot', pageId: 1 })
  await $.tool.call({ tool: PW + 'browser_handle_dialog', accept: false })
  expect(asked).toEqual([])
  await $.tool.call({ tool: PW + 'browser_handle_dialog', accept: true })
  await $.tool.call({ tool: DT + 'upload_file', pageId: 1, uid: '1_2', filePaths: ['/tmp/cv.pdf'] })
  await $.tool.call({ tool: PW + 'browser_drop', target: 'e2', paths: ['/tmp/cv.pdf'] })
  await $.tool.call({ tool: CHROME + 'shortcuts_execute', tabId: 1, command: 'apply' })
  await $.tool.call({ tool: PW + 'browser_some_new_tool' })
  expect(asked.length).toBe(5)
  expect(asked[4]).toContain('Unknown browser tool: browser_some_new_tool')
})

test('the safe choice is the first option of every dialog', () => {
  expect(firstOptions.length > 0).toBe(true)
  for (const o of firstOptions) expect(o).toBe('Stop')
})

test('extra_words adds words in other languages, and a bad pattern keeps English only', () => {
  expect(buildRisky('').test('Jetzt bestellen')).toBe(false)
  expect(buildRisky('bestellen|absenden').test('Jetzt bestellen')).toBe(true)
  expect(buildRisky('bestellen|absenden').test('Startseite')).toBe(false)
  expect(buildRisky('(((').test('Pay now')).toBe(true)
  expect(buildRisky('').test('Home')).toBe(false)
})
