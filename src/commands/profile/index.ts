import type { Command } from '../../commands.js'

const profile = {
  type: 'local-jsx',
  name: 'profile',
  description:
    'Set a global behavior profile applied across all OmniClaude sessions',
  load: () => import('./profile.js'),
} satisfies Command

export default profile
