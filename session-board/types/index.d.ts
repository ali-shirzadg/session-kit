/**
 * What a line on the board is: running now, waiting on the person, still to
 * do, tied to a date, being watched, or finished.
 */
export type BoardItemState = 'run' | 'you' | 'todo' | 'date' | 'watch' | 'done'

/** `auto` marks a line `/board check` wrote; the next check replaces it. */
export type BoardItem = { state: BoardItemState; text: string; note?: string; auto?: boolean }

/**
 * How a section behaves: `running` is drawn first while one of its lines runs
 * and hidden when none does; `monitor` is the one `/board check` refreshes.
 */
export type BoardSectionKind = 'running' | 'monitor'

export type BoardSection = { title: string; kind?: BoardSectionKind; items: BoardItem[] }

/**
 * The board as drawn; `check` is the script `/board check` runs, `problem`
 * says why the file could not be read.
 */
export type Board = {
  updated: string
  check?: string
  sections: BoardSection[]
  problem?: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-board': { board: Board }
  }
}
