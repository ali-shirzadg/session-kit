/** Whether the idle rule is on; kept by the session so a reload does not turn it back on. */
export type IdleCompactSettings = { isOn: boolean }

declare module 'claude-code' {
  interface PluginState {
    'idle-compact': { settings: IdleCompactSettings }
  }
}
