import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Chat } from '../types'

const ICONO = '🔄'
// Cada cuánto se miran las marcas de los demás chats, en milisegundos.
const CADA = 5000
// Una marca sin renovar en este tiempo es de un chat que se cerró a medias.
const CADUCA = 15 * 60 * 1000
// Las rutas se buscan en el ordenador de cada uno: la carpeta personal y las carpetas
// internas de la app de escritorio (macOS), una por cuenta. No están documentadas.
type Rutas = { home: string; chats: string[] }
let rutas: Rutas | undefined
const getRutas = async ($: EngineInterface): Promise<Rutas> => {
  if (rutas && rutas.chats.length > 0) return rutas
  const home = (await $.process.run(['/usr/bin/printenv', 'HOME'])).stdout.trim()
  const base = `${home}/Library/Application Support/Claude/claude-code-sessions`
  const chats: string[] = []
  try {
    for (const account of await $.fs.list(base)) {
      if (account.kind !== 'dir') continue
      for (const org of await $.fs.list(`${base}/${account.name}`)) {
        if (org.kind === 'dir') chats.push(`${base}/${account.name}/${org.name}`)
      }
    }
  } catch {
    // Sin la app de escritorio: no hay chats que leer.
  }
  rutas = { home, chats }
  return rutas
}

// Cada sesión deja en ~/.claude/trabajando un archivo con la hora mientras trabaja, y lo vacía al terminar.
const marcas = async ($: EngineInterface) => `${(await getRutas($)).home}/.claude/trabajando`
// Las que esperan permiso o respuesta, que deja el mod pendientes en ~/.claude/pendientes: esas no cuentan.
const esperas = async ($: EngineInterface) => `${(await getRutas($)).home}/.claude/pendientes`

// Los títulos largos, sobre todo los de los chats laterales, se cortan para que el aviso no se alargue.
const LARGO = 30
// Los chats laterales llevan 💬 en lugar de «btw:».
const corto = (title: string) => {
  const side = /^btw:\s*/i.test(title)
  const text = title.replace(/^btw:\s*/i, '')
  const cut = text.length > LARGO ? `${text.slice(0, LARGO - 1).trimEnd()}…` : text
  return side ? `💬 ${cut}` : cut
}

const working = atom({ plugin: 'working', key: 'working' } as const, [], { shape: 'working-1' })

// Si el último turno de esta sesión acabó con trabajo en segundo plano (un comando, un
// subagente, un workflow): la sesión sigue en marcha aunque el turno haya terminado.
// Va en el estado de la sesión, que sobrevive a /reload-plugins.
const background = atom({ plugin: 'working', key: 'background' } as const, false)
// Cuándo dijo Claude Code por última vez que quedaba trabajo en segundo plano. Pasada una hora
// sin otro turno, se da por colgado y deja de contar.
const backgroundSince = atom({ plugin: 'working', key: 'backgroundSince' } as const, 0)
const FONDO_MAX = 60 * 60 * 1000

const mark = async ($: EngineInterface, isWorking: boolean) => {
  const text = isWorking ? `${await $.clock.now()}${(await read($, background)) ? ' fondo' : ''}` : ''
  await $.fs.write(`${await marcas($)}/${await $.session.id()}`, text)
}

const filled = async ($: EngineInterface, dir: string) => {
  try {
    return (await $.fs.list(dir)).filter(file => file.size > 0)
  } catch {
    return []
  }
}

const poll = async ($: EngineInterface) => {
  const now = await $.clock.now()
  const waiting = new Set((await filled($, await esperas($))).map(file => file.name))
  const next: Chat[] = []
  const dir = await marcas($)
  for (const file of await filled($, dir)) {
    if (waiting.has(file.name)) continue
    try {
      const [at, kind] = (await $.fs.read(`${dir}/${file.name}`)).split(' ')
      if (now - Number(at) < CADUCA) next.push({ id: file.name, isBackground: kind === 'fondo' })
    } catch {
      // A medio escribir: el siguiente vistazo lo corrige.
    }
  }
  next.sort((a, b) => a.id.localeCompare(b.id))
  await update($, working, prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
}

// Los títulos solo hacen falta al pulsar: se buscan entonces.
const titles = async ($: EngineInterface, ids: readonly string[]) => {
  const byId = new Map<string, string>()
  for (const folder of (await getRutas($)).chats) {
    for (const file of await filled($, folder)) {
      if (!file.name.startsWith('local_')) continue
      try {
        const j = JSON.parse(await $.fs.read(`${folder}/${file.name}`)) as Record<string, unknown>
        for (const id of [j.cliSessionId, j.lastAssistantCliSessionId]) {
          if (typeof id === 'string' && ids.includes(id)) byId.set(id, String(j.title ?? ''))
        }
      } catch {
        // A medio escribir: se queda sin título.
      }
    }
  }
  return ids.map(id => byId.get(id) || 'chat sin título')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Una recarga no borra la marca: si había trabajo en segundo plano, sigue contando.
    const tick = async () => {
      // Mientras haya trabajo en segundo plano, la marca se renueva para que no caduque.
      if (await read($, background)) {
        if ((await $.clock.now()) - (await read($, backgroundSince)) < FONDO_MAX) {
          await mark($, true)
        } else {
          await update($, background, () => false)
          await mark($, false)
        }
      }
      await poll($)
    }
    await tick()
    $.clock.every(CADA, () => void tick())
    return result
  })

  // Esta sesión avisa a las demás de que trabaja: al recibir un mensaje o empezar un turno.
  on('prompt.submit', async ($, e, next) => {
    await mark($, true)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, background, () => false)
      await mark($, true)
    }
    return next(e)
  })

  // Cada herramienta renueva la marca, para que un turno largo no caduque.
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) await mark($, true)
    return next(e)
  })

  // Al acabar el turno, Claude Code dice qué trabajo sigue en segundo plano.
  on('classic.Stop', async ($, e, next) => {
    const isBusy = (e.background_tasks ?? []).length > 0
    await update($, background, () => isBusy)
    if (isBusy) {
      const now = await $.clock.now()
      await update($, backgroundSince, () => now)
    }
    await mark($, isBusy)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await mark($, await read($, background))
    return result
  })

  on('classic.SessionEnd', async ($, e, next) => {
    await mark($, false)
    return next(e)
  })

  // En el pie del cuadro de texto, junto a lo que dibujan los demás.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const drawn = await next(e)
    const list = await read($, working)
    // A 0 no se dibuja: en el pie no hay sitio para todo.
    if (list.length === 0) return drawn

    const show = async () => {
      const names = await titles($, list.map(chat => chat.id))
      // Un icono delante de cada chat los separa a la vista: 🔄 pensando, ⏳ en segundo plano.
      const lines = list.map((chat, i) => `${chat.isBackground ? '⏳' : '🔄'} ${corto(names[i] ?? '')}`)
      // La app enseña el aviso en una sola línea.
      $.ui.toast(lines.join('  '), { timeoutMs: 8000 })
    }

    return (
      <Box>
        {drawn}
        <Button key="tareas" plain onPress={show}>
          {ICONO}{' '}
          <Text color="claude" bold>{list.length}</Text>
        </Button>
      </Box>
    )
  })
}
