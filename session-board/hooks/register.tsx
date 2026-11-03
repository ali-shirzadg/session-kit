import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { BoardItemState } from '../types'
import { EMPTY, applyCheck, arrange, countOf, hiddenDone, parseBoard, parseCheck, visibleItems } from './board'
import { capture, worthCapturing } from './inbox'
import { boardPath, ensureBoard, localStamp } from './paths'

const PANE = 'session-board'
const TITLE = 'Session board'
const POLL_MS = 3000
const CHECK_MS = 120_000
const board = atom({ plugin: 'session-board', key: 'board' } as const, EMPTY)

const MARKS: Record<BoardItemState, { glyph: string; color: Color }> = {
  run: { glyph: '▶', color: 'success' },
  you: { glyph: '●', color: 'warning' },
  todo: { glyph: '○', color: 'text' },
  date: { glyph: '◇', color: 'suggestion' },
  watch: { glyph: '~', color: 'subtle' },
  done: { glyph: '✓', color: 'inactive' },
}

// The counts drawn under the title, in this order: what needs the person
// first, then what is moving, then what is only watched.
const SUMMARY: readonly BoardItemState[] = ['you', 'run', 'todo', 'date', 'watch']
const SUMMARY_WORDS: Record<BoardItemState, string> = {
  run: 'running',
  you: 'need you',
  todo: 'to do',
  date: 'dated',
  watch: 'watching',
  done: 'done',
}

// The file's modification time as last read, and the problem last shown, so a
// poll that finds nothing new writes nothing and redraws nothing.
let seenMtimeMs = -1
let shownProblem: string | undefined
let isReading = false
// The board file's absolute path, resolved once per load.
let boardFile: string | undefined

async function pathOf($: EngineInterface): Promise<string> {
  boardFile ??= await boardPath($)

  return boardFile
}

async function refresh($: EngineInterface, isForced = false): Promise<void> {
  if (isReading) return
  isReading = true
  try {
    let path = 'the board file'
    let problem: string
    try {
      path = await pathOf($)
      const { mtimeMs } = await $.fs.stat(path)
      if (!isForced && mtimeMs === seenMtimeMs) return
      seenMtimeMs = mtimeMs
      const next = parseBoard(await $.fs.read(path))
      shownProblem = undefined
      await update($, board, () => next)

      return
    } catch (error) {
      problem = `${path}: ${error instanceof Error ? error.message : String(error)}`
    }
    if (problem === shownProblem) return
    shownProblem = problem
    await update($, board, current => ({ ...current, problem }))
  } finally {
    isReading = false
  }
}

/**
 * Runs the board's `check` command line and writes what it found into the
 * monitor section; answers with one line saying what happened.
 */
async function runCheck($: EngineInterface): Promise<string> {
  const path = await pathOf($)
  const { check } = parseBoard(await $.fs.read(path))
  if (check === undefined) {
    return `No check set: add "check": "<command line>" to ${path} (it prints a JSON array of lines).`
  }
  const run = await $.process.run(['bash', '-c', check], { timeoutMs: CHECK_MS })
  if (run.exitCode !== 0) {
    return `Check failed (exit ${String(run.exitCode)}): ${run.stderr.trim().slice(0, 300)}`
  }
  const found = parseCheck(run.stdout)
  const stamp = localStamp()
  await $.fs.write(path, applyCheck(await $.fs.read(path), found, stamp))
  await refresh($, true)

  return `Monitor checked ${stamp}: ${String(found.length)} lines.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'board',
      description: 'Show the session board; "/board check" refreshes the monitor lines, "/board path" prints where the file is',
      argumentHint: '[check|path]',
    })
    try {
      const path = await pathOf($)
      if ((await ensureBoard($, path)) === 'migrated') {
        $.ui.log(`session-board: moved the board from the plugin folder to ${path}`)
      }
    } catch (error) {
      $.ui.log(`session-board: could not prepare the board file: ${error instanceof Error ? error.message : String(error)}`)
    }
    await refresh($, true)
    $.clock.every(POLL_MS, () => void refresh($))
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  // Every ask the person types lands on the board as one distilled line, so it
  // can be picked up later even when it arrives in the middle of other work.
  on('prompt.submit', async ($, e, next) => {
    // Only asks typed while a turn runs: one sent to an idle session is answered at once.
    if (e.turnId && !e.command && !e.isMeta && worthCapturing(e.text)) {
      void pathOf($)
        .then(path => capture($, e.text, path))
        .catch(() => undefined)
    }
    return next(e)
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    if (e.args.trim() === 'path') return { text: await pathOf($) }
    if (e.args.trim() === 'check') {
      try {
        return { text: await runCheck($) }
      } catch (error) {
        return { text: `Check failed: ${error instanceof Error ? error.message : String(error)}` }
      }
    }
    await refresh($, true)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Session board opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { updated, problem, ...all } = await read($, board)
    const sections = arrange(all.sections)

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Text bold>{TITLE}</Text>
        {updated !== '' && <Text dimColor>Updated {updated}</Text>}
        {sections.length > 0 && (
          <Box flexDirection="row" gap={2} flexWrap="wrap">
            {SUMMARY.filter(state => countOf(sections, state) > 0).map(state => (
              <Text color={MARKS[state].color} bold={state === 'you'}>
                {`${MARKS[state].glyph} ${String(countOf(sections, state))} ${SUMMARY_WORDS[state]}`}
              </Text>
            ))}
          </Box>
        )}
        {problem !== undefined && (
          <Text color="error" wrap="wrap">
            {problem}
          </Text>
        )}
        {sections.length === 0 && problem === undefined && (
          <Text dimColor>Nothing on the board yet.</Text>
        )}
        {sections.map(section => (
          <Box flexDirection="column" marginTop={1}>
            <Box flexDirection="row" gap={1}>
              <Text bold color="claude">
                {section.title}
              </Text>
              <Text dimColor>{String(section.items.length)}</Text>
            </Box>
            {visibleItems(section.items).map(item => (
              <Box flexDirection="row">
                <Box width={2} flexShrink={0}>
                  <Text color={MARKS[item.state].color}>
                    {MARKS[item.state].glyph}
                  </Text>
                </Box>
                <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                  <Text wrap="wrap" dimColor={item.state === 'done'}>
                    {item.text}
                  </Text>
                  {item.note !== undefined && (
                    <Text dimColor wrap="wrap">
                      {item.note}
                    </Text>
                  )}
                </Box>
              </Box>
            ))}
            {hiddenDone(section.items) > 0 && (
              <Text dimColor>{`✓ ${String(hiddenDone(section.items))} earlier done`}</Text>
            )}
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor wrap="wrap">
            ▶ running ● needs you ○ to do ◇ dated ~ watching ✓ done
          </Text>
        </Box>
      </Box>
    )
  })
}
