import { expect, test } from 'bun:test'

import { mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'

import { call } from './profile.ts'

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, { encoding: 'utf8' })
  } catch {
    return null
  }
}

test('/profile set creates profile + global include idempotently', async () => {
  const tmpBase = join(process.cwd(), '.tmp-test-profile')
  await rm(tmpBase, { recursive: true, force: true })
  await mkdir(tmpBase, { recursive: true })

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpBase

  try {
    const r1 = await call('set Always summarize problems.', null as any)
    expect(r1.type).toBe('text')

    const profilePath = join(tmpBase, 'PROFILE.md')
    const globalPath = join(tmpBase, 'CLAUDE.md')

    const profile1 = await readOrNull(profilePath)
    const global1 = await readOrNull(globalPath)

    expect(profile1).not.toBeNull()
    expect(profile1!).toContain('Always summarize problems.')

    expect(global1).not.toBeNull()
    expect(global1!).toContain(`@${profilePath}`)

    const r2 = await call('set Always summarize problems.', null as any)
    expect(r2.type).toBe('text')

    const global2 = await readOrNull(globalPath)
    const occurrences = (global2!.match(new RegExp(`@${profilePath.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'g')) ?? []).length
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
    await call('set First', null as any)
    await call('append Second', null as any)

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
