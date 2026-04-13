import { registerHookCallbacks } from '../bootstrap/state.js'
import type { HookCallback, HookCallbackMatcher } from '../types/hooks.js'
import type { HookInput } from '../entrypoints/agentSdkTypes.js'
import { readPlanSidecar, writePlanSidecar } from './plans.js'
import { createTask, getTask, getTaskListId } from './tasks.js'
import { logError } from './log.js'

/**
 * Internal-only: sync TaskCompleted events into the plan runbook sidecar.
 */
export function registerRunbookTaskHooks(): void {
  const hook: HookCallback = {
    type: 'callback',
    internal: true,
    timeout: 1,
    callback: async (input: HookInput) => {
      if (input.hook_event_name !== 'TaskCompleted') return {}

      const taskId = (input as any).task_id
      if (typeof taskId !== 'string' || taskId.length === 0) return {}

      try {
        const task = await getTask(getTaskListId(), taskId)
        const meta = task?.metadata as Record<string, unknown> | undefined
        const planSlug = meta?.planSlug
        const runbookStepId = meta?.runbookStepId
        if (typeof planSlug !== 'string' || typeof runbookStepId !== 'string') {
          return {}
        }

        // Only sync for the current plan slug
        const sidecar = readPlanSidecar()
        if (!sidecar || sidecar.slug !== planSlug) return {}

        const rb = sidecar.runbook
        if (!rb) return {}

        const now = new Date().toISOString()

        const nextSteps = rb.steps.map(s =>
          s.id === runbookStepId ? { ...s, status: 'completed', completedAt: now } : s,
        )

        // If preflight completed, kick off execute step (idempotent)
        if (runbookStepId === 'double-check') {
          const execute = nextSteps.find(s => s.id === 'execute')
          if (execute && !execute.taskId) {
            const newTaskId = await createTask(getTaskListId(), {
              subject: `Execute: ${execute.title}`,
              description: execute.instructions,
              activeForm: 'Executing plan',
              status: 'pending',
              owner: undefined,
              blocks: [],
              blockedBy: [],
              metadata: {
                planSlug,
                runbookStepId: execute.id,
              },
            })
            for (let i = 0; i < nextSteps.length; i++) {
              if (nextSteps[i]?.id === 'execute') {
                nextSteps[i] = {
                  ...nextSteps[i]!,
                  taskId: newTaskId,
                  status: 'in_progress',
                  startedAt: now,
                }
              }
            }
          }
        }

        await writePlanSidecar({
          ...sidecar,
          files: sidecar.files,
          runbook: {
            ...rb,
            state: 'executing',
            steps: nextSteps,
            lastCheckpointAt: now,
          },
          timestamps: {},
        })
      } catch (e) {
        logError(e)
      }

      return {}
    },
  }

  const matcher: HookCallbackMatcher = {
    matcher: '*',
    hooks: [hook],
  }

  registerHookCallbacks({
    TaskCompleted: [matcher],
  })
}
