import { test, expect } from 'bun:test'
import { buildPlanApprovalOptions } from './ExitPlanModePermissionRequest.js'

test('bypass keep-context option uses dedicated bypass value', () => {
  const options = buildPlanApprovalOptions({
    showClearContext: false,
    showUltraplan: false,
    usedPercent: null,
    isAutoModeAvailable: false,
    isBypassPermissionsModeAvailable: true,
    onFeedbackChange: () => {},
  })

  expect(options[0]?.value).toBe('yes-bypass-permissions-keep-context')
  expect(options[1]?.value).toBe('yes-default-keep-context')
})

test('non-bypass keep-context option uses accept-edits value', () => {
  const options = buildPlanApprovalOptions({
    showClearContext: false,
    showUltraplan: false,
    usedPercent: null,
    isAutoModeAvailable: false,
    isBypassPermissionsModeAvailable: false,
    onFeedbackChange: () => {},
  })

  expect(options[0]?.value).toBe('yes-accept-edits-keep-context')
  expect(options[1]?.value).toBe('yes-default-keep-context')
})

test('clear-context bypass option keeps existing clear-context value', () => {
  const options = buildPlanApprovalOptions({
    showClearContext: true,
    showUltraplan: false,
    usedPercent: 42,
    isAutoModeAvailable: false,
    isBypassPermissionsModeAvailable: true,
    onFeedbackChange: () => {},
  })

  expect(options[0]?.value).toBe('yes-bypass-permissions')
})
