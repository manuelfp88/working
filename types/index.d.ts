export type Task = { id: string; type: string; description: string }

declare module 'claude-code' {
  interface PluginState {
    tareas: { agents: Shaped<Task[]>; others: Shaped<Task[]> }
  }
}
