export type Chat = { id: string; isBackground: boolean }

declare module 'claude-code' {
  interface PluginState {
    working: { working: Shaped<Chat[]>; background: boolean; backgroundSince: number }
  }
}
