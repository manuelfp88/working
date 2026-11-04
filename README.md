# tareas

Muestra en el pie del cuadro de escribir de Claude Code cuántas tareas en segundo plano hay activas, por ejemplo `⚙️ 2`. El pie no se mueve al hacer scroll, así que lo ves aunque estés leyendo más arriba.

- Cuenta subagentes, comandos, Monitor y workflows de la sesión. No cuenta las de otras sesiones.
- Con 0 tareas se ve en gris; con alguna activa, resaltado.
- Al pulsarlo, muestra la lista en un aviso.

Los subagentes se miran cada 2 segundos y los comandos se siguen por sus avisos de inicio y fin. Monitor y workflows se actualizan al terminar cada turno. Los subagentes en primer plano también cuentan mientras duran.

Combina bien con [semanal](https://github.com/manuelfp88/semanal) y [compactor](https://github.com/manuelfp88/compactor).

## Instalación

En una sesión de Claude Code en la terminal:

```
/plugin install tareas --marketplace manuelfp88/tareas
```

Responde `y` para añadir el catálogo y elige dónde instalarlo.

## Licencia

MIT
