import type { Command } from '../../commands.js'

const cwd = {
  type: 'local',
  name: 'cwd',
  aliases: ['cd', 'pwd'],
  description: 'Show or change the current working directory',
  load: () => import('./cwd.js'),
} satisfies Command

export default cwd
