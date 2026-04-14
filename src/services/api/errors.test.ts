import { expect, test } from 'bun:test'

import {
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  classifyAPIError,
  getAssistantMessageFromError,
  isPromptTooLongErrorText,
  parsePromptTooLongTokenCounts,
} from './errors.js'

test('detects LiteLLM/Azure context-window overflow wording as prompt-too-long', () => {
  const msg =
    'litellm.BadRequestError: AzureException BadRequestError - Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 272125 tokens. Please reduce the length of the messages.'

  expect(isPromptTooLongErrorText(msg)).toBe(true)
  expect(classifyAPIError(new Error(msg))).toBe('prompt_too_long')
})

test('does not classify output-limit wording as prompt-too-long', () => {
  const msg =
    'Could not finish the message because max_tokens or model output limit was reached. Please try again with higher max_tokens.'

  expect(isPromptTooLongErrorText(msg)).toBe(false)
})

test('parses token counts from LiteLLM/Azure overflow message', () => {
  const msg =
    'Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 272125 tokens.'

  expect(parsePromptTooLongTokenCounts(msg)).toEqual({
    actualTokens: 272125,
    limitTokens: 272000,
  })
})

test('maps LiteLLM/Azure overflow to prompt-too-long assistant API error', () => {
  const msg =
    'Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 272125 tokens. Please reduce the length of the messages.'

  const assistantMessage = getAssistantMessageFromError(new Error(msg), 'gpt-5.2')

  expect(assistantMessage.isApiErrorMessage).toBe(true)
  expect(assistantMessage.errorDetails).toContain('configured limit of 272000')

  const firstBlock = Array.isArray(assistantMessage.message.content)
    ? assistantMessage.message.content[0]
    : null

  expect(firstBlock && firstBlock.type === 'text' ? firstBlock.text : '').toBe(
    PROMPT_TOO_LONG_ERROR_MESSAGE,
  )
})
