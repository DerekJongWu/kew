import type { KewApi } from './api'

export type InvokeMethod = Exclude<keyof KewApi, 'onChanged' | 'onMenuUndo'>

/** Every KewApi method that crosses IPC as `kew:<name>` (onChanged and onMenuUndo are events, not calls). */
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
export type Envelope = { value: unknown } | { error: { name: string; message: string } }
