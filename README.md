# working

Muestra en el pie del cuadro de escribir de Claude Code cuántos chats están trabajando ahora mismo, por ejemplo `🔄 3`. El pie no se mueve al hacer scroll, así que lo ves aunque estés leyendo más arriba o con la barra lateral cerrada.

- Cuenta todos los chats que están pensando, también los laterales y el tuyo.
- También cuenta los que terminaron su turno pero dejaron trabajo en segundo plano (un comando, un subagente, un workflow).
- No cuenta los que esperan tu permiso o tu respuesta, si tienes instalado [pendientes](https://github.com/manuelfp88/pendientes): esos salen allí.
- A 0 no se muestra.
- Al pulsarlo, un aviso con los chats: `🔄` pensando, `⏳` en segundo plano, `💬` chat lateral.

Cada chat deja una marca en `~/.claude/trabajando` mientras trabaja. Solo cuenta chats que tengan el mod cargado, y los títulos salen de archivos internos de la app de escritorio de Claude para macOS, sin documentar: una actualización de la app podría cambiarlos.

Antes se llamaba `tareas` y contaba las tareas en segundo plano de un solo chat.

## Instalación

En una sesión de Claude Code en la terminal:

```
/plugin install working --marketplace manuelfp88/working
```

Responde `y` para añadir el catálogo y elige dónde instalarlo.

## Licencia

MIT
