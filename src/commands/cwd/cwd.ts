import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { setCwd } from '../../utils/Shell.js'

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> {
  const trimmed = args.trim()

  if (!trimmed) {
    return { type: 'text' as const, value: getCwd() }
  }

  await setCwd(trimmed)
  return { type: 'text' as const, value: getCwd() }
}
