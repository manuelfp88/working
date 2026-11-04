import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Task } from '../types'

const ICONO = '⚙️'
// Cada cuánto se mira la lista de subagentes, en milisegundos.
const CADA = 2000

// Subagentes: se leen de la lista de agentes.
const agents = atom({ plugin: 'tareas', key: 'agents' } as const, [], { shape: 'tareas-1' })
// Comandos, Monitor y workflows: por eventos, y se corrigen al acabar cada turno.
const others = atom({ plugin: 'tareas', key: 'others' } as const, [], { shape: 'tareas-1' })

const isSame = (a: readonly Task[], b: readonly Task[]) => JSON.stringify(a) === JSON.stringify(b)

const poll = async ($: EngineInterface) => {
  const list = await $.agent.list()
  const active: Task[] = list
    .filter(agent => agent.status === 'pending' || agent.status === 'running' || agent.status === 'waiting')
    .map(agent => ({ id: agent.id, type: 'subagente', description: agent.description }))
  await update($, agents, prev => (isSame(prev, active) ? prev : active))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await poll($)
    $.clock.every(CADA, () => void poll($))
    return result
  })

  // Un comando que pasa a segundo plano.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const id = 'result' in ran ? (ran.result as { backgroundTaskId?: string } | undefined)?.backgroundTaskId : undefined
    if (id) {
      const task: Task = { id, type: 'comando', description: e.description ?? e.command }
      await update($, others, prev => [...prev.filter(one => one.id !== id), task])
    }
    return ran
  })

  // El aviso de que una tarea ha terminado.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'task-notification' } } }, async ($, e, next) => {
    const id = e.props.task?.id
    if (id) await update($, others, prev => (prev.some(one => one.id === id) ? prev.filter(one => one.id !== id) : prev))
    return next(e)
  })

  // Al acabar el turno, Claude Code da la lista completa: corrige cualquier desajuste.
  on('classic.Stop', async ($, e, next) => {
    const current: Task[] = (e.background_tasks ?? [])
      .filter(task => task.type !== 'subagent')
      .map(task => ({ id: task.id, type: task.type, description: task.description }))
    await update($, others, prev => (isSame(prev, current) ? prev : current))
    return next(e)
  })

  // En el pie del cuadro de texto, junto a lo que dibujan los demás.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const drawn = await next(e)
    const seen = new Map([...(await read($, agents)), ...(await read($, others))].map(task => [task.id, task]))
    const tasks = [...seen.values()]
    const isActive = tasks.length > 0

    const show = () => {
      $.ui.toast(
        isActive
          ? tasks.map(task => `${task.type}: ${task.description}`).join(' · ')
          : 'No hay tareas en segundo plano',
      )
    }

    return (
      <Box>
        <Button key="tareas" plain dimColor={!isActive} onPress={show}>
          {ICONO}{' '}
          <Text color={isActive ? 'claude' : 'inactive'} bold={isActive}>{tasks.length}</Text>
        </Button>
        {drawn}
      </Box>
    )
  })
}
