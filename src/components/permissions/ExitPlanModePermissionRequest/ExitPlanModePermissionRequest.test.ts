import { test, expect } from 'bun:test'
import {
  buildPlanApprovalOptions,
  isKeepContextApprovalValue,
} from './ExitPlanModePermissionRequest.js'

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

test('keep-context value classifier treats bypass keep-context as keep-context', () => {
  expect(isKeepContextApprovalValue('yes-bypass-permissions-keep-context')).toBe(
    true,
  )
  expect(isKeepContextApprovalValue('yes-accept-edits-keep-context')).toBe(true)
  expect(isKeepContextApprovalValue('yes-default-keep-context')).toBe(true)
  expect(isKeepContextApprovalValue('yes-resume-auto-mode')).toBe(true)
  expect(isKeepContextApprovalValue('yes-bypass-permissions')).toBe(false)
  expect(isKeepContextApprovalValue('yes-accept-edits')).toBe(false)
  expect(isKeepContextApprovalValue('yes-auto-clear-context')).toBe(false)
  expect(isKeepContextApprovalValue('no')).toBe(false)
})
