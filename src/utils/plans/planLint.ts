export type PlanLintErrorCode =
  | 'empty_plan'
  | 'missing_summary'
  | 'missing_test_plan'
  | 'missing_steps'
  | 'placeholder_tokens'

export type PlanLintError = {
  code: PlanLintErrorCode
  message: string
  hint?: string
}

export type PlanLintResult = {
  ok: boolean
  errors: PlanLintError[]
}

function hasHeading(plan: string, heading: string): boolean {
  const re = new RegExp(`^#{2,6}\\s+${heading}\\s*$`, 'im')
  return re.test(plan)
}

export function extractBulletsFromSection(
  plan: string,
  sectionNames: string[],
): string[] {
  // Find the first matching section and return bullet/numbered items until next heading.
  const headings = sectionNames
    .map(h => h.replace(/[.*+?^${}()|[\[\]\\]/g, '\\$&'))
    .join('|')
  const startRe = new RegExp(`^#{2,6}\\s+(${headings})\\s*$`, 'im')
  const startMatch = startRe.exec(plan)
  if (!startMatch || startMatch.index === undefined) return []

  const startIdx = startMatch.index
  const afterStart = plan.slice(startIdx)
  const nextHeadingMatch = /^#{2,6}\s+/m.exec(
    afterStart.slice(startMatch[0].length),
  )
  const body = nextHeadingMatch
    ? afterStart.slice(
        startMatch[0].length,
        startMatch[0].length + nextHeadingMatch.index,
      )
    : afterStart.slice(startMatch[0].length)

  const lines = body.split(/\r?\n/)
  const items: string[] = []
  for (const line of lines) {
    const m = /^\s*(?:[-*]|\d+\.)\s+(\S[\s\S]*)$/.exec(line)
    if (m?.[1]) items.push(m[1].trim())
  }
  return items
}

function countBulletsInSection(plan: string, sectionNames: string[]): number {
  return extractBulletsFromSection(plan, sectionNames).length
}

function containsPlaceholderTokens(plan: string): boolean {
  // Only check obvious placeholders.
  return /\b(TBD|TODO|\?\?\?)\b/i.test(plan)
}

export function lintPlan(plan: string | null | undefined): PlanLintResult {
  const text = (plan ?? '').trim()
  const errors: PlanLintError[] = []

  if (text.length < 40) {
    errors.push({
      code: 'empty_plan',
      message: 'Plan is empty or too short.',
      hint: 'Add a brief summary, steps, and a test plan before exiting plan mode.',
    })
  }

  if (!hasHeading(text, 'Summary')) {
    errors.push({
      code: 'missing_summary',
      message: 'Missing required section: ## Summary',
      hint: 'Explain what will change and why (1–3 bullets).',
    })
  }

  if (!hasHeading(text, 'Test plan') && !hasHeading(text, 'Test Plan')) {
    errors.push({
      code: 'missing_test_plan',
      message: 'Missing required section: ## Test plan',
      hint: 'List the exact commands / manual checks to verify the change.',
    })
  }

  const stepCount = countBulletsInSection(text, ['Steps', 'Implementation'])
  if (stepCount < 2) {
    errors.push({
      code: 'missing_steps',
      message: 'Missing actionable steps (need at least 2 bullet items under ## Steps or ## Implementation).',
      hint: 'Add a short, ordered checklist of what files/functions you will change.',
    })
  }

  if (containsPlaceholderTokens(text)) {
    errors.push({
      code: 'placeholder_tokens',
      message: 'Plan contains placeholder tokens (TBD/TODO/???).',
      hint: 'Replace placeholders with concrete decisions or steps.',
    })
  }

  return { ok: errors.length === 0, errors }
}
