import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { companionUserId, getCompanion, rollWithSeed } from '../../buddy/companion.js'
import type { CompanionBones, StoredBuddy } from '../../buddy/types.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'

const HATCH_COOLDOWN_MS = 24 * 60 * 60 * 1000

const NAME_PREFIXES = [
  'Byte',
  'Echo',
  'Glint',
  'Miso',
  'Nova',
  'Pixel',
  'Rune',
  'Static',
  'Vector',
  'Whisk',
] as const

const NAME_SUFFIXES = [
  'bean',
  'bit',
  'bud',
  'dot',
  'ling',
  'loop',
  'moss',
  'patch',
  'puff',
  'spark',
] as const

const PERSONALITIES = [
  'Curious and quietly encouraging',
  'A patient little watcher with strong debugging instincts',
  'Playful, observant, and suspicious of flaky tests',
  'Calm under pressure and fond of clean diffs',
  'A tiny terminal gremlin who likes successful builds',
] as const

const PET_REACTIONS = [
  'leans into the headpat',
  'does a proud little bounce',
  'emits a content beep',
  'looks delighted',
  'wiggles happily',
] as const

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickDeterministic<T>(items: readonly T[], seed: string): T {
  return items[hashString(seed) % items.length]!
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function buddyLabel(buddy: StoredBuddy): string {
  const shiny = buddy.bones.shiny ? 'Shiny ' : ''
  return `${buddy.name} (${shiny}${titleCase(buddy.bones.rarity)} ${buddy.bones.species})`
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function makeBuddyId(timestamp: number): string {
  return `buddy_${timestamp.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function buddySignature(bones: CompanionBones): string {
  return `${bones.rarity}|${bones.species}|${bones.eye}|${bones.hat}|${bones.shiny}`
}

function isCompanionRepresentedInCollection(
  companion: NonNullable<ReturnType<typeof getGlobalConfig>['companion']>,
  buddies: StoredBuddy[],
): boolean {
  return buddies.some(b =>
    b.name === companion.name &&
    b.personality === companion.personality &&
    b.hatchedAt === companion.hatchedAt,
  )
}

function migrateLegacyCompanionToCollection(config: ReturnType<typeof getGlobalConfig>): ReturnType<typeof getGlobalConfig> {
  const currentBuddies = config.buddies ?? []
  let nextBuddies = currentBuddies

  if (config.companion && !isCompanionRepresentedInCollection(config.companion, nextBuddies)) {
    const legacy = config.companion
    const legacySeed = `${companionUserId()}:buddy:legacy:${legacy.hatchedAt}:${legacy.name}`
    const { bones } = rollWithSeed(legacySeed)
    const migrated: StoredBuddy = {
      id: makeBuddyId(legacy.hatchedAt || Date.now()),
      name: legacy.name,
      personality: legacy.personality,
      hatchedAt: legacy.hatchedAt,
      bones,
    }
    nextBuddies = [...nextBuddies, migrated]
  }

  const activeExists = !!config.activeBuddyId && nextBuddies.some(b => b.id === config.activeBuddyId)
  const activeBuddyId = activeExists ? config.activeBuddyId : nextBuddies[0]?.id
  const hasChanges =
    nextBuddies !== currentBuddies ||
    activeBuddyId !== config.activeBuddyId ||
    (config.buddyHatchCount ?? 0) < nextBuddies.length

  if (!hasChanges) return config

  return {
    ...config,
    buddies: nextBuddies,
    activeBuddyId,
    buddyHatchCount: Math.max(config.buddyHatchCount ?? 0, nextBuddies.length),
  }
}

function getCollectionState() {
  const config = migrateLegacyCompanionToCollection(getGlobalConfig())
  const buddies = config.buddies ?? []
  const activeBuddy = config.activeBuddyId
    ? buddies.find(b => b.id === config.activeBuddyId)
    : buddies[0]
  return { config, buddies, activeBuddy }
}

function createStoredBuddy(existingBuddies: StoredBuddy[], hatchCount: number): StoredBuddy {
  const userId = companionUserId()
  const prefix = pickDeterministic(NAME_PREFIXES, `${userId}:prefix:${hatchCount}`)
  const suffix = pickDeterministic(NAME_SUFFIXES, `${userId}:suffix:${hatchCount}`)
  const personality = pickDeterministic(PERSONALITIES, `${userId}:personality:${hatchCount}`)
  const now = Date.now()
  const dayBucket = Math.floor(now / HATCH_COOLDOWN_MS)

  const existingSignatures = new Set(existingBuddies.map(b => buddySignature(b.bones)))
  let chosenBones: CompanionBones | undefined
  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = `${userId}:buddy:hatch:${dayBucket}:${hatchCount}:${attempt}`
    const { bones } = rollWithSeed(seed)
    if (!existingSignatures.has(buddySignature(bones)) || attempt === 39) {
      chosenBones = bones
      break
    }
  }

  return {
    id: makeBuddyId(now),
    name: `${prefix}${suffix}`,
    personality: `${personality}.`,
    hatchedAt: now,
    bones: chosenBones!,
  }
}

function getNextHatchRemaining(config: ReturnType<typeof getGlobalConfig>): number {
  const last = config.lastBuddyHatchAt ?? 0
  if (last <= 0) return 0
  const remaining = last + HATCH_COOLDOWN_MS - Date.now()
  return Math.max(0, remaining)
}

function resolveBuddyByToken(token: string, buddies: StoredBuddy[]): StoredBuddy | undefined {
  const trimmed = token.trim()
  if (!trimmed) return undefined
  const byId = buddies.find(b => b.id === trimmed)
  if (byId) return byId
  const oneBased = Number.parseInt(trimmed, 10)
  if (!Number.isNaN(oneBased) && oneBased >= 1 && oneBased <= buddies.length) {
    return buddies[oneBased - 1]
  }
  const lowered = trimmed.toLowerCase()
  return buddies.find(b => b.name.toLowerCase() === lowered)
}

function setCompanionReaction(
  context: LocalJSXCommandContext,
  reaction: string | undefined,
  pet = false,
): void {
  context.setAppState(prev => ({
    ...prev,
    companionReaction: reaction,
    companionPetAt: pet ? Date.now() : prev.companionPetAt,
  }))
}

function showHelp(onDone: LocalJSXCommandOnDone): void {
  onDone(
    [
      'Usage: /buddy [hatch|list|set|status|pet|rename|mute|unmute|help]',
      '',
      'Commands:',
      '  /buddy hatch                 Hatch a new buddy (24h cooldown)',
      '  /buddy list                  List your collected buddies',
      '  /buddy set <id|index|name>   Set active buddy',
      '  /buddy status                Show active buddy and hatch timer',
      '  /buddy pet                   Pet active buddy',
      '  /buddy rename <id|index|name> <new name>',
      '  /buddy mute | unmute         Toggle companion speech bubble',
    ].join('\n'),
    { display: 'system' },
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<null> {
  const rawArgs = args?.trim() ?? ''
  const [subcommandRaw, ...rest] = rawArgs.length > 0 ? rawArgs.split(/\s+/) : []
  const subcommand = (subcommandRaw ?? '').toLowerCase()

  if (rawArgs.length === 0) {
    const { buddies, activeBuddy } = getCollectionState()
    if (buddies.length === 0) {
      // Backward-compatible first run behavior: plain /buddy hatches.
      const newBuddy = createStoredBuddy([], 1)
      saveGlobalConfig(current => {
        const migrated = migrateLegacyCompanionToCollection(current)
        return {
          ...migrated,
          companion: {
            name: newBuddy.name,
            personality: newBuddy.personality,
            hatchedAt: newBuddy.hatchedAt,
          },
          companionMuted: false,
          buddies: [newBuddy],
          activeBuddyId: newBuddy.id,
          lastBuddyHatchAt: newBuddy.hatchedAt,
          buddyHatchCount: 1,
        }
      })
      setCompanionReaction(
        context,
        `${newBuddy.name} the ${newBuddy.bones.species} has hatched.`,
        true,
      )
      onDone(
        `${newBuddy.name} the ${newBuddy.bones.species} is now your buddy. Next hatch in 24h.`,
        { display: 'system' },
      )
      return null
    }

    if (!activeBuddy) {
      onDone('No active buddy selected. Run /buddy set <id>.', {
        display: 'system',
      })
      return null
    }

    const reaction = `${activeBuddy.name} ${pickDeterministic(
      PET_REACTIONS,
      `${Date.now()}:${activeBuddy.name}`,
    )}`
    setCompanionReaction(context, reaction, true)
    onDone(undefined, { display: 'skip' })
    return null
  }

  if (COMMON_HELP_ARGS.includes(subcommand)) {
    showHelp(onDone)
    return null
  }

  if (COMMON_INFO_ARGS.includes(subcommand) || subcommand === 'status') {
    const { buddies, activeBuddy, config } = getCollectionState()
    if (!activeBuddy) {
      onDone('No buddy hatched yet. Run /buddy to hatch one.', {
        display: 'system',
      })
      return null
    }

    const hatchRemaining = getNextHatchRemaining(config)
    const hatchState = hatchRemaining > 0
      ? `Next hatch in ${formatDuration(hatchRemaining)}.`
      : 'Hatch is ready now.'

    onDone(
      [
        `${activeBuddy.name} is your ${titleCase(activeBuddy.bones.rarity)} ${activeBuddy.bones.species}. ${activeBuddy.personality}`,
        `${buddies.length} buddy${buddies.length === 1 ? '' : 'ies'} collected.`,
        hatchState,
      ].join(' '),
      { display: 'system' },
    )
    return null
  }

  if (subcommand === 'mute' || subcommand === 'unmute') {
    const muted = subcommand === 'mute'
    saveGlobalConfig(current => ({
      ...current,
      companionMuted: muted,
    }))
    if (muted) {
      setCompanionReaction(context, undefined)
    }
    onDone(`Buddy ${muted ? 'muted' : 'unmuted'}.`, { display: 'system' })
    return null
  }

  if (subcommand === 'list') {
    const { buddies, activeBuddy } = getCollectionState()
    if (buddies.length === 0) {
      onDone('No buddies collected yet. Run /buddy hatch.', { display: 'system' })
      return null
    }

    const rows = buddies.map((buddy, idx) => {
      const marker = activeBuddy?.id === buddy.id ? '*' : ' '
      return `${marker} ${idx + 1}. ${buddyLabel(buddy)} [${buddy.id}]`
    })
    onDone(['Buddies:', ...rows].join('\n'), { display: 'system' })
    return null
  }

  if (subcommand === 'set') {
    const target = rest.join(' ').trim()
    const { buddies } = getCollectionState()
    if (!target) {
      onDone('Usage: /buddy set <id|index|name>', { display: 'system' })
      return null
    }
    const buddy = resolveBuddyByToken(target, buddies)
    if (!buddy) {
      onDone(`Buddy not found: ${target}`, { display: 'system' })
      return null
    }
    saveGlobalConfig(current => ({
      ...migrateLegacyCompanionToCollection(current),
      activeBuddyId: buddy.id,
      companion: {
        name: buddy.name,
        personality: buddy.personality,
        hatchedAt: buddy.hatchedAt,
      },
    }))
    onDone(`Active buddy set to ${buddyLabel(buddy)}.`, { display: 'system' })
    return null
  }

  if (subcommand === 'rename') {
    if (rest.length < 2) {
      onDone('Usage: /buddy rename <id|index|name> <new name>', { display: 'system' })
      return null
    }
    const token = rest[0]!
    const newName = rest.slice(1).join(' ').trim()
    if (newName.length < 2) {
      onDone('Buddy name must be at least 2 characters.', { display: 'system' })
      return null
    }

    const { buddies, activeBuddy } = getCollectionState()
    const target = resolveBuddyByToken(token, buddies)
    if (!target) {
      onDone(`Buddy not found: ${token}`, { display: 'system' })
      return null
    }

    saveGlobalConfig(current => {
      const migrated = migrateLegacyCompanionToCollection(current)
      const updated = (migrated.buddies ?? []).map(b =>
        b.id === target.id ? { ...b, name: newName } : b,
      )
      const updatedActive = updated.find(b => b.id === (migrated.activeBuddyId ?? activeBuddy?.id))
      return {
        ...migrated,
        buddies: updated,
        companion: updatedActive
          ? {
              name: updatedActive.name,
              personality: updatedActive.personality,
              hatchedAt: updatedActive.hatchedAt,
            }
          : migrated.companion,
      }
    })
    onDone(`Renamed buddy to ${newName}.`, { display: 'system' })
    return null
  }

  if (subcommand === 'hatch') {
    const { config, buddies } = getCollectionState()
    const remaining = getNextHatchRemaining(config)
    if (remaining > 0) {
      onDone(
        `Hatch is on cooldown. Next hatch in ${formatDuration(remaining)}.`,
        { display: 'system' },
      )
      return null
    }

    const hatchCount = (config.buddyHatchCount ?? 0) + 1
    const newBuddy = createStoredBuddy(buddies, hatchCount)
    saveGlobalConfig(current => {
      const migrated = migrateLegacyCompanionToCollection(current)
      const nextBuddies = [...(migrated.buddies ?? []), newBuddy]
      return {
        ...migrated,
        buddies: nextBuddies,
        activeBuddyId: newBuddy.id,
        lastBuddyHatchAt: newBuddy.hatchedAt,
        buddyHatchCount: hatchCount,
        companion: {
          name: newBuddy.name,
          personality: newBuddy.personality,
          hatchedAt: newBuddy.hatchedAt,
        },
      }
    })
    setCompanionReaction(
      context,
      `${newBuddy.name} the ${newBuddy.bones.species} has hatched.`,
      true,
    )
    onDone(
      `${newBuddy.name} hatched (${titleCase(newBuddy.bones.rarity)} ${newBuddy.bones.species}). Next hatch in 24h.`,
      { display: 'system' },
    )
    return null
  }

  if (subcommand === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      onDone('No buddy hatched yet. Run /buddy hatch.', { display: 'system' })
      return null
    }
    const reaction = `${companion.name} ${pickDeterministic(
      PET_REACTIONS,
      `${Date.now()}:${companion.name}`,
    )}`
    setCompanionReaction(context, reaction, true)
    onDone(undefined, { display: 'skip' })
    return null
  }

  if (subcommand !== '') {
    showHelp(onDone)
    return null
  }
  return null
}
