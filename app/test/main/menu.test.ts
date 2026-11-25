import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { menuTemplate } from '../../src/main/menu'
import { MENU_REDO_CHANNEL, MENU_UNDO_CHANNEL } from '../../src/shared/methods'

const items = (t: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] =>
  (t.find((m) => m.label === label)?.submenu ?? []) as MenuItemConstructorOptions[]

describe('menuTemplate', () => {
  it('routes Edit > Undo (⌘Z) to the renderer instead of the role', () => {
    const undo = items(menuTemplate({ dev: false }), 'Edit').find((i) => i.label === 'Undo')!
    expect(undo.role).toBeUndefined()
    expect(undo.accelerator).toBe('CmdOrCtrl+Z')
    const send = vi.fn()
    ;(undo.click as (...a: unknown[]) => void)(undo, { webContents: { send } })
    expect(send).toHaveBeenCalledWith(MENU_UNDO_CHANNEL)
  })
  it('routes Edit > Redo (⇧⌘Z) to the renderer instead of the role', () => {
    const redo = items(menuTemplate({ dev: false }), 'Edit').find((i) => i.label === 'Redo')!
    expect(redo.role).toBeUndefined()
    expect(redo.accelerator).toBe('CmdOrCtrl+Shift+Z')
    const send = vi.fn()
    ;(redo.click as (...a: unknown[]) => void)(redo, { webContents: { send } })
    expect(send).toHaveBeenCalledWith(MENU_REDO_CHANNEL)
  })
  it('keeps clipboard as roles', () => {
    const roles = items(menuTemplate({ dev: false }), 'Edit')
      .map((i) => i.role)
      .filter(Boolean)
    expect(roles).toEqual(expect.arrayContaining(['cut', 'copy', 'paste', 'selectAll']))
  })
  it('has no View menu (reload, devtools) in production, but has one in dev', () => {
    expect(menuTemplate({ dev: false }).some((m) => m.label === 'View')).toBe(false)
    expect(items(menuTemplate({ dev: true }), 'View').map((i) => i.role)).toContain(
      'toggleDevTools'
    )
  })
})
