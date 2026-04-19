import { resolve } from 'path'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { openFileInExternalEditor } from '../../utils/editor.js'

function parsePathAndLine(input: string): { path: string; line?: number } {
  const trimmed = input.trim()
  const m = trimmed.match(/^(.*?):(\d+)$/)
  if (!m) return { path: trimmed }
  const line = parseInt(m[2]!, 10)
  if (!Number.isFinite(line) || line <= 0) return { path: trimmed }
  return { path: m[1]!, line }
}

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> {
  const trimmed = args.trim()
  if (!trimmed) {
    return {
      type: 'text' as const,
      value: 'Usage: /open <path>[:line]',
    }
  }

  const { path, line } = parsePathAndLine(trimmed)
  const abs = resolve(getCwd(), path)
  await openFileInExternalEditor(abs, line)

  return { type: 'text' as const, value: `Opened: ${path}${line ? `:${line}` : ''}` }
}
