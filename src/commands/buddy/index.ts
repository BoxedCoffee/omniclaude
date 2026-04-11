import type { Command } from '../../commands.js'

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Hatch, pet, and manage your Open Claude companion',
  immediate: true,
  argumentHint: '[hatch|list|set|status|pet|rename|mute|unmute|help]',
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
