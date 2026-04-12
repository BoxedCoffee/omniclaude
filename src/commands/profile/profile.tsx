import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

import React from 'react'

import type {
  LocalJSXCommandCall,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Select, type OptionWithDescription } from '../../components/CustomSelect/index.js'
import TextInput from '../../components/TextInput.js'
import { Box, Text } from '../../ink.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getErrnoCode } from '../../utils/errors.js'
import { getMemoryPath } from '../../utils/config.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'

const PROFILE_FILE_BASENAME = 'PROFILE.md'

type Action = 'show' | 'set' | 'append' | 'clear'

type Step =
  | { name: 'choose' }
  | { name: 'show' }
  | { name: 'set' }
  | { name: 'append' }
  | { name: 'confirm-clear' }

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

function ProfileTextEntryDialog({
  title,
  subtitle,
  initialValue,
  placeholder,
  onSubmit,
  onCancel,
}: {
  title: string
  subtitle: string
  initialValue: string
  placeholder: string
  onSubmit: (value: string) => void
  onCancel: () => void
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const [value, setValue] = React.useState(initialValue)
  const [cursorOffset, setCursorOffset] = React.useState(initialValue.length)
  const [error, setError] = React.useState<string | null>(null)

  const inputColumns = Math.max(30, columns - 6)

  const handleSubmit = React.useCallback(
    (nextValue: string) => {
      if (nextValue.trim().length === 0) {
        setError('A value is required for this step.')
        return
      }
      setError(null)
      onSubmit(nextValue)
    },
    [onSubmit],
  )

  return (
    <Dialog title={title} subtitle={subtitle} onCancel={onCancel}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{'This will be injected into every session.'}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={placeholder}
          columns={inputColumns}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
          focus
          showCursor
        />
        {error ? <Text color="error">{error}</Text> : null}
        <Text dimColor>{'Tip: don\'t include secrets (API keys, tokens).'}</Text>
      </Box>
    </Dialog>
  )
}

async function runAction(args: {
  action: Action
  text?: string
}): Promise<string> {
  const configHome = getClaudeConfigHomeDir()
  const userClaudeMdPath = getMemoryPath('User')
  const profilePath = join(configHome, PROFILE_FILE_BASENAME)

  if (args.action === 'show') {
    const existing = await readFileOrNull(profilePath)
    return existing === null
      ? `No profile is set yet.\n\nUse /profile to set one.`
      : existing.trimEnd()
  }

  await mkdir(configHome, { recursive: true })

  if (args.action === 'clear') {
    await writeFile(profilePath, buildProfileContents(''), { encoding: 'utf8' })
    await ensureGlobalUserClaudeMdIncludesProfile({
      configHome,
      userClaudeMdPath,
      profilePath,
    })
    return `Cleared profile at ${profilePath}.`
  }

  if (args.action === 'set') {
    await writeFile(profilePath, buildProfileContents(args.text ?? ''), {
      encoding: 'utf8',
    })
  } else {
    const existing = (await readFileOrNull(profilePath)) ?? buildProfileContents('')
    await writeFile(profilePath, appendBlock(existing, args.text ?? ''), {
      encoding: 'utf8',
    })
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

  return [
    `Updated profile at ${profilePath}.`,
    includeSummary,
    '',
    'Note: this profile is injected into every session. Avoid secrets.',
  ].join('\n')
}

function ProfileWizard({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const [step, setStep] = React.useState<Step>({ name: 'choose' })

  const options: OptionWithDescription<Action>[] = [
    { label: 'Show', value: 'show', description: 'View the current profile' },
    {
      label: 'Set',
      value: 'set',
      description: 'Overwrite the profile with new instructions',
    },
    {
      label: 'Append',
      value: 'append',
      description: 'Add more instructions to the end of the profile',
    },
    {
      label: 'Clear',
      value: 'clear',
      description: 'Clear the profile (keeps files in place)',
    },
  ]

  const handleAction = React.useCallback(
    async (action: Action) => {
      switch (action) {
        case 'show':
          setStep({ name: 'show' })
          break
        case 'set':
          setStep({ name: 'set' })
          break
        case 'append':
          setStep({ name: 'append' })
          break
        case 'clear':
          setStep({ name: 'confirm-clear' })
          break
      }
    },
    [],
  )

  if (step.name === 'choose') {
    return (
      <Dialog title="Profile" onCancel={() => onDone('Cancelled', { display: 'system' })}>
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            {'A global behavior profile injected into every OmniClaude session.'}
          </Text>
          <Select
            options={options}
            onChange={(value: Action) => {
              void handleAction(value)
            }}
            onCancel={() => onDone('Cancelled', { display: 'system' })}
          />
        </Box>
      </Dialog>
    )
  }

  if (step.name === 'show') {
    void runAction({ action: 'show' }).then(text => {
      onDone(text, { display: 'system' })
    })
    return null
  }

  if (step.name === 'confirm-clear') {
    return (
      <Dialog title="Profile" subtitle="Clear profile?" onCancel={() => setStep({ name: 'choose' })}>
        <Box flexDirection="column" gap={1}>
          <Text>
            {'This will clear your global profile content. (Your files remain.)'}
          </Text>
          <Select
            options={[
              { label: 'Yes, clear', value: 'yes' as const },
              { label: 'No, go back', value: 'no' as const },
            ]}
            onChange={(value: 'yes' | 'no') => {
              if (value === 'no') {
                setStep({ name: 'choose' })
                return
              }
              void runAction({ action: 'clear' }).then(text => {
                onDone(text, { display: 'system' })
              })
            }}
            onCancel={() => setStep({ name: 'choose' })}
          />
        </Box>
      </Dialog>
    )
  }

  const isSet = step.name === 'set'
  return (
    <ProfileTextEntryDialog
      title="Profile"
      subtitle={isSet ? 'Set profile' : 'Append to profile'}
      initialValue=""
      placeholder={isSet ? 'Enter new global instructions' : 'Enter instructions to append'}
      onSubmit={(value: string) => {
        void runAction({ action: isSet ? 'set' : 'append', text: value }).then(text => {
          onDone(text, { display: 'system' })
        })
      }}
      onCancel={() => setStep({ name: 'choose' })}
    />
  )
}

export const call: LocalJSXCommandCall = async (
  onDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> => {
  if (context.options.isNonInteractiveSession) {
    // Allow headless usage: /profile set|append|show|clear
    const trimmed = args.trim()
    if (!trimmed) {
      onDone('Usage: /profile (interactive) or /profile <set|append|show|clear> <text>', {
        display: 'system',
      })
      return null
    }

    const firstSpace = trimmed.indexOf(' ')
    const action = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase() as Action
    const text = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim()

    if (action === 'show') {
      const out = await runAction({ action: 'show' })
      onDone(out, { display: 'system' })
      return null
    }

    if (action === 'clear') {
      const out = await runAction({ action: 'clear' })
      onDone(out, { display: 'system' })
      return null
    }

    if ((action === 'set' || action === 'append') && text) {
      const out = await runAction({ action, text })
      onDone(out, { display: 'system' })
      return null
    }

    onDone(`Unknown action: ${action}`, { display: 'system' })
    return null
  }

  return <ProfileWizard onDone={onDone} />
}
