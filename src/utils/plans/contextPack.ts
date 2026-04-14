import { readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

import { getFsImplementation } from '../fsOperations.js'
import { getCwd } from '../cwd.js'
import { findCanonicalGitRoot } from '../git.js'

export type ContextPack = {
  projectRoot: string
  gitRoot?: string
  repoName?: string
  detected: {
    packageManager?: 'bun' | 'npm' | 'pnpm' | 'yarn'
    hasBunLock: boolean
    hasPackageJson: boolean
    hasPyproject: boolean
  }
  suggestedCommands: {
    test?: string
    lint?: string
    typecheck?: string
  }
  highlights: {
    keyFiles: string[]
    notes: string[]
  }
}

function exists(path: string): boolean {
  try {
    return getFsImplementation().existsSync(path)
  } catch {
    return false
  }
}

function safeReadText(path: string, maxBytes: number): string | null {
  try {
    const buf = readFileSync(path)
    return buf.slice(0, maxBytes).toString('utf8')
  } catch {
    return null
  }
}

function detectPackageManager(cwd: string): ContextPack['detected']['packageManager'] {
  if (exists(join(cwd, 'bun.lockb')) || exists(join(cwd, 'bun.lock'))) return 'bun'
  if (exists(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (exists(join(cwd, 'yarn.lock'))) return 'yarn'
  if (exists(join(cwd, 'package-lock.json'))) return 'npm'
  return undefined
}

function guessTestCommand(pm: ContextPack['detected']['packageManager']): string | undefined {
  switch (pm) {
    case 'bun':
      return 'bun test'
    case 'pnpm':
      return 'pnpm test'
    case 'yarn':
      return 'yarn test'
    case 'npm':
      return 'npm test'
    default:
      return undefined
  }
}

export function buildContextPack(): ContextPack {
  const projectRoot = getCwd()
  const gitRoot = findCanonicalGitRoot(projectRoot) ?? undefined
  const repoName = gitRoot ? basename(gitRoot) : undefined

  const hasPackageJson = exists(join(projectRoot, 'package.json'))
  const hasPyproject = exists(join(projectRoot, 'pyproject.toml'))
  const hasBunLock = exists(join(projectRoot, 'bun.lockb')) || exists(join(projectRoot, 'bun.lock'))

  const pm = detectPackageManager(projectRoot)

  const keyFilesAbs: string[] = []
  for (const p of [
    'README.md',
    'PLAYBOOK.md',
    'package.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
    'package-lock.json',
    'tsconfig.json',
    '.openclaude/settings.json',
    '.openclaude/settings.local.json',
    'CLAUDE.md',
  ]) {
    const abs = join(projectRoot, p)
    if (exists(abs)) keyFilesAbs.push(abs)
  }

  const keyFiles = keyFilesAbs.map(p => relative(projectRoot, p).replace(/\\/g, '/'))

  const notes: string[] = []
  if (hasPackageJson) {
    const pkg = safeReadText(join(projectRoot, 'package.json'), 64_000)
    if (pkg && pkg.includes('"bun"')) {
      notes.push('package.json mentions bun')
    }
  }

  return {
    projectRoot,
    gitRoot,
    repoName,
    detected: {
      packageManager: pm,
      hasBunLock,
      hasPackageJson,
      hasPyproject,
    },
    suggestedCommands: {
      test: guessTestCommand(pm),
    },
    highlights: {
      keyFiles,
      notes,
    },
  }
}

export function renderContextPackMarkdown(pack: ContextPack): string {
  const lines: string[] = []
  lines.push('# Plan Context Pack')
  lines.push('')
  lines.push(`Project root: ${pack.projectRoot}`)
  if (pack.gitRoot) lines.push(`Git root: ${pack.gitRoot}`)
  if (pack.repoName) lines.push(`Repo: ${pack.repoName}`)
  lines.push('')

  lines.push('## Detected')
  lines.push(`- Package manager: ${pack.detected.packageManager ?? 'unknown'}`)
  lines.push(`- Has package.json: ${pack.detected.hasPackageJson}`)
  lines.push(`- Has bun lock: ${pack.detected.hasBunLock}`)
  lines.push(`- Has pyproject.toml: ${pack.detected.hasPyproject}`)
  lines.push('')

  lines.push('## Suggested commands')
  if (pack.suggestedCommands.test) lines.push(`- Test: ${pack.suggestedCommands.test}`)
  if (pack.suggestedCommands.lint) lines.push(`- Lint: ${pack.suggestedCommands.lint}`)
  if (pack.suggestedCommands.typecheck) lines.push(`- Typecheck: ${pack.suggestedCommands.typecheck}`)
  if (!pack.suggestedCommands.test && !pack.suggestedCommands.lint && !pack.suggestedCommands.typecheck) {
    lines.push('- (none)')
  }
  lines.push('')

  lines.push('## Key files')
  if (pack.highlights.keyFiles.length === 0) {
    lines.push('- (none detected)')
  } else {
    for (const f of pack.highlights.keyFiles) lines.push(`- ${f}`)
  }
  lines.push('')

  if (pack.highlights.notes.length > 0) {
    lines.push('## Notes')
    for (const n of pack.highlights.notes) lines.push(`- ${n}`)
    lines.push('')
  }

  return lines.join('\n')
}
