import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { companionUserId, getCompanion, rollWithSeed } from '../../buddy/companion.js'
import { renderSprite } from '../../buddy/sprites.js'
import { SPECIES, type CompanionBones, type StoredBuddy } from '../../buddy/types.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'
import { stringWidth } from '../../ink/stringWidth.js'

const HATCH_BASE_COOLDOWN_MS = 20 * 60 * 60 * 1000
const HATCH_READY_WINDOW_MS = 4 * 60 * 60 * 1000
const HATCH_STREAK_STEP_MS = 30 * 60 * 1000
const HATCH_STREAK_MAX_REDUCTION_MS = 2 * 60 * 60 * 1000
const HATCH_DUPLICATE_SHARDS = 2
const HATCH_REROLL_SHARD_COST = 5
const PITY_UNCOMMON_INTERVAL = 5
const PITY_RARE_INTERVAL = 15

type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
const RARITY_RANK: Record<RarityTier, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
}

function rarityAtLeast(actual: RarityTier, required: RarityTier): boolean {
  return RARITY_RANK[actual] >= RARITY_RANK[required]
}

function effectiveCooldownFromStreak(streak: number): number {
  const reduction = Math.min(
    Math.max(0, streak) * HATCH_STREAK_STEP_MS,
    HATCH_STREAK_MAX_REDUCTION_MS,
  )
  return HATCH_BASE_COOLDOWN_MS - reduction
}

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

const SPECIES_PERSONALITIES: Record<(typeof SPECIES)[number], readonly string[]> = {
  duck: [
    'A common duck who speed-checks your plan before every big change',
    'A neat little duck that keeps your TODO list from drifting',
  ],
  goose: [
    'A loud goose sentinel that hisses when your tests are flaky',
    'A stubborn goose that guards clean abstractions with passion',
  ],
  blob: [
    'A cheerful blob that absorbs stress and returns practical ideas',
    'A soft blob that smooths rough prototypes into useful tools',
  ],
  cat: [
    'A focused cat that watches every diff with cold precision',
    'A sleepy cat that wakes instantly for edge-case bugs',
  ],
  dragon: [
    'A tiny dragon that hoards elegant refactors and sharp fixes',
    'A proud dragon that breathes fire on dead code paths',
  ],
  octopus: [
    'An octopus multitasker that juggles tools without dropping context',
    'A curious octopus that untangles nested logic with calm patience',
  ],
  owl: [
    'A nocturnal owl reviewer that spots subtle regressions fast',
    'A wise owl that keeps architecture choices grounded and clear',
  ],
  penguin: [
    'A determined penguin that slides through repetitive chores quickly',
    'A compact penguin that keeps your release checklist honest',
  ],
  turtle: [
    'A patient turtle that prefers safe migrations over risky shortcuts',
    'A steady turtle that never lets tests be skipped',
  ],
  snail: [
    'A careful snail that leaves traceable, understandable edits',
    'A thoughtful snail that favors reliability over rush jobs',
  ],
  ghost: [
    'A ghostly helper that finds invisible coupling in old modules',
    'A quiet ghost that haunts TODOs until they are actually done',
  ],
  axolotl: [
    'An axolotl tinkerer that heals broken workflows with odd charm',
    'A resilient axolotl that regenerates momentum after failed runs',
  ],
  capybara: [
    'A capybara mediator that keeps heated refactors civil and simple',
    'A relaxed capybara that turns chaos into a clear next step',
  ],
  cactus: [
    'A cactus guardian that enforces boundaries in sprawling codebases',
    'A prickly cactus that rejects brittle shortcuts on sight',
  ],
  robot: [
    'A compact robot that optimizes repetitive steps with machine calm',
    'A logic-first robot that turns vague plans into exact actions',
  ],
  rabbit: [
    'A quick rabbit that hops between tasks without losing focus',
    'A bright rabbit that sniffs out missing validation paths',
  ],
  mushroom: [
    'A mushroom scholar that thrives in legacy corners and caveats',
    'A spore-driven mushroom that spreads tiny quality improvements',
  ],
  chonk: [
    'A mighty chonk that tanks incidents until the system is stable',
    'A dependable chonk that carries heavy cleanup work without complaint',
  ],
}

type SpeciesKind = 'Animal' | 'Mythical' | 'Creature' | 'Object'

const SPECIES_CARD_META: Record<
  (typeof SPECIES)[number],
  { kind: SpeciesKind; tags: readonly string[]; sprite: readonly string[] }
> = {
  duck: {
    kind: 'Animal',
    tags: ['#friendly', '#aquatic'],
    sprite: [
      '  __      ',
      ' <(· )___ ',
      '  (  ._>  ',
      "   `--'   ",
    ],
  },
  goose: {
    kind: 'Animal',
    tags: ['#chaotic', '#loud'],
    sprite: [
      '    (·>   ',
      '    ||    ',
      '  _(__)_  ',
      '   ^^^^   ',
    ],
  },
  blob: {
    kind: 'Creature',
    tags: ['#amorphous', '#calm'],
    sprite: [
      '  .----.  ',
      ' ( ·  · ) ',
      ' (      ) ',
      "  `----'  ",
    ],
  },
  cat: {
    kind: 'Animal',
    tags: ['#independent', '#curious'],
    sprite: [
      '  /\\_/\\   ',
      ' ( ·   ·) ',
      ' (  w  )  ',
      ' (")_(")  ',
    ],
  },
  dragon: {
    kind: 'Mythical',
    tags: ['#powerful', '#ancient'],
    sprite: [
      ' /^\\  /^\\ ',
      '<  ·  ·  >',
      ' (   ~~   )',
      "  `-vvvv-' ",
    ],
  },
  octopus: {
    kind: 'Animal',
    tags: ['#intelligent', '#flexible'],
    sprite: [
      '  .----.  ',
      ' ( ·  · ) ',
      ' (______) ',
      ' /\\/\\/\\/\\ ',
    ],
  },
  owl: {
    kind: 'Animal',
    tags: ['#wise', '#nocturnal'],
    sprite: [
      '  /\  /\  ',
      ' ((·)(·)) ',
      ' (  ><  ) ',
      "  `----'  ",
    ],
  },
  penguin: {
    kind: 'Animal',
    tags: ['#resilient', '#social'],
    sprite: [
      ' .---.    ',
      ' (·>·)    ',
      ' /(   )\\  ',
      "  `---'   ",
    ],
  },
  turtle: {
    kind: 'Animal',
    tags: ['#steady', '#armored'],
    sprite: [
      '  _,--._  ',
      ' ( ·  · ) ',
      ' /[______]\\ ',
      '  ``    `` ',
    ],
  },
  snail: {
    kind: 'Animal',
    tags: ['#slow', '#persistent'],
    sprite: [
      '·    .--. ',
      '  \\  ( @ ) ',
      "   \\_`--' ",
      ' ~~~~~~~  ',
    ],
  },
  ghost: {
    kind: 'Mythical',
    tags: ['#ethereal', '#spooky'],
    sprite: [
      '  .----.  ',
      ' / ·  · \\ ',
      ' |      | ',
      ' ~`~``~`~ ',
    ],
  },
  axolotl: {
    kind: 'Animal',
    tags: ['#regenerative', '#aquatic'],
    sprite: [
      '}~(______)~{',
      '}~(· .. ·)~{',
      '  ( .--. )  ',
      '  (_/  \\_)  ',
    ],
  },
  capybara: {
    kind: 'Animal',
    tags: ['#chill', '#social'],
    sprite: [
      ' n______n ',
      '( ·    · )',
      '(   oo   )',
      " `------' ",
    ],
  },
  cactus: {
    kind: 'Object',
    tags: ['#prickly', '#resilient'],
    sprite: [
      'n  ____  n',
      '| |·  ·| |',
      '|_|    |_|',
      '  |    |  ',
    ],
  },
  robot: {
    kind: 'Object',
    tags: ['#logical', '#mechanical'],
    sprite: [
      '  .[||].  ',
      ' [ ·  · ] ',
      ' [ ==== ] ',
      " `------' ",
    ],
  },
  rabbit: {
    kind: 'Animal',
    tags: ['#quick', '#fluffy'],
    sprite: [
      '  (\\__/)  ',
      ' ( ·  · ) ',
      ' =(  ..  )=',
      ' (")__(") ',
    ],
  },
  mushroom: {
    kind: 'Object',
    tags: ['#fungal', '#mysterious'],
    sprite: [
      '.-o-OO-o-.',
      '(__________)',
      '  |·  ·|  ',
      '  |____|  ',
    ],
  },
  chonk: {
    kind: 'Animal',
    tags: ['#round', '#hefty'],
    sprite: [
      ' /\\    /\\ ',
      '( ·    · )',
      '(   ..   )',
      " `------' ",
    ],
  },
}

const PET_REACTIONS = [
  'leans into the headpat',
  'does a proud little bounce',
  'emits a content beep',
  'looks delighted',
  'wiggles happily',
] as const

const SPECIES_PET_REACTIONS: Partial<
  Record<(typeof SPECIES)[number], readonly string[]>
> = {
  owl: ['ruffles feathers contentedly', 'gives a dignified hoot'],
  cat: ['purrs and pretends not to care', 'tolerates you with dramatic grace'],
  duck: ['happy quacks', 'waddles in circles'],
  dragon: ['purr-rumbles with warm sparks', 'folds wings and leans in'],
  ghost: ['drifts in a pleased spiral', 'makes a happy spooky wobble'],
  robot: ['beeps in a delighted pattern', 'runs a comfort subroutine'],
  axolotl: ['does a happy gill wiggle', 'blushes pink and bobs'],
  capybara: ['achieves maximum chill', 'activates zen mode'],
  mushroom: ['releases a happy puff of spores', 'does a tiny fungal shimmy'],
}

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

const CARD_INNER_WIDTH = 46
const CARD_STATS_WIDTH = 10

const RARITY_STARS: Record<CompanionBones['rarity'], string> = {
  common: '★',
  uncommon: '★★',
  rare: '★★★',
  epic: '★★★★',
  legendary: '★★★★★',
}

function clipText(text: string, max: number): string {
  if (stringWidth(text) <= max) return text
  if (max <= 3) return '.'.repeat(Math.max(0, max))

  let out = ''
  for (const ch of text) {
    const next = out + ch
    if (stringWidth(next) + 3 > max) break
    out = next
  }
  return `${out}...`
}

function cardLine(text: string): string {
  const clipped = clipText(text, CARD_INNER_WIDTH)
  const pad = Math.max(0, CARD_INNER_WIDTH - stringWidth(clipped))
  return `| ${clipped}${' '.repeat(pad)} |`
}

function cardSplitLine(left: string, right: string): string {
  const rightClipped = clipText(right, CARD_INNER_WIDTH - 1)
  const rightWidth = stringWidth(rightClipped)
  const leftMax = Math.max(1, CARD_INNER_WIDTH - rightWidth - 1)
  const l = clipText(left, leftMax)
  const lWidth = stringWidth(l)

  const rightMax = Math.max(1, CARD_INNER_WIDTH - lWidth - 1)
  const r = clipText(rightClipped, rightMax)
  const rWidth = stringWidth(r)
  const gap = Math.max(1, CARD_INNER_WIDTH - lWidth - rWidth)
  return `| ${l}${' '.repeat(gap)}${r} |`
}

function wrapText(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/)
  if (words.length === 0) return []

  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`
    if (stringWidth(candidate) <= width) {
      current = candidate
      continue
    }
    if (current.length > 0) lines.push(current)
    current = word
  }
  if (current.length > 0) lines.push(current)
  return lines
}

function normalizeBuddyFlavor(personality: string, bones: CompanionBones): string {
  const speciesPattern = new RegExp(`\\b(?:${SPECIES.join('|')})\\b`, 'gi')
  const rarityPattern = /\b(common|uncommon|rare|epic|legendary)\b/gi

  let out = personality.trim().replace(/\s+/g, ' ')
  out = out.replace(speciesPattern, bones.species)
  out = out.replace(rarityPattern, bones.rarity)
  if (out.length === 0) return `A ${bones.rarity} ${bones.species} companion.`
  return out.charAt(0).toUpperCase() + out.slice(1)
}

function buddySprite(buddy: StoredBuddy): string[] {
  // Keep card art in sync with live sprite definitions/frames.
  const lines = renderSprite(buddy.bones, 0)
  const eye = buddy.bones.eye
  const asciiEye =
    eye === '✦' ? '*'
    : eye === '◉' ? 'o'
    : eye === '·' ? '.'
    : eye === '°' ? 'o'
    : eye

  // Card view prefers single-column eye glyphs to avoid odd spacing for some species (notably cat).
  const normalized = lines.map(line => {
    let out = line
    if (asciiEye !== eye) out = out.replaceAll(eye, asciiEye)
    // Keep card sprites ASCII-safe to avoid width/render quirks across terminals.
    out = out.replaceAll('ω', 'w')
    out = out.replaceAll('´', "'")
    return out
  })
  return normalized
}

function pickPetReaction(buddy: { name: string; bones: CompanionBones }): string {
  const speciesPool = SPECIES_PET_REACTIONS[buddy.bones.species]
  const reaction = pickDeterministic(
    speciesPool?.length ? speciesPool : PET_REACTIONS,
    `${Date.now()}:${buddy.name}:${buddy.bones.species}`,
  )
  return `${buddy.name} ${reaction}`
}

function statBar(value: number): string {
  const width = CARD_STATS_WIDTH
  const clamped = Math.max(0, Math.min(100, value))
  const filled = Math.round((clamped / 100) * width)
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`
}

function formatBuddyCard(buddy: StoredBuddy, idx: number, active: boolean): string {
  const shiny = buddy.bones.shiny ? 'Shiny ' : ''
  const species = titleCase(buddy.bones.species)
  const rarity = titleCase(buddy.bones.rarity)
  const meta = SPECIES_CARD_META[buddy.bones.species]
  const top = `+${'='.repeat(CARD_INNER_WIDTH + 2)}+`
  const mid = `+${'-'.repeat(CARD_INNER_WIDTH + 2)}+`
  const headerLeft = `${RARITY_STARS[buddy.bones.rarity]} ${rarity.toUpperCase()}${buddy.bones.shiny ? ' • SHINY' : ''}`
  const headerRight = species.toUpperCase()
  const spriteLines = buddySprite(buddy)

  const lore = wrapText(`"${normalizeBuddyFlavor(buddy.personality, buddy.bones)}"`, CARD_INNER_WIDTH)

  const stats = [
    ['DEBUGGING', buddy.bones.stats.DEBUGGING],
    ['PATIENCE', buddy.bones.stats.PATIENCE],
    ['CHAOS', buddy.bones.stats.CHAOS],
    ['WISDOM', buddy.bones.stats.WISDOM],
    ['SNARK', buddy.bones.stats.SNARK],
  ] as const

  const statLines = stats.map(([label, value]) =>
    cardLine(`${label.padEnd(10)} ${statBar(value)} ${value.toString().padStart(3)}`),
  )

  return [
    top,
    cardSplitLine(headerLeft, headerRight),
    ...spriteLines.map(line => cardLine(line)),
    cardLine(`${buddy.name} ${active ? '• ACTIVE' : ''}`),
    ...lore.map(line => cardLine(line)),
    cardLine(`No. #${idx + 1}  ID ${clipText(buddy.id, 22)}`),
    cardLine(`Traits: Eye ${buddy.bones.eye} • Hat ${buddy.bones.hat}`),
    cardLine(`Class: ${shiny}${rarity} ${species}`),
    cardLine(`Type: ${meta.kind}`),
    cardLine(meta.tags.join(' ')),
    mid,
    ...statLines,
    top,
  ].join('\n')
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function getHatchTiming(config: ReturnType<typeof getGlobalConfig>) {
  const last = config.lastBuddyHatchAt ?? 0
  const streak = config.buddyHatchStreak ?? 0
  if (last <= 0) {
    return {
      last,
      streak,
      cooldownMs: HATCH_BASE_COOLDOWN_MS,
      readyAt: 0,
      readyWindowEndsAt: 0,
      remaining: 0,
    }
  }

  const cooldownMs = effectiveCooldownFromStreak(streak)
  const readyAt = last + cooldownMs
  const readyWindowEndsAt = readyAt + HATCH_READY_WINDOW_MS
  const remaining = Math.max(0, readyAt - Date.now())
  return { last, streak, cooldownMs, readyAt, readyWindowEndsAt, remaining }
}

function getHatchTeaser(config: ReturnType<typeof getGlobalConfig>, buddies: StoredBuddy[]): string | undefined {
  const timing = getHatchTiming(config)
  if (timing.remaining <= 0 || timing.cooldownMs <= 0) return undefined

  const progress = 1 - timing.remaining / timing.cooldownMs
  if (progress < 0.7) return undefined

  const userId = companionUserId()
  const hatchCount = (config.buddyHatchCount ?? 0) + 1
  const bucket = Math.floor(Date.now() / HATCH_BASE_COOLDOWN_MS)
  const attemptSeed = `${userId}:buddy:hatch:${bucket}:${hatchCount}:0`
  const projected = rollWithSeed(attemptSeed).bones

  if (progress >= 0.9) {
    const glow = rarityAtLeast(projected.rarity, 'rare') ? 'strong' : 'faint'
    return `Egg glow: ${glow} (${titleCase(projected.rarity)} pulse).`
  }

  const meta = SPECIES_CARD_META[projected.species]
  const tag = meta.tags[0] ?? '#mysterious'
  const unique = new Set(buddies.map(b => buddySignature(b.bones)))
  const novelty = unique.has(buddySignature(projected)) ? 'familiar' : 'new'
  return `Signal lock: ${tag} (${novelty} pattern).`
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

function createStoredBuddy(
  existingBuddies: StoredBuddy[],
  hatchCount: number,
  pityUncommon: number,
  pityRare: number,
  forceReroll = false,
): StoredBuddy {
  const userId = companionUserId()
  const prefix = pickDeterministic(NAME_PREFIXES, `${userId}:prefix:${hatchCount}`)
  const suffix = pickDeterministic(NAME_SUFFIXES, `${userId}:suffix:${hatchCount}`)
  const now = Date.now()
  const dayBucket = Math.floor(now / HATCH_BASE_COOLDOWN_MS)

  const requiredRarity: RarityTier =
    pityRare + 1 >= PITY_RARE_INTERVAL
      ? 'rare'
      : pityUncommon + 1 >= PITY_UNCOMMON_INTERVAL
        ? 'uncommon'
        : 'common'

  const existingSignatures = new Set(existingBuddies.map(b => buddySignature(b.bones)))
  let chosenBones: CompanionBones | undefined
  for (let attempt = 0; attempt < 80; attempt++) {
    const mode = forceReroll ? 'reroll' : 'hatch'
    const seed = `${userId}:buddy:${mode}:${dayBucket}:${hatchCount}:${attempt}`
    const { bones } = rollWithSeed(seed)
    const meetsPity = rarityAtLeast(bones.rarity, requiredRarity)
    if ((!existingSignatures.has(buddySignature(bones)) && meetsPity) || attempt === 79) {
      chosenBones = bones
      break
    }
  }

  const speciesPool = SPECIES_PERSONALITIES[chosenBones!.species] ?? PERSONALITIES
  const personality = pickDeterministic(
    speciesPool,
    `${userId}:personality:${chosenBones!.species}:${hatchCount}`,
  )

  return {
    id: makeBuddyId(now),
    name: `${prefix}${suffix}`,
    personality: personality.endsWith('.') ? personality : `${personality}.`,
    hatchedAt: now,
    bones: chosenBones!,
  }
}

function getNextHatchRemaining(config: ReturnType<typeof getGlobalConfig>): number {
  return getHatchTiming(config).remaining
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
      '  /buddy hatch                 Hatch a new buddy (~20h cooldown, streak bonus)',
      `  /buddy hatch reroll          Spend ${HATCH_REROLL_SHARD_COST} shards to reroll hatch`,
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
      const newBuddy = createStoredBuddy([], 1, 0, 0)
      const firstPityUncommon = rarityAtLeast(newBuddy.bones.rarity, 'uncommon') ? 0 : 1
      const firstPityRare = rarityAtLeast(newBuddy.bones.rarity, 'rare') ? 0 : 1
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
          buddyHatchStreak: 0,
          buddyShardBalance: 0,
          buddyPityUncommon: firstPityUncommon,
          buddyPityRare: firstPityRare,
        }
      })
      setCompanionReaction(
        context,
        `${newBuddy.name} the ${newBuddy.bones.species} has hatched.`,
        true,
      )
      onDone(
        `${newBuddy.name} the ${newBuddy.bones.species} is now your buddy. Next hatch in about 20h.`,
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

    const reaction = pickPetReaction(activeBuddy)
    setCompanionReaction(context, reaction, true)
    onDone(undefined, { display: 'skip' })
    return null
  }

  if (COMMON_HELP_ARGS.includes(subcommand)) {
    showHelp(onDone)
    return null
  }

  if ((COMMON_INFO_ARGS.includes(subcommand) && subcommand !== 'list') || subcommand === 'status') {
    const { buddies, activeBuddy, config } = getCollectionState()
    if (!activeBuddy) {
      onDone('No buddy hatched yet. Run /buddy to hatch one.', {
        display: 'system',
      })
      return null
    }

    const timing = getHatchTiming(config)
    const hatchRemaining = timing.remaining
    const now = Date.now()

    let hatchState = 'Hatch is ready now.'
    if (hatchRemaining > 0) {
      hatchState = `Next hatch in ${formatDuration(hatchRemaining)}.`
    } else if (timing.readyWindowEndsAt > now) {
      hatchState = `Egg is ready now. Bonus window ends in ${formatDuration(timing.readyWindowEndsAt - now)}.`
    } else if (timing.readyAt > 0) {
      hatchState = `Egg is ready (window passed ${formatDuration(now - timing.readyWindowEndsAt)} ago).`
    }

    const progressPct = timing.cooldownMs > 0
      ? Math.max(0, Math.min(100, Math.floor((1 - hatchRemaining / timing.cooldownMs) * 100)))
      : 100
    const teaser = getHatchTeaser(config, buddies)
    const streak = config.buddyHatchStreak ?? 0
    const shardBalance = config.buddyShardBalance ?? 0
    const pityUncommon = config.buddyPityUncommon ?? 0
    const pityRare = config.buddyPityRare ?? 0
    const pityLine = `Pity: uncommon in ${Math.max(1, PITY_UNCOMMON_INTERVAL - pityUncommon)}, rare in ${Math.max(1, PITY_RARE_INTERVAL - pityRare)}.`

    onDone(
      [
        `${activeBuddy.name} is your ${titleCase(activeBuddy.bones.rarity)} ${activeBuddy.bones.species}. ${activeBuddy.personality}`,
        `${buddies.length === 1 ? '1 buddy' : `${buddies.length} buddies`} collected.`,
        `Egg charge ${progressPct}% • streak ${streak} • shards ${shardBalance}.`,
        teaser ?? 'Egg telemetry: stable.',
        pityLine,
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

    const cards = buddies.map((buddy, idx) =>
      formatBuddyCard(buddy, idx, activeBuddy?.id === buddy.id),
    )
    onDone([`Buddy Dex (${buddies.length})`, '', ...cards].join('\n\n'))
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
    const pityUncommon = config.buddyPityUncommon ?? 0
    const pityRare = config.buddyPityRare ?? 0
    const forceReroll = subcommand === 'hatch' && rest[0]?.toLowerCase() === 'reroll'

    if (forceReroll && (config.buddyShardBalance ?? 0) < HATCH_REROLL_SHARD_COST) {
      onDone(
        `Not enough shards. /buddy hatch reroll costs ${HATCH_REROLL_SHARD_COST} shards (you have ${config.buddyShardBalance ?? 0}).`,
        { display: 'system' },
      )
      return null
    }

    const newBuddy = createStoredBuddy(buddies, hatchCount, pityUncommon, pityRare, forceReroll)
    const newSig = buddySignature(newBuddy.bones)
    const isDuplicate = buddies.some(b => buddySignature(b.bones) === newSig)

    const nextPityUncommon = rarityAtLeast(newBuddy.bones.rarity, 'uncommon')
      ? 0
      : pityUncommon + 1
    const nextPityRare = rarityAtLeast(newBuddy.bones.rarity, 'rare')
      ? 0
      : pityRare + 1

    const timing = getHatchTiming(config)
    const now = Date.now()
    const withinWindow = timing.readyAt > 0 && now >= timing.readyAt && now <= timing.readyWindowEndsAt
    const nextStreak = withinWindow ? Math.min((config.buddyHatchStreak ?? 0) + 1, 4) : 0

    saveGlobalConfig(current => {
      const migrated = migrateLegacyCompanionToCollection(current)
      const nextBuddies = isDuplicate
        ? [...(migrated.buddies ?? [])]
        : [...(migrated.buddies ?? []), newBuddy]
      const shardDelta = (isDuplicate ? HATCH_DUPLICATE_SHARDS : 0) - (forceReroll ? HATCH_REROLL_SHARD_COST : 0)
      return {
        ...migrated,
        buddies: nextBuddies,
        activeBuddyId: isDuplicate ? migrated.activeBuddyId : newBuddy.id,
        lastBuddyHatchAt: newBuddy.hatchedAt,
        buddyHatchCount: hatchCount,
        buddyHatchStreak: nextStreak,
        buddyPityUncommon: nextPityUncommon,
        buddyPityRare: nextPityRare,
        buddyShardBalance: Math.max(0, (migrated.buddyShardBalance ?? 0) + shardDelta),
        companion: isDuplicate
          ? migrated.companion
          : {
              name: newBuddy.name,
              personality: newBuddy.personality,
              hatchedAt: newBuddy.hatchedAt,
            },
      }
    })
    if (!isDuplicate) {
      setCompanionReaction(
        context,
        `${newBuddy.name} the ${newBuddy.bones.species} has hatched.`,
        true,
      )
    }

    const cooldownNow = effectiveCooldownFromStreak(nextStreak)
    const cooldownText = formatDuration(cooldownNow)
    if (isDuplicate) {
      onDone(
        `Duplicate hatch converted into +${HATCH_DUPLICATE_SHARDS} shards. Next hatch in ${cooldownText}.`,
        { display: 'system' },
      )
      return null
    }

    onDone(
      `${newBuddy.name} hatched (${titleCase(newBuddy.bones.rarity)} ${newBuddy.bones.species}). Next hatch in ${cooldownText}.`,
      { display: 'system' },
    )
    return null
  }

  if (subcommand === 'pet') {
    const { activeBuddy } = getCollectionState()
    if (!activeBuddy) {
      onDone('No buddy hatched yet. Run /buddy hatch.', { display: 'system' })
      return null
    }
    const reaction = pickPetReaction(activeBuddy)
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
