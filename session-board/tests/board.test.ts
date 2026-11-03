import { expect, mock, test } from 'claude-code/testing'

import type { TestBody } from 'claude-code/testing'

import { applyCheck, arrange, countOf, hiddenDone, parseBoard, parseCheck, visibleItems } from '../hooks/board'

type On = Parameters<TestBody>[1]

const HOME = '/home/someone'
const BOARD_FILE = `${HOME}/.claude/plugins/data/session-board-session-kit/board.json`

// The environment the board path is read from: HOME set, no CLAUDE_CONFIG_DIR.
function home(on: On): void {
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
}

const PANE = {
  title: 'Session board',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

const BOARD = {
  command: 'board',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

function file(text: string): string {
  return JSON.stringify({
    updated: '2026-10-11 23:30',
    sections: [
      {
        title: 'Running now',
        items: [{ state: 'run', text, note: 'sampling 320 pages' }, 'a plain line'],
      },
    ],
  })
}

test('parseBoard keeps what it knows and drops what it cannot draw', () => {
  const board = parseBoard(
    JSON.stringify({
      updated: 'now',
      sections: [
        { title: 'A', items: [{ state: 'nonsense', text: 'x\ty' }, { text: '' }, 7] },
        { items: ['no title'] },
      ],
    }),
  )
  expect(board.updated).toBe('now')
  expect(board.sections.length).toBe(1)
  expect(board.sections[0]?.items).toEqual([{ state: 'todo', text: 'x y' }])
  expect(() => parseBoard('[]')).toThrow()
})

test('the pane draws the board file and follows an edit to it', async ($, on) => {
  const clock = mock.clock(on)
  let shown = 'Picture fix agent'
  let text = file(shown)
  let mtimeMs = 1
  home(on)
  on('fs.exists', () => ({ value: true }))
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: text.length, mtimeMs, isLink: false } }))
  on('fs.read', () => ({ value: text }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  // The poll that follows the file starts with the session.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'session-board',
      surface,
      component: 'Pane',
      requestId: 'session-board',
      props: PANE,
    })
    expect(await ui.find({ type: 'Text', text: new RegExp(shown) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /sampling 320 pages/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /a plain line/ })).toBeDefined()

    // The file changes on disk; the next poll redraws the open pane.
    shown = `Edited on ${surface}`
    text = file(shown)
    mtimeMs += 1
    await clock.advance(3000)
    expect(await ui.find({ type: 'Text', text: new RegExp(shown) })).toBeDefined()
    await ui.unmount()
  }
})

test('a file that does not parse shows the reason and keeps the last board', async ($, on) => {
  let text = file('Still here')
  let mtimeMs = 1
  home(on)
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: text.length, mtimeMs, isLink: false } }))
  on('fs.read', () => ({ value: text }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  await $.command.run(BOARD)

  text = '{ not json'
  mtimeMs = 2
  await $.command.run(BOARD)
  const ui = await $.ui.mount({
    plugin: 'session-board',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'session-board',
    props: PANE,
  })
  expect(await ui.find({ type: 'Text', text: /Still here/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /session-board-session-kit\/board\.json:/ })).toBeDefined()
  await ui.unmount()
})

// The plugin's own files, by the end of their path: the test does not know
// where the engine placed the plugin folder.
function keyOf(path: string): string {
  if (path === BOARD_FILE) return path
  if (path.endsWith('/data/board.json')) return 'old'
  if (path.endsWith('/data/board.template.json')) return 'template'

  return path
}

// Starts a session in a world of files and answers what was written.
async function startWith($: Parameters<TestBody>[0], on: On, files: Record<string, string>) {
  mock.clock(on)
  const written: { path: string; text: string }[] = []
  const logs: string[] = []
  home(on)
  on('fs.exists', (_, e) => ({ value: keyOf(e.path) in files }))
  on('fs.read', (_, e) => {
    const text = files[keyOf(e.path)]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)

    return { value: text }
  })
  on('fs.stat', (_, e) => {
    if (!(keyOf(e.path) in files)) throw new Error(`ENOENT: ${e.path}`)

    return { value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } }
  })
  on('fs.write', (_, e) => {
    written.push({ path: e.path, text: e.text })
    files[keyOf(e.path)] = e.text

    return { value: undefined }
  })
  on('ui.log', (_, e) => {
    logs.push(e.text)

    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  return { written, logs }
}

test('a board kept in the plugin folder moves once to the plugin data folder', async ($, on) => {
  const before = file('From the old place')
  const { written, logs } = await startWith($, on, {
    old: before,
    template: file('template'),
  })
  expect(written).toEqual([{ path: BOARD_FILE, text: before }])
  expect(logs.join('\n')).toMatch(/moved the board/)
  expect(await $.command.run({ ...BOARD, args: 'path' })).toEqual({ text: BOARD_FILE })
})

test('with no board anywhere the template seeds it', async ($, on) => {
  const template = file('template')
  const { written } = await startWith($, on, {
    template,
  })
  expect(written).toEqual([{ path: BOARD_FILE, text: template }])
})

test('a board already in the data folder is left alone', async ($, on) => {
  const { written } = await startWith($, on, {
    [BOARD_FILE]: file('mine'),
    old: file('old'),
    template: file('template'),
  })
  expect(written).toEqual([])
})

test('counts lines by state and keeps only the last three finished lines', () => {
  const items = [
    { state: 'done', text: 'd1' },
    { state: 'you', text: 'ask' },
    { state: 'done', text: 'd2' },
    { state: 'done', text: 'd3' },
    { state: 'run', text: 'go' },
    { state: 'done', text: 'd4' },
    { state: 'done', text: 'd5' },
  ] as const
  const sections = [{ title: 'A', items: [...items] }]
  expect(countOf(sections, 'done')).toBe(5)
  expect(countOf(sections, 'you')).toBe(1)
  expect(hiddenDone([...items])).toBe(2)
  expect(visibleItems([...items]).map(item => item.text)).toEqual([
    'ask',
    'd3',
    'go',
    'd4',
    'd5',
  ])
})

test('a running section comes first while a line runs and hides when none does', () => {
  const inbox = { title: 'Inbox', items: [] }
  const idle = { title: 'Running now', kind: 'running' as const, items: [{ state: 'done' as const, text: 'shipped' }] }
  const live = { ...idle, items: [{ state: 'run' as const, text: 'agent building' }] }
  expect(arrange([inbox, idle]).map(one => one.title)).toEqual(['Inbox'])
  expect(arrange([inbox, live]).map(one => one.title)).toEqual(['Running now', 'Inbox'])
  expect(parseBoard(JSON.stringify({ sections: [{ title: 'R', kind: 'odd', items: [] }] })).sections[0]?.kind).toBe(undefined)
})

test('a check replaces its own monitor lines and keeps the hand-written ones', () => {
  const text = JSON.stringify({
    updated: 'before',
    check: '~/check.sh',
    sections: [
      { title: 'Monitor', kind: 'monitor', items: [{ state: 'watch', text: 'old', auto: true }, { state: 'watch', text: 'GSC by hand' }] },
    ],
  })
  const found = parseCheck('[{"state":"watch","text":"Disk 48%"},{"state":"bogus","text":"Sync 3 stale"}]')
  const after = parseBoard(applyCheck(text, found, 'now'))
  expect(after.updated).toBe('now')
  expect(after.check).toBe('~/check.sh')
  expect(after.sections[0]?.items).toEqual([
    { state: 'watch', text: 'Disk 48%', auto: true },
    { state: 'todo', text: 'Sync 3 stale', auto: true },
    { state: 'watch', text: 'GSC by hand' },
  ])
  expect(parseCheck('{"items":[{"text":"x"}]}')).toEqual([{ state: 'todo', text: 'x' }])
  expect(() => parseCheck('"nope"')).toThrow()
  expect(() => applyCheck(JSON.stringify({ sections: [] }), found, 'now')).toThrow()
})
