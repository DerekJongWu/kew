import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeTheme,
  Menu,
  type IpcMainEvent
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { closeCurrentVault, registerIpc, reopenLast } from './ipc'
import { createChangeHandler } from './changes'
import { menuTemplate } from './menu'
import { watchVault, type VaultWatcher } from './watcher'
import { CHANGED_CHANNEL, FLUSH_CHANNEL, FLUSHED_CHANNEL } from '../shared/methods'
import { createCloseGuard, requestFlush } from './flush'
import type { Vault } from '../core/vault'

let vault: Vault | null = null
let watcher: VaultWatcher | null = null

/** Local calendar date, YYYY-MM-DD. */
function today(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Tell every window something changed. The event carries the changed ids; the renderer re-queries
 * (including getState(), whose vault.schemaError reflects a broken .kew/schema.yaml).
 */
function broadcast(ids: string[]): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(CHANGED_CHANNEL, ids)
}

function setVault(v: Vault | null): void {
  vault = v
}

function stopWatcher(): void {
  void watcher?.close()
  watcher = null
}

const onChange = createChangeHandler(() => vault, broadcast)

function startWatcher(v: Vault): void {
  watcher = watchVault(v.root, (paths) => void onChange(v, paths))
}

/** Ask one window's renderer to save pending edits; resolves on its ack or after a timeout. */
function flushWindow(w: BrowserWindow): Promise<void> {
  if (w.isDestroyed()) return Promise.resolve()
  return requestFlush({
    send: () => w.webContents.send(FLUSH_CHANNEL),
    onAck: (cb) => {
      const listener = (e: IpcMainEvent): void => {
        if (e.sender === w.webContents) cb()
      }
      ipcMain.on(FLUSHED_CHANNEL, listener)
      return () => ipcMain.removeListener(FLUSHED_CHANNEL, listener)
    }
  })
}

// ⌘Q: hold the quit until every window has saved; then windows close without asking again
// (holding a window's close during a quit would cancel the quit).
let quitFlushed = false
const guardQuit = createCloseGuard(async () => {
  await Promise.all(BrowserWindow.getAllWindows().map(flushWindow))
})
app.on('before-quit', (e) =>
  guardQuit(e, () => {
    quitFlushed = true
    app.quit()
  })
)

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Kew',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    // Matches --bg in tokens.css so the window never flashes the wrong colour.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#13161b' : '#f7f8fa',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Closing the window: save pending edits first.
  const guardClose = createCloseGuard(() => flushWindow(mainWindow))
  mainWindow.on('close', (e) => {
    if (!quitFlushed) guardClose(e, () => mainWindow.close())
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https:')) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('app.kew.desktop')
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate({ dev: !app.isPackaged })))

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const handlers = registerIpc(ipcMain, () => vault, setVault, {
    userData: app.getPath('userData'),
    home: app.getPath('home'),
    today,
    chooseFolder: async () => {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    showInFolder: (p) => shell.showItemInFolder(p),
    onVaultOpened: startWatcher,
    onVaultClosed: stopWatcher,
    markOwnWrite: (files) => watcher?.markOwnWrite(files)
  })
  void reopenLast(handlers, app.getPath('userData')).finally(createWindow)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// Quit: stop the watcher (clears its debounce timer) and close the SQLite handle.
app.on('will-quit', () => closeCurrentVault(() => vault, setVault, { onVaultClosed: stopWatcher }))
