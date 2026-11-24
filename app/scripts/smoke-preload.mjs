// Loads the BUILT preload in a sandboxed window (same webPreferences as the real one) and
// checks window.kew was exposed. Run via `npm run smoke:preload`.
import { app, BrowserWindow } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const preload = join(dirname(fileURLToPath(import.meta.url)), '../out/preload/index.js')

app.whenReady().then(async () => {
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
  console.log(result)
  app.exit(result === 'object|function|function' ? 0 : 1)
})
