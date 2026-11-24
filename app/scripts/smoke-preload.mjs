// Loads the BUILT preload in a sandboxed window (same webPreferences as the real one) and
// checks window.kew was exposed. Run via `npm run smoke:preload`.
import { app, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const preload = join(dirname(fileURLToPath(import.meta.url)), '../out/preload/index.js')

app.whenReady().then(async () => {
  // Stand-in for the main process's no-vault error envelope (same shape serializeError returns).
  ipcMain.handle('kew:today', () => ({
    error: { name: 'NoVaultError', message: 'No vault is open' }
  }))
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  let result = 'error'
  try {
    await win.loadURL('data:text/html,<title>smoke</title>')
    result = await win.webContents.executeJavaScript(
      'typeof window.kew + "|" + typeof window.kew.today + "|" + typeof window.kew.onMenuUndo'
    )
  } catch (e) {
    result = 'error: ' + e.message
  }
  let envelope = 'skipped'
  if (result === 'object|function|function') {
    // The bridge must hand back the envelope untouched (a thrown Error would lose its name).
    envelope = await win.webContents.executeJavaScript(
      'window.kew.today().then((r) => r.error && r.error.name, (e) => "threw:" + e.name)'
    )
  }
  console.log(result, envelope)
  app.exit(result === 'object|function|function' && envelope === 'NoVaultError' ? 0 : 1)
})
