// The macOS application menu. Edit > Undo is not the 'undo' role: it asks the renderer, which
// undoes typing in a text field or, elsewhere, the latest vault change. Edit > Redo only redoes
// typing: a vault change is "redone" by undoing its undo entry.
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { MENU_REDO_CHANNEL, MENU_UNDO_CHANNEL } from '../shared/methods'

export function menuTemplate({ dev }: { dev: boolean }): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Kew',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: (_item, win) =>
            (win as BrowserWindow | undefined)?.webContents.send(MENU_UNDO_CHANNEL)
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: (_item, win) =>
            (win as BrowserWindow | undefined)?.webContents.send(MENU_REDO_CHANNEL)
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    ...(dev
      ? [
          {
            label: 'View',
            submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    { role: 'windowMenu' }
  ]
}
