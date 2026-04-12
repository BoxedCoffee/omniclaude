import { expect, test } from 'bun:test'

import { mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'

import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { call } from './profile.tsx'

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, { encoding: 'utf8' })
  } catch {
    return null
  }
}

async function runLegacyArgsNonInteractive(args: string): Promise<void> {
  // In non-interactive sessions, local-jsx commands return no messages.
  // For unit tests, we still want to validate the filesystem side effects
  // of our profile writer; invoke the command module and call onDone.
  const onDone: LocalJSXCommandOnDone = () => {}
  await call(onDone, { options: { isNonInteractiveSession: true } } as any, args)
}

test('/profile set creates profile + global include idempotently', async () => {
  const tmpBase = join(process.cwd(), '.tmp-test-profile')
  await rm(tmpBase, { recursive: true, force: true })
  await mkdir(tmpBase, { recursive: true })

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpBase

  try {
    await runLegacyArgsNonInteractive('set Always summarize problems.')

    const profilePath = join(tmpBase, 'PROFILE.md')
    const globalPath = join(tmpBase, 'CLAUDE.md')

    const profile1 = await readOrNull(profilePath)
    const global1 = await readOrNull(globalPath)

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
    await rm(tmpBase, { recursive: true, force: true })
  }
})

test('/profile append adds a separator block', async () => {
  const tmpBase = join(process.cwd(), '.tmp-test-profile-append')
  await rm(tmpBase, { recursive: true, force: true })
  await mkdir(tmpBase, { recursive: true })

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpBase

  try {
    await runLegacyArgsNonInteractive('set First')
    await runLegacyArgsNonInteractive('append Second')

    const profilePath = join(tmpBase, 'PROFILE.md')
    const profile = await readFile(profilePath, { encoding: 'utf8' })
    expect(profile).toContain('First')
    expect(profile).toContain('---')
    expect(profile).toContain('Second')
  } finally {
    if (prevConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = prevConfigDir
    }
    await rm(tmpBase, { recursive: true, force: true })
  }
})
