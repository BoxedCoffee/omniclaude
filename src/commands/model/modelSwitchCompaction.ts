import { calculateTokenWarningState } from '../../services/compact/autoCompact.js'
import { tokenCountWithEstimation } from '../../utils/tokens.js'
import {
  getDefaultMainLoopModel,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'

/**
 * Decide whether to enqueue /compact before the next prompt after switching
 * models. This prevents immediate context-window failures on smaller models.
 */
export function shouldQueueCompactAfterModelSwitch(
  messages: Parameters<typeof tokenCountWithEstimation>[0],
  modelValue: string | null,
): boolean {
  const targetModel = parseUserSpecifiedModel(
    modelValue ?? getDefaultMainLoopModel(),
  )
  const tokenUsage = tokenCountWithEstimation(messages)
  const { isAtBlockingLimit } = calculateTokenWarningState(
    tokenUsage,
    targetModel,
  )
  return isAtBlockingLimit
}
