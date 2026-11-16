import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { COLD_MS, IDLE_MS, RETRY_MS, SETTLE_MS, WORKER, WORKER_WINDOW } from '../hooks/register'

const DONE = {
  answer: 'done',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
} as const

const BUSY: AgentInfo = {
  id: 'a1',
  description: 'a long task',
  type: 'general-purpose',
  status: 'running',
}

type On = Parameters<TestBody>[1]
type Engine = Parameters<TestBody>[0]
type Clock = ReturnType<typeof mock.clock>

// The board update the idle check asked for runs as a main turn and ends.
async function boardTurn($: Engine, clock: Clock) {
  await $.turn.complete({ ...DONE, turnId: 'board' })
  await clock.advance(SETTLE_MS)
}

function world(on: On, percent: number) {
  const seen = {
    percent,
    compactions: 0,
    agents: [] as AgentInfo[],
    logs: [] as string[],
    spawned: [] as string[],
    delivered: [] as string[],
    transcript: [] as { role: 'user' | 'assistant'; content: string }[],
    windows: [] as (number | undefined)[],
    prompts: [] as string[],
  }
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/someone' : undefined }))
  on('prompt.submit', (_, e) => {
    seen.prompts.push(e.text)

    return { text: e.text }
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1_000_000, percent: seen.percent }, rateLimits: [] },
  }))
  on('agent.list', () => ({ value: seen.agents }))
  on('ui.log', (_, e) => {
    seen.logs.push(e.text)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('agent.register', (_, e) => {
    seen.windows.push(e.autoCompactWindow)

    return { value: { agent: `idle-compact:${e.name}` } }
  })
  // The engine answers the Messages API form; the kit's type names only the rows.
  on('session.messages', () => ({ value: seen.transcript as never }))
  on('tool.call', { tool: 'SendMessage' }, (_, e) => {
    seen.delivered.push(String(e.message))

    return { result: { success: true, message: 'sent' } as never }
  })
  on('agent.spawn', (_, e) => {
    seen.spawned.push(e.subagentType)

    return { model: 'sonnet' }
  })
  on('session.compact', () => {
    seen.compactions += 1

    return {
      messages: [{ role: 'user' as const, text: 'summary', toolUses: [] }],
      tokensBefore: 300_000,
      tokensAfter: 20_000,
    }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  return seen
}

test('the idle time after a main turn compacts once', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, 35)
  await $.turn.complete(DONE)
  await clock.advance(IDLE_MS - 1000)
  expect(seen.compactions).toBe(0)
  await clock.advance(1000)
  // First the board is updated, then the conversation is compacted.
  expect(seen.prompts).toHaveLength(1)
  expect(seen.prompts[0]).toMatch(/session board/)
  expect(seen.prompts[0]).toMatch(/idle for 45 minutes/)
  expect(seen.prompts[0]).toContain('/home/someone/.claude/plugins/data/session-board-session-kit/board.json')
  expect(seen.compactions).toBe(0)
  await boardTurn($, clock)
  expect(seen.compactions).toBe(1)
  expect(seen.logs.join('\n')).toMatch(/compacted 300000 to 20000 tokens/)
  // Nothing new happened: the same idle period never compacts twice.
  await clock.advance(IDLE_MS * 3)
  expect(seen.compactions).toBe(1)
})

test('a new turn before the time is up starts the count again', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, 35)
  await $.turn.complete(DONE)
  await clock.advance(IDLE_MS - 1000)
  await $.turn.start({ text: 'next', turnId: 't2' })
  await clock.advance(IDLE_MS)
  expect(seen.compactions).toBe(0)
  await $.turn.complete({ ...DONE, turnId: 't2' })
  await clock.advance(IDLE_MS)
  await boardTurn($, clock)
  expect(seen.compactions).toBe(1)
})

test('a small conversation is left as it is, and a subagent turn starts nothing', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, 4)
  await $.turn.complete(DONE)
  await clock.advance(IDLE_MS)
  expect(seen.compactions).toBe(0)
  expect(seen.logs.join('\n')).toMatch(/context at 4%/)
  expect(seen.prompts).toHaveLength(0)

  seen.percent = 60
  await $.turn.complete({ ...DONE, agentId: 'a1' })
  await clock.advance(IDLE_MS)
  expect(seen.compactions).toBe(0)
})

test('it waits while a background agent still works', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, 35)
  seen.agents = [BUSY]
  await $.turn.complete(DONE)
  await clock.advance(IDLE_MS)
  expect(seen.compactions).toBe(0)
  seen.agents = [{ ...BUSY, status: 'completed' }]
  await clock.advance(RETRY_MS)
  await boardTurn($, clock)
  expect(seen.compactions).toBe(1)
})

test('off stops it and on starts it again', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, 35)
  const run = (args: string) =>
    $.command.run({
      command: 'idle-compact',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 160 },
    })
  await run('off')
  await $.turn.complete(DONE)
  await clock.advance(IDLE_MS)
  expect(seen.compactions).toBe(0)
  await run('on')
  await clock.advance(IDLE_MS)
  await boardTurn($, clock)
  expect(seen.compactions).toBe(1)
})

test('a prompt from the person during the board update starts the count again', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, 35)
  await $.turn.complete(DONE)
  await clock.advance(IDLE_MS)
  expect(seen.prompts).toHaveLength(1)
  await $.prompt.submit({ text: 'one more thing', wait: false, origin: { kind: 'composer' } })
  await boardTurn($, clock)
  expect(seen.compactions).toBe(0)
  await $.turn.complete({ ...DONE, turnId: 't3' })
  await clock.advance(IDLE_MS)
  expect(seen.prompts).toHaveLength(3)
  await boardTurn($, clock)
  expect(seen.compactions).toBe(1)
})

test('a general-purpose subagent starts as the capped worker, other types do not', async ($, on) => {
  mock.clock(on)
  const seen = world(on, 35)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(seen.windows).toEqual([WORKER_WINDOW])
  const spawn = (subagentType: string) =>
    $.agent.spawn({
      tool_use_id: `call-${subagentType}`,
      prompt: 'do it',
      description: 'a task',
      subagentType,
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'opus',
      background: true,
      fork: false,
    })
  await spawn('general-purpose')
  await spawn('Explore')
  expect(seen.spawned).toEqual([WORKER, 'Explore'])
})

const SEND = { tool: 'SendMessage', tool_use_id: 'm1', to: 'builder', message: 'one more thing' } as const
const BUILDER: AgentInfo = { ...BUSY, id: 'a9', name: 'builder', status: 'idle' }

test('a message to a large idle subagent is answered with its brief, not delivered', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, 35)
  seen.agents = [BUILDER]
  seen.transcript = [
    { role: 'user', content: 'Build the logo store.' },
    { role: 'assistant', content: 'x'.repeat(700_000) },
    { role: 'assistant', content: 'Done: branch feat/logos, 62 tests pass.' },
  ]
  // Its turn just ended: the cache is warm, so the message goes through.
  await $.turn.complete({ ...DONE, agentId: 'a9' })
  await $.tool.call(SEND)
  expect(seen.delivered).toEqual(['one more thing'])

  await clock.advance(COLD_MS)
  const refused = await $.tool.call(SEND)
  expect(seen.delivered).toEqual(['one more thing'])
  expect(refused.deny).toMatch(/did not wake "builder"/)
  expect(refused.deny).toMatch(/Build the logo store\./)
  expect(refused.deny).toMatch(/62 tests pass/)

  // Asked for by name, it is woken anyway, without the marker.
  await $.tool.call({ ...SEND, message: '[wake] one more thing' })
  expect(seen.delivered).toEqual(['one more thing', 'one more thing'])
})

test('a small idle subagent and a working one are messaged as usual', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, 35)
  seen.agents = [BUILDER]
  seen.transcript = [
    { role: 'user', content: 'Look something up.' },
    { role: 'assistant', content: 'Found it.' },
  ]
  await clock.advance(COLD_MS * 4)
  await $.tool.call(SEND)
  seen.transcript = [{ role: 'assistant', content: 'x'.repeat(900_000) }]
  seen.agents = [{ ...BUILDER, status: 'running' }]
  await $.tool.call(SEND)
  expect(seen.delivered).toEqual(['one more thing', 'one more thing'])
})
