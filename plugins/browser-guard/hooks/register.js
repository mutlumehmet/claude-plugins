// browser-guard: holds a browser action that could submit, send, apply, pay or
// move a form forward until the user picks "Continue" in Claude Code's question
// dialog. Anything else (Stop, a typed answer, dismissing the dialog, a
// claude -p run with nobody to ask, or this hook failing) refuses the action.
//
// Covers Claude in Chrome, Playwright and Chrome DevTools. Every tool of those
// servers is classified below; a tool or computer action that is not listed is
// held, so a new tool fails closed. A click is let through only when its element
// has a known label (from an earlier snapshot, or the call's own description)
// and that label has no risky word; a click on an element with no label is held.

const GO = 'Continue'
const STOP = 'Stop'

// Words on a button or link that mean "this leaves the page or commits something"
const EN = 'submit|send|apply|applies|pay|payment|purchase|buy|order|checkout|check out|confirm|publish|post|sign up|register|book|donate|transfer|delete|remove|next|continue|finish|complete'
// Extra words come from the extra_words setting: regex fragments separated by |, each matched as a
// stem with any ending, for buttons in other languages
export function buildRisky(extra) {
  let words = '(?:' + EN + ')(?:s|es|ed|d|ing|ting|ted|ning)?(?=[^\\p{L}]|$)'
  const more = String(extra ?? '').trim()
  if (more) {
    try {
      new RegExp('(?:' + more + ')', 'iu')
      words += '|(?:' + more + ')\\p{L}*'
    } catch {
      // An invalid setting keeps the English words only
    }
  }
  return new RegExp('(^|[^\\p{L}])(' + words + ')', 'iu')
}
let RISKY = buildRisky('')
const ENTER = /^(enter|return|numpadenter|kp_enter)$/i

// Tools that only read, navigate, look or wait: never held
const READ_ONLY = {
  'claude-in-chrome': ['navigate', 'read_page', 'find', 'get_page_text', 'tabs_context_mcp', 'tabs_create_mcp', 'tabs_close_mcp',
    'read_console_messages', 'read_network_requests', 'resize_window', 'gif_creator', 'shortcuts_list',
    'list_connected_browsers', 'select_browser', 'switch_browser'],
  plugin_playwright_playwright: ['browser_navigate', 'browser_navigate_back', 'browser_snapshot', 'browser_find', 'browser_take_screenshot',
    'browser_tabs', 'browser_console_messages', 'browser_network_requests', 'browser_network_request', 'browser_resize',
    'browser_wait_for', 'browser_close', 'browser_hover', 'browser_emulate_media'],
  'plugin_chrome-devtools-mcp_chrome-devtools': ['navigate_page', 'new_page', 'close_page', 'select_page', 'list_pages', 'take_snapshot',
    'take_screenshot', 'take_heapsnapshot', 'list_console_messages', 'get_console_message', 'list_network_requests',
    'get_network_request', 'resize_page', 'emulate', 'wait_for', 'hover', 'lighthouse_audit',
    'performance_start_trace', 'performance_stop_trace', 'performance_analyze_insight'],
}
// Tools that only put values into fields, with no submit of their own: never held
const FILL_ONLY = {
  plugin_playwright_playwright: ['browser_fill_form', 'browser_select_option'],
  'plugin_chrome-devtools-mcp_chrome-devtools': ['fill', 'fill_form'],
}
// computer actions that only look, scroll or wait
const COMPUTER_READ_ONLY = ['screenshot', 'zoom', 'wait', 'scroll', 'scroll_to', 'hover']
const COMPUTER_CLICKS = ['left_click', 'right_click', 'double_click', 'triple_click', 'left_click_drag']

// ref -> 'button "Submit order"', from the snapshots this session has seen
const labels = new Map()

export function register(on, options) {
  RISKY = buildRisky(options?.extra_words)
  on('tool.call', {
    tool: /^mcp__(claude-in-chrome|plugin_playwright_playwright|plugin_chrome-devtools-mcp_chrome-devtools)__/,
  }, guard).catch(async ($, e, next) => {
    return { deny: 'browser-guard failed (' + next.error.kind + '), so this browser action was not run. Tell the user.' }
  })
}

async function guard($, e, next) {
  const held = assess(e)
  if (held.length) {
    let answer = STOP
    try {
      answer = await $.ui.ask(
        'Browser · this step may send or submit something:\n\n' + held.map((h) => '• ' + h).join('\n') + '\n\nContinue?',
        // The safe choice comes first, so a reflexive Enter does not act
        [STOP, GO],
      )
    } catch {
      // Dismissed, "Chat about this", or nobody there to ask: keep STOP
    }
    if (answer !== GO) {
      return { deny: 'The user did not approve this browser action in the browser-guard dialog, so it was not run. Ask them before trying it another way.' }
    }
  }
  const result = await next(e)
  remember(e, result)
  return result
}

// Returns one line per held part of the call, or [] to let it through
export function assess(e) {
  const parts = e.tool.split('__')
  const server = parts[1]
  const name = parts.slice(2).join('__')
  if (server === 'claude-in-chrome' && name === 'browser_batch') {
    const actions = e.actions ?? []
    if (!actions.length) return ['Empty or unreadable browser_batch']
    return actions.flatMap((a) => assessOne(server, String(a.name ?? ''), a.input ?? {}))
  }
  return assessOne(server, name, e)
}

function assessOne(server, name, input) {
  if (READ_ONLY[server]?.includes(name)) return []
  if (FILL_ONLY[server]?.includes(name)) return []

  if (server === 'claude-in-chrome') {
    const tab = input.tabId
    if (name === 'computer') {
      const a = input.action
      if (COMPUTER_READ_ONLY.includes(a)) return []
      if (COMPUTER_CLICKS.includes(a)) {
        return element('Click', input.ref ? labels.get('c:' + tab + ':' + input.ref) : null, input.action_summary, input.ref ?? coords(input))
      }
      if (a === 'type') {
        return /[\r\n]/.test(String(input.text ?? '')) ? ['Typed text with a line break (may submit the form like Enter): ' + clip(input.action_summary ?? input.text)] : []
      }
      if (a === 'key') {
        return String(input.text ?? '').split(/\s+/).some((k) => ENTER.test(k))
          ? ['Enter key' + (input.action_summary ? ': ' + clip(input.action_summary) : ' (may submit the form)')]
          : []
      }
      return ['Bilinmeyen computer eylemi: ' + a]
    }
    if (name === 'form_input') {
      return element('Form field', labels.get('c:' + tab + ':' + input.ref), input.action_summary, input.ref)
    }
    if (name === 'javascript_tool') return ['Code to run on the page:\n' + clip(input.text)]
    if (name === 'file_upload' || name === 'upload_image') return ['File upload: ' + clip(JSON.stringify(input.paths ?? input.imageId ?? input))]
    if (name === 'shortcuts_execute') return ['Run a Chrome shortcut: ' + (input.command ?? input.shortcutId)]
  }

  if (server === 'plugin_playwright_playwright') {
    if (name === 'browser_click') return element('Click', labels.get('p:' + input.target), input.element, input.target)
    if (name === 'browser_drag') {
      const desc = [input.startElement, input.endElement].filter(Boolean).join(' → ')
      const known = [input.startTarget, input.endTarget].map((t) => labels.get('p:' + t)).filter(Boolean).join(' → ')
      return element('Drag and drop', known || null, desc, [input.startTarget, input.endTarget].filter(Boolean).join(' → '))
    }
    if (name === 'browser_type') {
      return input.submit ? ['Type and press Enter (may submit the form): ' + clip(input.element ?? input.target)] : []
    }
    if (name === 'browser_press_key') return ENTER.test(String(input.key ?? '')) ? ['Enter key (may submit the form)'] : []
    if (name === 'browser_evaluate') return ['Code to run on the page:\n' + clip(input.function)]
    if (name === 'browser_run_code_unsafe') return ['Playwright kodu:\n' + clip(input.code ?? 'dosyadan: ' + input.filename)]
    if (name === 'browser_file_upload') return ['File upload: ' + clip(JSON.stringify(input.paths ?? input))]
    if (name === 'browser_drop') return ['Drop a file or data on the page: ' + clip(JSON.stringify(input.paths ?? input.data ?? input))]
    if (name === 'browser_handle_dialog') return input.accept ? ['Sayfa penceresini onaylama (confirm/prompt)' + (input.promptText ? ': ' + clip(input.promptText) : '')] : []
  }

  if (server === 'plugin_chrome-devtools-mcp_chrome-devtools') {
    if (name === 'click') return element('Click', labels.get('d:' + input.uid), null, 'uid ' + input.uid)
    if (name === 'drag') {
      const known = [input.from_uid, input.to_uid].map((u) => labels.get('d:' + u)).filter(Boolean).join(' → ')
      return element('Drag and drop', known || null, null, [input.from_uid, input.to_uid].filter(Boolean).join(' → '))
    }
    if (name === 'type_text') return ENTER.test(String(input.submitKey ?? '')) ? ['Type and press Enter (may submit the form)'] : []
    if (name === 'press_key') return /(^|\+)enter$/i.test(String(input.key ?? '')) ? ['Enter key (may submit the form)'] : []
    if (name === 'evaluate_script') return ['Code to run on the page:\n' + clip(input.function)]
    if (name === 'upload_file') return ['File upload: ' + clip(JSON.stringify(input.filePaths ?? input))]
    if (name === 'handle_dialog') return input.action === 'accept' ? ['Sayfa penceresini onaylama (confirm/prompt)'] : []
  }

  return ['Unknown browser tool: ' + name]
}

// A click or field: held when its label is risky, or when nothing names it
function element(what, known, described, where) {
  if (known) return RISKY.test(known) ? [what + ': ' + known] : []
  if (described) return RISKY.test(described) ? [what + ': ' + clip(described)] : []
  return [what + ' (label unknown): ' + (where ?? '?')]
}

function coords(input) {
  return Array.isArray(input.coordinate) ? 'x ' + input.coordinate[0] + ', y ' + input.coordinate[1] : null
}

// Reads element labels out of a snapshot-like result, so a later click by ref can be named
function remember(e, result) {
  if (!result || result.deny) return
  const text = typeof result.text === 'string' ? result.text : JSON.stringify(result.result ?? '')
  const server = e.tool.split('__')[1]
  const tab = e.tabId
  for (const line of text.split(/\\n|\n/)) {
    const label = line.match(/([\w-]+)\s+(?:\\)?"([^"\\]{1,120})(?:\\)?"/)
    if (!label) continue
    const named = label[1] + ' "' + label[2] + '"'
    let m
    if (server === 'claude-in-chrome' && tab != null && (m = line.match(/\b(ref_\d+)\b/))) labels.set('c:' + tab + ':' + m[1], named)
    if (server === 'plugin_playwright_playwright' && (m = line.match(/\[ref=(e\d+)\]/))) labels.set('p:' + m[1], named)
    if (server === 'plugin_chrome-devtools-mcp_chrome-devtools' && (m = line.match(/\buid=([\w-]+)/))) labels.set('d:' + m[1], named)
  }
}

function clip(s) {
  s = String(s ?? '')
  return s.length > 400 ? s.slice(0, 400) + '…' : s
}
