import { expect, test } from 'bun:test'

import { rmSync } from 'fs'
import { join } from 'path'

import { getPlansDirectory } from './plans.js'

test('getPlansDirectory defaults to .openclaude/plans under project root', () => {
  const prev = process.env.CLAUDE_CONFIG_DIR
  delete process.env.CLAUDE_CONFIG_DIR

  const p = getPlansDirectory()
  expect(p.replace(/\\/g, '/')).toContain('/.openclaude/plans')

  // Cleanup created directory if any
  try {
    rmSync(join(process.cwd(), '.openclaude'), { recursive: true, force: true })
  } catch {}

  if (prev !== undefined) process.env.CLAUDE_CONFIG_DIR = prev
})
