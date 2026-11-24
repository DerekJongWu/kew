import type { KewApi } from './api'

export type InvokeMethod = Exclude<keyof KewApi, 'onChanged' | 'onMenuUndo' | 'onFlush'>

/** Every KewApi method that crosses IPC as `kew:<name>` (onChanged, onMenuUndo and onFlush are events, not calls). */
export const KEW_METHODS = [
  'getState',
  'planSetup',
  'createVault',
  'openVault',
  'chooseFolder',
  'today',
  'list',
  'get',
  'search',
  'schema',
  'views',
  'history',
  'createRecord',
  'setFields',
  'setBody',
  'rename',
  'logOutreach',
  'weMet',
  'passCompany',
  'snooze',
  'changeSchema',
  'saveViews',
  'undo',
  'rebuildIndex',
  'openInFinder'
] as const satisfies readonly InvokeMethod[]

/** Compile-time exhaustiveness: errors if a KewApi method is missing from KEW_METHODS. */
type Missing = Exclude<InvokeMethod, (typeof KEW_METHODS)[number]>
export const _exhaustive: [Missing] extends [never] ? true : never = true

export const CHANGED_CHANNEL = 'kew:changed'
/** Sent by Edit > Undo (⌘Z) in the app menu. */
export const MENU_UNDO_CHANNEL = 'kew:menu-undo'
/** Main → renderer before a window closes or the app quits: save pending edits. */
export const FLUSH_CHANNEL = 'kew:flush'
/** Renderer → main: pending edits are saved (or failed); main may close. */
export const FLUSHED_CHANNEL = 'kew:flushed'
export interface ErrorInfo {
  name: string
  message: string
  /** Set on FolderNotEmptyError: the folder that wasn't empty. */
  path?: string
}
export type Envelope<T = unknown> = { value: T } | { error: ErrorInfo }

/**
 * What the preload exposes as window.kew. Methods return the envelope unchanged: an Error built in
 * the preload loses its name crossing the context bridge, so the renderer rebuilds it (api.ts).
 */
export type KewBridge = {
  [M in InvokeMethod]: (
    ...args: Parameters<KewApi[M]>
  ) => Promise<Envelope<Awaited<ReturnType<KewApi[M]>>>>
} & Pick<KewApi, 'onChanged' | 'onMenuUndo' | 'onFlush'>
