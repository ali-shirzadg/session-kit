import { expect, test } from 'claude-code/testing'

import { INBOX, addToInbox, worthCapturing } from '../hooks/inbox'

test('an ask lands once in an inbox section at the top', () => {
  const start = JSON.stringify({ updated: '', sections: [{ title: 'Decide now', items: [] }] })
  const once = addToInbox(start, 'Open Austria', 'asked 10-29 05:00')
  const twice = addToInbox(once, 'Open Austria', 'asked 10-29 05:01')
  const board = JSON.parse(twice)
  expect(board.sections[0].title).toBe(INBOX)
  expect(board.sections[0].items).toEqual([{ state: 'todo', text: 'Open Austria', note: 'asked 10-29 05:00' }])
  expect(board.sections[1].title).toBe('Decide now')
})

test('steering words and commands are not worth a call', () => {
  expect(worthCapturing('continue')).toBe(false)
  expect(worthCapturing('update board')).toBe(false)
  expect(worthCapturing('/board')).toBe(false)
  expect(worthCapturing('what other market can we open right now?')).toBe(true)
})
