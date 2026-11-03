import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { IdleCompactSettings } from '../types'

export const IDLE_MS = 15 * 60_000
// Background agents still at work mean the session is not idle yet: look again.
export const RETRY_MS = 5 * 60_000
// Below this fill a compaction saves little and still loses detail.
export const MIN_PERCENT = 10
// Before compacting, the main conversation updates the session board while it
// still holds the detail; the compaction follows this long after that turn.
export const SETTLE_MS = 5_000
// The session-board plugin's board file, in the plugin data folder Claude Code
// keeps for it when it is installed from the session-kit marketplace. The same
// rule is in session-board/hooks/paths.ts; change both together.
export const BOARD_DATA_ID = 'session-board-session-kit'

export async function boardPath($: EngineInterface): Promise<string> {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  const config =
    dir !== undefined && dir !== '' ? dir.replace(/\/+$/, '') : `${(await $.env.get('HOME')) ?? ''}/.claude`

  return `${config}/plugins/data/${BOARD_DATA_ID}/board.json`
}

function boardPrompt(path: string | undefined): string {
  const where = path === undefined ? 'the session-board file' : `the session-board file, ${path}`

  return [
    'The session has been idle for 15 minutes and is compacted right after this turn.',
    `Before that, update the session board (${where}) so every subject stands as it does now: states, short lines, notes, and the current local time as YYYY-MM-DD HH:MM in "updated". Re-read it first and keep it valid JSON.`,
    'Do nothing else: no agents, no other files, no questions. Answer in one line.',
  ].join('\n\n')
}

// A subagent cannot be compacted from outside, only by itself at its own
// window. So the session's general-purpose subagents run as this type, whose
// window is small: none of them can grow to the 800,000 tokens that a cold
// cache then makes it read back in full.
export const WORKER_WINDOW = 200_000
export const WORKER = 'idle-compact:worker'
const WORKER_PROMPT = [
  'You are a subagent of Claude Code, working on one task that another agent delegated to you. You have the tools to do it yourself: read and search the code, run commands, edit files.',
  'Do what the task asks, completely, and nothing beyond it. Follow every boundary the task states (files, branches, ports, commands not to run) and every rule in the project instructions you were given.',
  'Read before you change. Prefer editing an existing file to creating one. Do not write documentation or plan files unless the task asks for them.',
  'Check your work with the commands the task or the project names before you report. Report only what a command result in this run supports; say plainly what you did not run or could not verify.',
  'Your last message is the only thing the delegating agent reads. Make it short and complete: what you did, the evidence, what is left, and absolute paths for the files that matter. No file dumps.',
].join('\n\n')

// Waking a large subagent whose cache has gone cold makes it read its whole
// conversation again. Past these two marks a message to it is refused and
// answered with a brief to start a fresh agent from instead.
export const RETIRE_TOKENS = 150_000
export const COLD_MS = 5 * 60_000
const WAKE = '[wake]'
const BRIEF_TASK_CHARS = 4000
const BRIEF_REPORT_CHARS = 6000

const COMMAND = 'idle-compact'
const INITIAL: IdleCompactSettings = { isOn: true }
const settings = atom({ plugin: 'idle-compact', key: 'settings' } as const, INITIAL)

// The module's own: a reload starts them over, and session.start arms again.
let pending: Timer | undefined
let lastOutcome = 'No idle period has ended yet.'
// 'board': the board update was asked for and its turn runs; 'ready': it ended,
// so the next idle check compacts.
let phase: 'board' | 'ready' | undefined
// Set once the engine has taken the worker type: a spawn sent to a type that
// does not exist is refused, so nothing is redirected before then.
let workerProblem: string | undefined = 'not registered yet'

// When each subagent's loop last finished a turn, by its id. Unknown after a
// reload, which reads as cold.
const lastActive = new Map<string, number>()

type Transcript = { tokens: number; task: string; report: string }

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map(block =>
      typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string'
        ? block.text
        : '',
    )
    .filter(text => text !== '')
    .join('\n')
}

// Reads a subagent's conversation from outside its loop: no model request is
// made, so this costs nothing however large it is.
async function transcriptOf($: EngineInterface, agentId: string): Promise<Transcript | undefined> {
  const messages = await $.session.messages({ agentId, as: 'api' })
  if (!Array.isArray(messages)) return undefined
  const texts = messages.map(message => ({ role: message.role, text: textOf(message.content) }))
  const task = texts.find(m => m.role === 'user' && m.text !== '')?.text ?? ''
  const report = texts.findLast(m => m.role === 'assistant' && m.text !== '')?.text ?? ''

  return {
    // Four characters to a token: rough, and enough to tell 20,000 from 800,000.
    tokens: Math.round(JSON.stringify(messages).length / 4),
    task: task.slice(0, BRIEF_TASK_CHARS),
    report: report.slice(-BRIEF_REPORT_CHARS),
  }
}

function minutes(ms: number): string {
  const whole = Math.round(ms / 60_000)

  return whole >= 120 ? `${String(Math.round(whole / 60))} hours` : `${String(whole)} minutes`
}

function disarm(): void {
  pending?.cancel()
  pending = undefined
}

function arm($: EngineInterface, ms = IDLE_MS): void {
  disarm()
  pending = $.clock.after(ms, () => {
    pending = undefined
    void compactIfIdle($)
  })
}

function report($: EngineInterface, text: string): void {
  lastOutcome = text
  $.ui.log(`idle-compact: ${text}`)
}

async function compactIfIdle($: EngineInterface): Promise<void> {
  try {
    if (!(await read($, settings)).isOn) return
    const working = (await $.agent.list()).filter(
      agent => agent.status === 'running' || agent.status === 'pending',
    )
    if (working.length > 0) {
      lastOutcome = `Waiting: ${String(working.length)} background agent(s) still working.`
      arm($, RETRY_MS)

      return
    }
    const { percent } = (await $.session.usage()).context
    if (percent === undefined || percent < MIN_PERCENT) {
      report(
        $,
        `idle for 15 minutes, context at ${String(percent ?? 0)}% (under ${String(MIN_PERCENT)}%), left as it is.`,
      )

      return
    }
    if (phase !== 'ready') {
      phase = 'board'
      const path = await boardPath($).catch(() => undefined)
      const sent = await $.prompt.submit({ text: boardPrompt(path) })
      if (sent.drop !== undefined) {
        phase = undefined
        report($, `idle for 15 minutes, not compacted: the board update was refused: ${sent.drop}`)

        return
      }
      lastOutcome = 'idle for 15 minutes: asked for the board update, compacting after it.'

      return
    }
    phase = undefined
    const result = await $.session.compact()
    if (result.skip !== undefined) {
      report($, `idle for 15 minutes, not compacted: ${result.skip}`)

      return
    }
    const { tokensBefore, tokensAfter } = result
    report(
      $,
      tokensBefore !== undefined && tokensAfter !== undefined
        ? `idle for 15 minutes, compacted ${String(tokensBefore)} to ${String(tokensAfter)} tokens.`
        : 'idle for 15 minutes, compacted.',
    )
  } catch (error) {
    // $.session.compact rejects while a turn runs; that turn's end arms again.
    report($, `not compacted: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Idle auto-compact: show its state, list subagents, or turn it on or off',
      argumentHint: '[on|off|agents]',
    })
    try {
      await $.agent.register({
        name: 'worker',
        description:
          'General-purpose agent for multi-step tasks, searches and code changes; compacts its own conversation at 200,000 tokens.',
        prompt: WORKER_PROMPT,
        autoCompactWindow: WORKER_WINDOW,
      })
      workerProblem = undefined
    } catch (error) {
      workerProblem = error instanceof Error ? error.message : String(error)
      $.ui.log(`idle-compact: the capped subagent type was refused: ${workerProblem}`)
    }
    if ((await read($, settings)).isOn) arm($)

    return next(e)
  })

  // A general-purpose subagent starts as the capped worker instead. Forks,
  // teammates, workflow agents and every named type are left as they are.
  on('agent.spawn', async ($, e, next) => {
    const isPlain =
      e.subagentType === 'general-purpose' &&
      !e.fork &&
      e.isTeammate !== true &&
      e.workflow === undefined
    if (!isPlain || workerProblem !== undefined || !(await read($, settings)).isOn)
      return next(e)

    return next({ ...e, subagentType: WORKER })
  })

  // Any sign of activity ends the idle period.
  on('prompt.submit', ($, e, next) => {
    disarm()
    // The person's prompt (not the board request) ends the idle period.
    if (!(e.origin?.kind === 'plugin' && e.origin.name === 'idle-compact')) phase = undefined

    return next(e)
  })
  on('turn.start', ($, e, next) => {
    disarm()

    return next(e)
  })

  // The main conversation went quiet: start counting. A subagent's turn
  // (e.agentId set) says nothing about whether the person is idle.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) lastActive.set(e.agentId, await $.clock.now())
    if (e.agentId === undefined && (await read($, settings)).isOn) {
      if (phase === 'board') {
        phase = 'ready'
        arm($, SETTLE_MS)
      } else {
        phase = undefined
        arm($)
      }
    }

    return next(e)
  })

  // The main conversation is about to message a subagent. A large one that
  // has sat idle is not woken: the answer is its task and last report, to
  // brief a fresh agent with. Starting the message with [wake] wakes it anyway.
  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    if (e.agentId !== undefined || typeof e.message !== 'string' || typeof e.to !== 'string')
      return next(e)
    if (e.message.startsWith(WAKE))
      return next({ ...e, message: e.message.slice(WAKE.length).trimStart() })
    if (!(await read($, settings)).isOn) return next(e)
    const to = e.to.replace(/ \[[0-9a-f]+\]$/, '')
    const agent = (await $.agent.list()).find(
      a => a.name === to || a.id === to || a.teammateId === to,
    )
    if (agent === undefined || agent.status === 'running' || agent.status === 'pending')
      return next(e)
    const seenAt = lastActive.get(agent.id)
    const idleMs = seenAt === undefined ? undefined : (await $.clock.now()) - seenAt
    if (idleMs !== undefined && idleMs < COLD_MS) return next(e)
    const transcript = await transcriptOf($, agent.id)
    if (transcript === undefined || transcript.tokens < RETIRE_TOKENS) return next(e)

    return {
      deny: [
        `idle-compact did not wake "${to}": it holds about ${String(transcript.tokens)} tokens and has been idle ${idleMs === undefined ? 'since before this mod last loaded' : `for ${minutes(idleMs)}`}, so one message would make it read all of that again.`,
        `Start a fresh agent with the brief below plus your message, and leave this one retired. To wake it anyway, send the message again starting with ${WAKE}.`,
        '',
        '--- Its task ---',
        transcript.task,
        '',
        '--- Its last report ---',
        transcript.report,
      ].join('\n'),
    }
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    if (word === 'agents') {
      const now = await $.clock.now()
      const rows = await Promise.all(
        (await $.agent.list()).map(async agent => {
          const transcript = await transcriptOf($, agent.id).catch(() => undefined)
          const seenAt = lastActive.get(agent.id)
          const isBusy = agent.status === 'running' || agent.status === 'pending'
          const isLarge = (transcript?.tokens ?? 0) >= RETIRE_TOKENS
          const isCold = seenAt === undefined || now - seenAt >= COLD_MS
          const verdict = isBusy
            ? 'working, left alone'
            : isLarge && isCold
              ? 'retired: a message to it is answered with a brief for a fresh agent'
              : 'can be messaged'

          return `${agent.name ?? agent.id} (${agent.type}, ${agent.status}): about ${transcript === undefined ? 'unknown' : String(transcript.tokens)} tokens, ${seenAt === undefined ? 'last turn not seen' : `idle ${minutes(now - seenAt)}`}; ${verdict}.`
        }),
      )

      return { text: rows.length === 0 ? 'No subagents in this session.' : rows.join('\n') }
    }
    if (word === 'on' || word === 'off') {
      const isOn = word === 'on'
      await update($, settings, () => ({ isOn }))
      if (isOn) arm($)
      else {
        disarm()
        phase = undefined
      }

      return { text: isOn ? 'Idle auto-compact is on.' : 'Idle auto-compact is off.' }
    }
    const { isOn } = await read($, settings)
    const { percent } = (await $.session.usage()).context

    return {
      text: [
        `Idle auto-compact is ${isOn ? 'on' : 'off'}: after 15 minutes without a prompt or a turn, when the context is at ${String(MIN_PERCENT)}% or more, it asks for a session board update and then compacts.`,
        `Context now: ${percent === undefined ? 'not measured yet' : `${String(percent)}%`}. Timer: ${pending === undefined ? 'not running' : 'running'}.`,
        `Subagents: ${workerProblem !== undefined ? `left as they are (capped type: ${workerProblem})` : isOn ? `general-purpose ones run as ${WORKER} and compact themselves at ${String(WORKER_WINDOW)} tokens` : 'left as they are'}.`,
        `Last: ${lastOutcome}`,
      ].join('\n'),
    }
  })
}
