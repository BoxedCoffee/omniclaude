import { registerHookCallbacks } from '../bootstrap/state.js'
import type { HookCallback, HookCallbackMatcher } from '../types/hooks.js'
import type { HookInput } from '../entrypoints/agentSdkTypes.js'
import { readPlanSidecar, writePlanSidecar } from './plans.js'
import { extractBulletsFromSection } from './plans/planLint.js'
import { getPlan } from './plans.js'
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

        let nextSteps = rb.steps.map(s =>
          s.id === runbookStepId ? { ...s, status: 'completed', completedAt: now } : s,
        )

        // If preflight completed, expand execute into multiple step tasks (idempotent)
        if (runbookStepId === 'double-check') {
          const plan = getPlan()
          const bullets = plan
            ? extractBulletsFromSection(plan, ['Steps', 'Implementation'])
            : []

          // If we have actionable bullets, replace the single execute step with per-bullet steps.
          if (bullets.length > 0) {
            // Remove the old execute step and insert expanded steps.
            const base = nextSteps.filter(s => s.id !== 'execute')
            const expanded = bullets.map((b, idx) => ({
              id: `exec-${idx + 1}`,
              title: b,
              instructions: b,
              status: 'pending' as const,
            }))

            // Idempotent: preserve existing exec-* steps (with taskIds) if already created.
            const existingById = new Map(nextSteps.map(s => [s.id, s] as const))

            for (let i = 0; i < expanded.length; i++) {
              const step = expanded[i]!
              const existing = existingById.get(step.id)
              if (existing?.taskId) {
                expanded[i] = existing
                continue
              }

              const blocker = i > 0 ? expanded[i - 1]?.taskId : undefined
              const taskId = await createTask(getTaskListId(), {
                subject: `Step ${i + 1}: ${step.title}`,
                description: step.instructions,
                activeForm: 'Executing plan step',
                status: 'pending',
                owner: undefined,
                blocks: [],
                blockedBy: blocker ? [blocker] : [],
                metadata: {
                  planSlug,
                  runbookStepId: step.id,
                },
              })
              expanded[i] = {
                ...step,
                taskId,
                status: 'in_progress',
                startedAt: now,
              }
            }

            nextSteps = [...base, ...expanded]
          } else {
            // Fallback: keep single execute step
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
        }

        const allDone = nextSteps.length > 0 && nextSteps.every(s => s.status === 'completed')

        await writePlanSidecar({
          ...sidecar,
          files: sidecar.files,
          runbook: {
            ...rb,
            state: allDone ? 'done' : 'executing',
            startedAt: rb.startedAt,
            completedAt: allDone ? (rb.completedAt ?? now) : rb.completedAt,
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
