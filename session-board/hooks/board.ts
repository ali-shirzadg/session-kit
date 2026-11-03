import type { Board, BoardItem, BoardItemState, BoardSection, BoardSectionKind } from '../types'

export const EMPTY: Board = { updated: '', sections: [] }

const KINDS: readonly BoardSectionKind[] = ['running', 'monitor']

const STATES: readonly BoardItemState[] = [
  'run',
  'you',
  'todo',
  'date',
  'watch',
  'done',
]

// A control character in drawn text is refused by the surface, so a stray tab
// or newline in the file becomes a space.
function line(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
    : ''
}

function item(value: unknown): BoardItem | undefined {
  if (typeof value === 'string') {
    const text = line(value)
    return text === '' ? undefined : { state: 'todo', text }
  }
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Record<string, unknown>
  const text = line(raw.text)
  if (text === '') return undefined
  const state = STATES.find(one => one === raw.state) ?? 'todo'
  const note = line(raw.note)
  return {
    state,
    text,
    ...(note === '' ? {} : { note }),
    ...(raw.auto === true ? { auto: true } : {}),
  }
}

function section(value: unknown): BoardSection | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Record<string, unknown>
  const title = line(raw.title)
  if (title === '') return undefined
  const items = Array.isArray(raw.items) ? raw.items : []
  const kind = KINDS.find(one => one === raw.kind)
  return {
    title,
    ...(kind === undefined ? {} : { kind }),
    items: items.map(item).filter(one => one !== undefined),
  }
}

/**
 * Reads the board file's text. A section without a title or a line without
 * text is left out, an unknown state reads as "to do", and a file that is not
 * a JSON object throws with the reason.
 */
export function parseBoard(text: string): Board {
  const raw: unknown = JSON.parse(text)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('board.json must hold one object with "sections"')
  }
  const file = raw as Record<string, unknown>
  const sections = Array.isArray(file.sections) ? file.sections : []
  const check = line(file.check)
  return {
    updated: line(file.updated),
    ...(check === '' ? {} : { check }),
    sections: sections.map(section).filter(one => one !== undefined),
  }
}

/**
 * The sections in drawing order: a `running` section comes first while one of
 * its lines runs and is left out while none does; the rest keep their order.
 */
export function arrange(sections: BoardSection[]): BoardSection[] {
  const isLive = (one: BoardSection) => one.items.some(item => item.state === 'run')
  const running = sections.filter(one => one.kind === 'running')
  return [
    ...running.filter(isLive),
    ...sections.filter(one => one.kind !== 'running'),
  ]
}

/**
 * Puts what a check found into the board file's text: the `monitor` section's
 * lines from the last check are replaced by `found` (marked `auto`, first),
 * lines written by hand stay after them. Throws when there is no such section.
 */
export function applyCheck(boardText: string, found: BoardItem[], updated: string): string {
  const board = JSON.parse(boardText) as Record<string, unknown> & {
    sections: (Record<string, unknown> & { items: unknown[] })[]
  }
  const monitor = board.sections.find(one => one.kind === 'monitor')
  if (monitor === undefined) throw new Error('no section has "kind": "monitor"')
  const kept = monitor.items.filter(
    one => !(typeof one === 'object' && one !== null && (one as { auto?: unknown }).auto === true),
  )
  monitor.items = [...found.map(one => ({ ...one, auto: true })), ...kept]
  board.updated = updated
  return JSON.stringify(board, null, 2)
}

/**
 * Reads a check script's standard output: a JSON array of lines (or
 * `{ "items": [...] }`), each kept by the board's own line rules.
 */
export function parseCheck(stdout: string): BoardItem[] {
  const raw: unknown = JSON.parse(stdout)
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : undefined
  if (items === undefined) throw new Error('the check printed no JSON array of lines')
  return items.map(item).filter(one => one !== undefined)
}

/** How many lines of the board are in a state, across all sections. */
export function countOf(sections: BoardSection[], state: BoardItemState): number {
  return sections.reduce(
    (sum, one) => sum + one.items.filter(item => item.state === state).length,
    0,
  )
}

/** A section shows at most this many finished lines: the latest ones. */
export const DONE_SHOWN = 3

/**
 * The lines a section draws: every open line, and only the last
 * `DONE_SHOWN` finished ones, so a long history does not push open work off
 * the pane. Order is kept.
 */
export function visibleItems(items: BoardItem[]): BoardItem[] {
  let skip = hiddenDone(items)
  return items.filter(item => {
    if (item.state !== 'done' || skip === 0) return true
    skip -= 1
    return false
  })
}

/** How many finished lines `visibleItems` leaves out. */
export function hiddenDone(items: BoardItem[]): number {
  const done = items.filter(item => item.state === 'done').length
  return Math.max(0, done - DONE_SHOWN)
}
