import type { EngineInterface } from 'claude-code'

import { localStamp } from './paths'

export const INBOX = 'Inbox (your asks, captured)'

// Messages that only steer the running work: nothing to come back to.
const CHATTER = /^(ok|okay|yes|no|go|continue|proceed|thanks|thank you|done|update board|sure|y|n)\W*$/i

const RULES = `You turn one message a person sent to their coding assistant into a single line for a to-do board, so the ask is not lost while the assistant is busy.
Write the person's intent as a clear, complete ask or idea, in plain English, at most 160 characters: name the subject, what they want, and any constraint they gave. Fix spelling. Do not add anything they did not say.
If the message holds several separate asks, join them with " · ".
If the message is only an approval, an answer to a yes/no question, a "continue", or carries no ask, question or idea, reply exactly SKIP.
Reply with the line only.`

/** Whether a message is worth a model call at all. */
export function worthCapturing(text: string): boolean {
  const t = text.trim()
  return t.length >= 12 && !CHATTER.test(t) && !t.startsWith('/')
}

/** Adds one line to the inbox section (created first on the board), unless the same line is there. */
export function addToInbox(boardText: string, line: string, note: string): string {
  const board = JSON.parse(boardText) as { sections: { title: string; items: Record<string, string>[] }[] } & Record<string, unknown>
  let section = board.sections.find(s => s.title === INBOX)
  if (!section) {
    section = { title: INBOX, items: [] }
    board.sections.unshift(section)
  }
  if (!section.items.some(item => item.text === line)) section.items.push({ state: 'todo', text: line, note })
  return JSON.stringify(board, null, 2)
}

/** Distils the message and writes it to the board; never throws, never blocks the prompt. */
export async function capture($: EngineInterface, text: string, path: string): Promise<void> {
  try {
    const r = await $.model.complete({
      model: 'haiku',
      system: RULES,
      prompt: text.slice(0, 4000),
      effort: 'low',
      timeoutMs: 20000,
    })
    if (!r.isAnswered) return
    const line = (r.text.trim().split('\n')[0] ?? '').slice(0, 200)
    if (line === '' || line === 'SKIP') return
    const at = localStamp().slice(5)
    await $.fs.write(path, addToInbox(await $.fs.read(path), line, `asked ${at}`))
  } catch {
    // A missed capture is not worth interrupting the person for.
  }
}
