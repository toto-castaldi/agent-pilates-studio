// Run by `claude plugin test` in a disposable copy, not by Node's unit-test runner.
// The native hooks, atoms, renderer and Button handlers are real; host effects are stand-ins.
import { expect, test } from 'claude-code/testing'
import { fixtures } from './fixture.ts'

function backend(on) {
  const state = { mode: 'viewer', focused: true, calls: [], opened: [], closed: [], registered: [], toasts: [] }
  on('process.run', async (_, e) => {
    state.calls.push(e)
    expect(e.argv.slice(0, 4)).toEqual(['python3', '.agents/tools/backlog.py', 'export', '--json'])
    expect(e.init.env).toEqual({ GIT_TERMINAL_PROMPT: '0' })
    const extra = e.argv.slice(4)
    expect(e.init.timeoutMs).toBe(extra.length ? 30000 : 10000)
    if (state.mode === 'missing') return { value: { exitCode: 1, stdout: '', stderr: 'Synthetic unreadable store' } }
    if (state.mode === 'invalid') return { value: { exitCode: 0, stdout: '{', stderr: '' } }
    let store = fixtures.base
    if (state.mode === 'empty') store = { versions: [], epics: [], items: [] }
    else if (state.mode === 'viewer') store = extra.length ? fixtures.viewerBranches : fixtures.viewer
    else if (state.mode === 'working') store = extra.length ? fixtures.working : fixtures.workingBase
    else if (!extra.length) store = fixtures.base
    else if (extra.includes('--no-fetch')) store = fixtures.cached
    else store = state.mode === 'failed' ? fixtures.failed : fixtures.fetched
    return { value: { exitCode: 0, stdout: JSON.stringify(store), stderr: '' } }
  })
  on('ui.open', async (_, e) => { state.opened.push(e); return { value: {} } })
  on('ui.close', async (_, e) => { state.closed.push(e); return { value: {} } })
  on('ui.panes', async () => ({ value: [{ id: 'backlog', isFocused: state.focused }] }))
  on('ui.toast', async (_, e) => { state.toasts.push(e); return { value: {} } })
  on('clock.sleep', async () => ({ value: null }))
  on('command.register', async (_, e) => { state.registered.push(e); return { value: {} } })
  on('session.start', async (_, e) => e)
  return state
}

async function mount($, focused = true) {
  return $.ui.mount({ plugin: 'backlog-overlay', surface: 'terminal', component: 'Pane',
    requestId: 'backlog', props: { isFocused: focused }, viewport: { columns: 80, rows: 24 } })
}

function text(node) {
  if (typeof node === 'string') return node
  return (node.children ?? []).map(text).join('')
}

async function shown(view) { return text(await view.drawn()) }
async function press(view, key, times = 1) {
  for (let i = 0; i < times; i++) await view.press({ key })
}

test('registers an immediate local command and preserves filters, navigation and session state', async ($, on) => {
  const host = backend(on)
  await $.session.start({ cwd: '/synthetic/project', source: 'startup' })
  expect(host.registered.map(({ name, description, immediate }) => ({ name, description, immediate })))
    .toEqual([{ name: 'backlog', description: 'Browse backlog items (read-only pane)', immediate: true }])
  await $.command.run({ command: 'backlog', args: '' })
  const view = await mount($)
  await press(view, 'reload')
  const { id, title, focus, closeOnEscape, rows } = host.opened[0]
  expect({ id, title, focus, closeOnEscape, rows }).toEqual({ id: 'backlog', title: 'Backlog', focus: true, closeOnEscape: true, rows: 24 })
  expect(await shown(view)).toContain('1 / 1 (3 total)')
  expect(await shown(view)).toContain('Type: all · Priority: all · Status: Todo')
  expect(await shown(view)).toContain('TEC-001 — Synthetic first')
  expect(await shown(view)).toContain('Synthetic body line 079')
  await press(view, 'status', 5)
  expect(await shown(view)).toContain('Status: all')
  await press(view, 'next')
  expect(await shown(view)).toContain('TEC-002 — Synthetic second')
  await press(view, 'last')
  expect(await shown(view)).toContain('TEC-003 — Synthetic unassigned')
  expect(await shown(view)).toContain('no version')
  await press(view, 'previous')
  expect(await shown(view)).toContain('Synthetic second')
  await press(view, 'first')
  expect(await shown(view)).toContain('Synthetic first')
  await press(view, 'type')
  expect(await shown(view)).toContain('Synthetic second')
  expect(await shown(view)).toContain('Type: User Story')
  await press(view, 'priority')
  expect(await shown(view)).toContain('No items match the filters')
  await press(view, 'priority', 2)
  expect(await shown(view)).toContain('Synthetic second')
  await press(view, 'close')
  expect(host.closed.map((pane) => pane.id)).toEqual(['backlog'])
  await view.unmount()
  await $.command.run({ command: 'backlog', args: '' })
  const reopened = await mount($)
  await press(reopened, 'reload')
  expect(await shown(reopened)).toContain('Type: User Story · Priority: P2 · Status: all')
  expect(await shown(reopened)).toContain('Synthetic second')
  await press(reopened, 'reset')
  expect(await shown(reopened)).toContain('Type: all · Priority: all · Status: Todo')
  expect(await shown(reopened)).toContain('Synthetic first')
  await reopened.unmount()
})

test('renders the shared CLI branch states, conflicts, cached fetch failures and the working copy', async ($, on) => {
  const host = backend(on)
  host.mode = 'branches'
  await $.command.run({ command: 'backlog', args: '' })
  const view = await mount($)
  await press(view, 'reload')
  await press(view, 'status', 5)
  let display = await shown(view)
  expect(display).toContain('In Progress')
  expect(display).toContain('from task/TEC-001-second')
  expect(display).toContain('also in: origin/task/TEC-001-first')
  expect(display).not.toContain('TEC-002')
  expect(display).not.toContain('TEC-001-merged')
  expect(host.calls.slice(-3).map((e) => e.argv.slice(4))).toEqual([[], ['--branches', '--no-fetch'], ['--branches']])
  host.mode = 'failed'
  await press(view, 'reload')
  display = await shown(view)
  expect(display).toContain('fetch failed: showing last known state')
  expect(display).toContain('from task/TEC-001-second')
  expect(display).toContain('In Progress')
  // The failed fetch's answer is not used to replace the local cached snapshot.
  expect(display).not.toContain('also in:')
  host.mode = 'working'
  await press(view, 'reload')
  display = await shown(view)
  expect(display).toContain('Synthetic working copy')
  expect(display).not.toContain('from task/')
  expect(display).not.toContain('also in:')
  await view.unmount()
})

test('shows focus guidance, errors and empty results while keeping local controls usable', async ($, on) => {
  const host = backend(on)
  host.focused = false
  await $.command.run({ command: 'backlog', args: '' })
  const view = await mount($, false)
  await press(view, 'reload')
  expect(await shown(view)).toContain('ctrl+x tab gives the keys to the backlog pane')
  for (const [mode, message] of [
    ['empty', 'The backlog contains no items.'],
    ['missing', 'Synthetic unreadable store'],
    ['invalid', 'Cannot run python3 .agents/tools/backlog.py'],
  ]) {
    host.mode = mode
    await press(view, 'reload')
    expect(await shown(view)).toContain(message)
  }
  host.mode = 'viewer'
  await press(view, 'reload')
  expect(await shown(view)).toContain('Synthetic first')
  await press(view, 'close')
  expect(host.closed.map((pane) => pane.id)).toEqual(['backlog'])
  await view.unmount()
})
