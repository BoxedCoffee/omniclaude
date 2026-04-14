import { describe, expect, test } from 'bun:test'

import { extractBulletsFromSection } from './plans/planLint.js'

function dedupeExpandedSteps(
  existingSteps: Array<{ id: string; taskId?: string }>,
  bullets: string[],
): Array<{ id: string; taskId?: string }> {
  const existingById = new Map(existingSteps.map(s => [s.id, s] as const))
  return bullets.map((_, idx) => {
    const id = `exec-${idx + 1}`
    return existingById.get(id) ?? { id }
  })
}

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

  test('exec-step expansion preserves existing taskIds', () => {
    const existing = [
      { id: 'double-check', taskId: '1' },
      { id: 'exec-1', taskId: '10' },
      { id: 'exec-2', taskId: '11' },
    ]
    const bullets = ['a', 'b', 'c']
    const expanded = dedupeExpandedSteps(existing, bullets)
    expect(expanded[0]?.taskId).toBe('10')
    expect(expanded[1]?.taskId).toBe('11')
    expect(expanded[2]?.taskId).toBe(undefined)
  })
})
