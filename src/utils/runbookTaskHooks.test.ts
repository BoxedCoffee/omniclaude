import { describe, expect, test } from 'bun:test'

import { extractBulletsFromSection } from './plans/planLint.js'

describe('runbook flow helpers', () => {
  test('extractBulletsFromSection returns bullets from Steps', () => {
    const plan = `## Summary\n\n- x\n\n## Steps\n\n- first\n- second\n\n## Test plan\n\n- bun test\n`
    expect(extractBulletsFromSection(plan, ['Steps', 'Implementation'])).toEqual([
      'first',
      'second',
    ])
  })

  test('extractBulletsFromSection returns [] when section missing', () => {
    const plan = `## Summary\n\n- x\n\n## Test plan\n\n- bun test\n`
    expect(extractBulletsFromSection(plan, ['Steps'])).toEqual([])
  })
})
