import { describe, expect, test } from 'bun:test'

import { lintPlan } from './planLint.js'

describe('lintPlan', () => {
  test('fails empty plan', () => {
    const r = lintPlan('')
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.code === 'empty_plan')).toBe(true)
  })

  test('fails missing required headings', () => {
    const r = lintPlan('## Summary\n\nHello\n')
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.code === 'missing_test_plan')).toBe(true)
  })

  test('fails when no steps bullets', () => {
    const r = lintPlan(`## Summary\n\nOk.\n\n## Test plan\n\n- bun test\n\n## Steps\n\nNo bullets here`)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.code === 'missing_steps')).toBe(true)
  })

  test('passes a minimal valid plan', () => {
    const r = lintPlan(`## Summary\n\n- Do X\n\n## Steps\n\n- Change file A\n- Update file B\n\n## Test plan\n\n- bun test`)
    expect(r.ok).toBe(true)
    expect(r.errors.length).toBe(0)
  })
})
