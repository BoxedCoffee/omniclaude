import { describe, expect, test } from 'bun:test'

import { buildContextPack, renderContextPackMarkdown } from './contextPack.js'

describe('context pack', () => {
  test('builds and renders', () => {
    const pack = buildContextPack()
    expect(pack.projectRoot.length).toBeGreaterThan(0)

    const md = renderContextPackMarkdown(pack)
    expect(md).toContain('# Plan Context Pack')
    expect(md).toContain('## Detected')
    expect(md).toContain('## Key files')
  })
})
