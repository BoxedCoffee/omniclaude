import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getErrnoCode } from '../../utils/errors.js'
import { getMemoryPath } from '../../utils/config.js'

const PROFILE_FILE_BASENAME = 'PROFILE.md'

function parseArgs(raw: string): { action: string; text: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { action: 'show', text: '' }
  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace === -1) return { action: trimmed.toLowerCase(), text: '' }
  return {
    action: trimmed.slice(0, firstSpace).toLowerCase(),
    text: trimmed.slice(firstSpace + 1).trim(),
  }
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, { encoding: 'utf8' })
  } catch (e) {
    if (getErrnoCode(e) === 'ENOENT') return null
    throw e
  }
}

function buildProfileContents(text: string): string {
  const body = text.trim()
  return [
    '# OmniClaude Profile',
    '',
    'This file is injected into every OmniClaude session as global user instructions.',
    'Do not put secrets (API keys, tokens) here.',
    '',
    body,
    '',
  ].join('\n')
}

function appendBlock(existing: string, text: string): string {
  const trimmedExisting = existing.replace(/\s+$/g, '')
  const block = text.trim()
  const separator = '\n\n---\n\n'
  return `${trimmedExisting}${separator}${block}\n`
}

function ensureIncludeLine(existing: string, includeLine: string): string {
  if (existing.includes(includeLine)) return existing
  const suffix = existing.endsWith('\n') ? '' : '\n'
  return `${existing}${suffix}\n${includeLine}\n`
}

async function ensureGlobalUserClaudeMdIncludesProfile(args: {
  configHome: string
  userClaudeMdPath: string
  profilePath: string
}): Promise<{ created: boolean; updated: boolean }> {
  const includeLine = `@${args.profilePath}`

  await mkdir(args.configHome, { recursive: true })

  const existing = await readFileOrNull(args.userClaudeMdPath)
  if (existing === null) {
    const contents = [
      '# CLAUDE.md',
      '',
      'This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.',
      '',
      includeLine,
      '',
    ].join('\n')
    await writeFile(args.userClaudeMdPath, contents, { encoding: 'utf8' })
    return { created: true, updated: false }
  }

  const updated = ensureIncludeLine(existing, includeLine)
  if (updated === existing) return { created: false, updated: false }

  await writeFile(args.userClaudeMdPath, updated, { encoding: 'utf8' })
  return { created: false, updated: true }
}

function usage(): string {
  return [
    'Usage:',
    '  /profile set <text...>     Set (overwrite) your global behavior profile',
    '  /profile append <text...>  Append to your global behavior profile',
    '  /profile show              Show the current profile',
    '  /profile clear             Clear the profile (keeps files in place)',
    '',
    'Examples:',
    '  /profile set Always summarize problems and explain solutions.',
    '  /profile set Always show macros whenever I input a food.',
  ].join('\n')
}

export const call: LocalCommandCall = async (
  rawArgs: string,
): Promise<LocalCommandResult> => {
  const { action, text } = parseArgs(rawArgs)

  const configHome = getClaudeConfigHomeDir()
  const userClaudeMdPath = getMemoryPath('User')
  const profilePath = join(configHome, PROFILE_FILE_BASENAME)

  if (action === 'help' || action === '--help' || action === '-h') {
    return { type: 'text', value: usage() }
  }

  if (action === 'show' || action === '') {
    const existing = await readFileOrNull(profilePath)
    return {
      type: 'text',
      value:
        existing === null
          ? `No profile is set yet.\n\n${usage()}`
          : existing.trimEnd(),
    }
  }

  if (action === 'clear') {
    await mkdir(configHome, { recursive: true })
    await writeFile(profilePath, buildProfileContents(''), { encoding: 'utf8' })
    await ensureGlobalUserClaudeMdIncludesProfile({
      configHome,
      userClaudeMdPath,
      profilePath,
    })
    return {
      type: 'text',
      value: `Cleared profile at ${profilePath}.`,
    }
  }

  if (action !== 'set' && action !== 'append') {
    return { type: 'text', value: `Unknown action: ${action}\n\n${usage()}` }
  }

  if (!text) {
    return { type: 'text', value: usage() }
  }

  await mkdir(configHome, { recursive: true })

  if (action === 'set') {
    await writeFile(profilePath, buildProfileContents(text), { encoding: 'utf8' })
  } else {
    const existing = (await readFileOrNull(profilePath)) ?? buildProfileContents('')
    await writeFile(profilePath, appendBlock(existing, text), { encoding: 'utf8' })
  }

  const includeResult = await ensureGlobalUserClaudeMdIncludesProfile({
    configHome,
    userClaudeMdPath,
    profilePath,
  })

  const includeSummary = includeResult.created
    ? `Created global instructions file at ${userClaudeMdPath}.`
    : includeResult.updated
      ? `Updated global instructions file at ${userClaudeMdPath}.`
      : `Global instructions file already includes this profile.`

  return {
    type: 'text',
    value: [
      `Updated profile at ${profilePath}.`,
      includeSummary,
      '',
      'Note: this profile is injected into every session. Avoid secrets.',
    ].join('\n'),
  }
}
