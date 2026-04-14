import { afterEach, expect, mock, test } from 'bun:test'

afterEach(() => {
  mock.restore()
})

test('treats OpenAI-compatible output-limit probe errors as valid model checks', async () => {
  const sideQuery = mock(async () => {
    throw new Error(
      'litellm.BadRequestError: Could not finish the message because max_tokens or model output limit was reached. Please try again with higher max_tokens.',
    )
  })

  mock.module('./providers.js', () => ({
    getAPIProvider: () => 'openai',
  }))
  mock.module('./modelAllowlist.js', () => ({
    isModelAllowed: () => true,
  }))
  mock.module('./aliases.js', () => ({
    MODEL_ALIASES: [],
  }))
  mock.module('./modelStrings.js', () => ({
    getModelStrings: () => ({ opus41: 'claude-opus-4-1', sonnet45: 'claude-sonnet-4-5', sonnet40: 'claude-sonnet-4' }),
  }))
  mock.module('./ollamaModels.js', () => ({
    isOllamaProvider: () => false,
    getCachedOllamaModelOptions: () => [],
  }))
  mock.module('./openaiModelDiscovery.js', () => ({
    discoverOpenAICompatibleModelOptions: async () => [],
  }))
  mock.module('../sideQuery.js', () => ({
    sideQuery,
  }))

  const { validateModel } = await import(
    `./validateModel.js?ts=${Date.now()}-${Math.random()}`
  )
  const result = await validateModel('gpt-5.2')

  expect(result).toEqual({ valid: true })
  expect(sideQuery).toHaveBeenCalledTimes(1)
  expect(sideQuery.mock.calls[0]?.[0]?.max_tokens).toBe(32)
})

test('accepts models discovered from OpenAI-compatible /models endpoint', async () => {
  const sideQuery = mock(async () => ({}))

  mock.module('./providers.js', () => ({
    getAPIProvider: () => 'openai',
  }))
  mock.module('./modelAllowlist.js', () => ({
    isModelAllowed: () => true,
  }))
  mock.module('./aliases.js', () => ({
    MODEL_ALIASES: [],
  }))
  mock.module('./modelStrings.js', () => ({
    getModelStrings: () => ({ opus41: 'claude-opus-4-1', sonnet45: 'claude-sonnet-4-5', sonnet40: 'claude-sonnet-4' }),
  }))
  mock.module('./ollamaModels.js', () => ({
    isOllamaProvider: () => false,
    getCachedOllamaModelOptions: () => [],
  }))
  mock.module('./openaiModelDiscovery.js', () => ({
    discoverOpenAICompatibleModelOptions: async () => [
      {
        value: 'gpt-5.2',
        label: 'gpt-5.2',
        description: 'Discovered from endpoint',
      },
    ],
  }))
  mock.module('../sideQuery.js', () => ({
    sideQuery,
  }))

  const { validateModel } = await import(
    `./validateModel.js?ts=${Date.now()}-${Math.random()}`
  )
  const result = await validateModel('GPT-5.2')

  expect(result).toEqual({ valid: true })
  expect(sideQuery).toHaveBeenCalledTimes(0)
})
