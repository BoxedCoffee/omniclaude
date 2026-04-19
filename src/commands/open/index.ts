import type { Command } from '../../commands.js'

const open = {
  type: 'local',
  name: 'open',
  description: 'Open a file in your editor (optionally with :line)',
  load: () => import('./open.js'),
} satisfies Command

export default open
