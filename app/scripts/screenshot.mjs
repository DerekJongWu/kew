/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain .mjs, no annotations */
// Screenshots of the BUILT app for design review. Run via `npm run screenshot`.
// Starts the real main entry with a fresh temp userData folder, creates a sample vault in a
// temp folder through window.kew, then captures onboarding first, then Today (light, dark) and the ⌘K command bar.
import { app, BrowserWindow, nativeTheme } from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(
  process.env.KEW_SCREENSHOT_DIR ??
    join(here, '../../.superpowers/sdd/2026-11-24-kew-core-loop/screens')
)
const tmp = mkdtempSync(join(tmpdir(), 'kew-shot-'))
const vaultDir = join(tmp, 'Kew Sample')

app.setPath('userData', join(tmp, 'user-data')) // same effect as --user-data-dir
nativeTheme.themeSource = 'light'
createRequire(import.meta.url)(join(here, '../out/main/index.js'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(win, selector, timeout = 10_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (
      await win.webContents.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`
      )
    )
      return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${selector}`)
}

async function shot(win, name) {
  await sleep(400) // let the theme switch and animations settle
  const image = await win.webContents.capturePage()
  writeFileSync(join(outDir, name), image.toPNG())
  console.log('saved', join(outDir, name))
}

function key(win, keyCode, modifiers = []) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  win.webContents.sendInputEvent({ type: 'char', keyCode, modifiers })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
}

async function main() {
  await app.whenReady()
  mkdirSync(outDir, { recursive: true })
  let win = BrowserWindow.getAllWindows()[0]
  while (!win) {
    await sleep(100)
    win = BrowserWindow.getAllWindows()[0]
  }
  if (win.webContents.isLoading())
    await new Promise((r) => win.webContents.once('did-finish-load', r))
  // First launch: fresh user data and no vault, so the welcome screen shows.
  win.setSize(1280, 800)
  await waitFor(win, '.onboarding .path')
  win.focus()
  await shot(win, 'onboarding-light.png')
  nativeTheme.themeSource = 'dark'
  await shot(win, 'onboarding-dark.png')
  nativeTheme.themeSource = 'light'

  await win.webContents.executeJavaScript(
    `window.kew.createVault('sample', ${JSON.stringify(vaultDir)})`
  )
  win.setSize(1280, 800)
  win.webContents.reload()
  await waitFor(win, '.today-grid .row')
  win.focus()

  await shot(win, 'today-light.png')
  nativeTheme.themeSource = 'dark'
  await shot(win, 'today-dark.png')
  nativeTheme.themeSource = 'light'

  key(win, 'K', ['meta'])
  await waitFor(win, '.cmdk-input')
  for (const c of 'pe') key(win, c)
  await waitFor(win, '.cmdk [cmdk-group-heading]')
  await sleep(300) // search results arrive asynchronously
  await shot(win, 'command-bar-light.png')
}

main().then(
  () => app.exit(0),
  (e) => {
    console.error(e)
    app.exit(1)
  }
)
