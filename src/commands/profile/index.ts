import type { Command } from '../../commands.js'

const profile = {
  type: 'local',
  name: 'profile',
  description:
    'Set a global behavior profile applied across all OmniClaude sessions',
  supportsNonInteractive: true,
  load: () => import('./profile.js'),
} satisfies Command

export default profile
