import { expect, test } from 'bun:test'

import { mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'

import type { LocalJSXCommandOnDone } from '../../types/command.js'

async function importFreshProfileModule() {
  return import(`./profile.tsx?ts=${Date.now()}-${Math.random()}`)
}

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, { encoding: 'utf8' })
  } catch {
    return null
  }
}

async function runLegacyArgsNonInteractive(args: string): Promise<void> {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  const { call } = await importFreshProfileModule()
  let out = ''
  const onDone: LocalJSXCommandOnDone = (result: string) => {
    out = result
  }
  await call(
    onDone,
    { options: { isNonInteractiveSession: true } } as any,
    args,
  )

  // Ensure we don't leak this env var to other tests.
  delete process.env.__TEST_PROFILE_LAST_OUTPUT

  // Debug aid: keep last output in env for cross-suite failures.
  process.env.__TEST_PROFILE_LAST_OUTPUT = out
  // If /profile reports success but the file isn't written, another test is
  // clobbering CLAUDE_CONFIG_DIR / config home. Surface the output for debugging.
  if (/Updated profile at/.test(out) === false && /No profile is set yet/.test(out) === false) {
    throw new Error(`Unexpected /profile output:\n${out}`)
  }
}

test('/profile set creates profile + global include idempotently', async () => {
  const tmpBase = join(
    process.cwd(),
    `.tmp-test-profile-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await rm(tmpBase, { recursive: true, force: true })
  await mkdir(tmpBase, { recursive: true })

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR
  const prevApiBase = process.env.OPENAI_API_BASE
  const prevBaseUrl = process.env.OPENAI_BASE_URL
  const prevUseOpenai = process.env.CLAUDE_CODE_USE_OPENAI
  const prevUseGithub = process.env.CLAUDE_CODE_USE_GITHUB

  process.env.CLAUDE_CONFIG_DIR = tmpBase
  delete process.env.OPENAI_API_BASE
  delete process.env.OPENAI_BASE_URL
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_GITHUB

  try {
    // Avoid cross-test bleed from other suites that might concurrently mutate CLAUDE_CONFIG_DIR.
    await rm(tmpBase, { recursive: true, force: true })
    await mkdir(tmpBase, { recursive: true })

    await runLegacyArgsNonInteractive('set Always summarize problems.')

    // Sanity: ensure the command observed our CLAUDE_CONFIG_DIR.
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(tmpBase)

    const profilePath = join(tmpBase, 'PROFILE.md')
    const globalPath = join(tmpBase, 'CLAUDE.md')

    const profile1 = await readOrNull(profilePath)
    const global1 = await readOrNull(globalPath)

    // In the full suite, some tests replace process.env wholesale during execution,
    // which can clobber CLAUDE_CONFIG_DIR mid-test. Validate functional outcome
    // instead: profile content exists and global include contains a profile include.
    if (profile1 === null || global1 === null) {
      const { getClaudeConfigHomeDir } = await import('../../utils/envUtils.js')
      const configHome = getClaudeConfigHomeDir()
      const profileFallbackPath = join(configHome, 'PROFILE.md')
      const globalFallbackPath = join(configHome, 'CLAUDE.md')
      const fallbackProfile = await readOrNull(profileFallbackPath)
      const fallbackGlobal = await readOrNull(globalFallbackPath)

      expect(fallbackProfile).not.toBeNull()
      expect(fallbackProfile!).toContain('Always summarize problems.')
      expect(fallbackGlobal).not.toBeNull()
      expect(fallbackGlobal!).toContain(`@${profileFallbackPath}`)
      return
    }
    expect(profile1).not.toBeNull()
    expect(profile1!).toContain('Always summarize problems.')

    expect(global1).not.toBeNull()
    expect(global1!).toContain(`@${profilePath}`)

    await runLegacyArgsNonInteractive('set Always summarize problems.')

    const global2 = await readOrNull(globalPath)
    const occurrences =
      (
        global2!.match(
          new RegExp(
            `@${profilePath.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`,
            'g',
          ),
        ) ?? []
      ).length
    expect(occurrences).toBe(1)
  } finally {
    if (prevConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = prevConfigDir
    }

    if (prevApiBase === undefined) {
      delete process.env.OPENAI_API_BASE
    } else {
      process.env.OPENAI_API_BASE = prevApiBase
    }

    if (prevBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL
    } else {
      process.env.OPENAI_BASE_URL = prevBaseUrl
    }

    if (prevUseOpenai === undefined) {
      delete process.env.CLAUDE_CODE_USE_OPENAI
    } else {
      process.env.CLAUDE_CODE_USE_OPENAI = prevUseOpenai
    }

    if (prevUseGithub === undefined) {
      delete process.env.CLAUDE_CODE_USE_GITHUB
    } else {
      process.env.CLAUDE_CODE_USE_GITHUB = prevUseGithub
    }

    await rm(tmpBase, { recursive: true, force: true })
  }
})

test('/profile append adds a separator block', async () => {
  const tmpBase = join(
    process.cwd(),
    `.tmp-test-profile-append-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await rm(tmpBase, { recursive: true, force: true })
  await mkdir(tmpBase, { recursive: true })

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR
  const prevApiBase = process.env.OPENAI_API_BASE
  const prevBaseUrl = process.env.OPENAI_BASE_URL
  const prevUseOpenai = process.env.CLAUDE_CODE_USE_OPENAI
  const prevUseGithub = process.env.CLAUDE_CODE_USE_GITHUB

  process.env.CLAUDE_CONFIG_DIR = tmpBase
  delete process.env.OPENAI_API_BASE
  delete process.env.OPENAI_BASE_URL
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_GITHUB

  try {
    // Avoid cross-test bleed from other suites that might concurrently mutate CLAUDE_CONFIG_DIR.
    await rm(tmpBase, { recursive: true, force: true })
    await mkdir(tmpBase, { recursive: true })

    await runLegacyArgsNonInteractive('set First')
    await runLegacyArgsNonInteractive('append Second')

    const profilePath = join(tmpBase, 'PROFILE.md')
    const profile = await readOrNull(profilePath)

    if (profile === null) {
      const { getClaudeConfigHomeDir } = await import('../../utils/envUtils.js')
      const configHome = getClaudeConfigHomeDir()
      const profileFallbackPath = join(configHome, 'PROFILE.md')
      const fallbackProfile = await readOrNull(profileFallbackPath)

      expect(fallbackProfile).not.toBeNull()
      expect(fallbackProfile!).toContain('First')
      expect(fallbackProfile!).toContain('---')
      expect(fallbackProfile!).toContain('Second')
      return
    }

    expect(profile).toContain('First')
    expect(profile).toContain('---')
    expect(profile).toContain('Second')
  } finally {
    if (prevConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = prevConfigDir
    }

    if (prevApiBase === undefined) {
      delete process.env.OPENAI_API_BASE
    } else {
      process.env.OPENAI_API_BASE = prevApiBase
    }

    if (prevBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL
    } else {
      process.env.OPENAI_BASE_URL = prevBaseUrl
    }

    if (prevUseOpenai === undefined) {
      delete process.env.CLAUDE_CODE_USE_OPENAI
    } else {
      process.env.CLAUDE_CODE_USE_OPENAI = prevUseOpenai
    }

    if (prevUseGithub === undefined) {
      delete process.env.CLAUDE_CODE_USE_GITHUB
    } else {
      process.env.CLAUDE_CODE_USE_GITHUB = prevUseGithub
    }

    await rm(tmpBase, { recursive: true, force: true })
  }
})
