import { afterEach, expect, test } from 'bun:test'

import { createUserMessage } from '../../utils/messages.js'
import { shouldQueueCompactAfterModelSwitch } from './modelSwitchCompaction.js'

const originalBlockingLimitOverride =
  process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE

afterEach(() => {
  if (originalBlockingLimitOverride === undefined) {
    delete process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE
  } else {
    process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE = originalBlockingLimitOverride
  }
})

test('queues /compact when target model is at blocking limit', () => {
  process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE = '1'

  const messages = [
    createUserMessage({
      content: 'hello from a long-running session',
    }),
  ]

  expect(shouldQueueCompactAfterModelSwitch(messages, 'gpt-4o')).toBe(true)
})

test('does not queue /compact when target model is below blocking limit', () => {
  process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE = '999999'

  const messages = [
    createUserMessage({
      content: 'hello from a short session',
    }),
  ]

  expect(shouldQueueCompactAfterModelSwitch(messages, 'gpt-4o')).toBe(false)
})
