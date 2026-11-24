/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain .mjs, no annotations */
// Screenshots of the BUILT app for design review. Run via `npm run screenshot`.
// Starts the real main entry with a fresh temp userData folder, creates a sample vault in a
// temp folder through window.kew, then captures onboarding first, then Today (light, dark) and the ⌘K command bar.
import { app, BrowserWindow, nativeTheme } from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
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

const js = (win, code) => win.webContents.executeJavaScript(code)
/** Click the first element matching `selector` whose text is `text` (inside `scope`, if given). */
const clickText = (win, selector, text, scope = 'document') =>
  js(
    win,
    `(() => { const el = [...${scope}.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true })()`
  )
const log = (...a) => console.log('CHECK', ...a)
const findNote = (name) => {
  const dir = join(vaultDir, 'Companies')
  return join(dir, readdirSync(dir).find((f) => f === name + '.md'))
}

async function pipeline(win) {
  key(win, '2', ['meta'])
  await waitFor(win, '.board .card')
  win.focus()
  await shot(win, 'pipeline-board-light.png')
  nativeTheme.themeSource = 'dark'
  await shot(win, 'pipeline-board-dark.png')
  nativeTheme.themeSource = 'light'

  // Move a card with the "Move to…" menu: the note file changes, history has the entry, undo restores it.
  const name = await js(win, `document.querySelector('.col[aria-label^="New"] .card-name').textContent`)
  const before = readFileSync(findNote(name), 'utf8')
  await js(win, `document.querySelector('.col[aria-label^="New"] .card [aria-expanded]').click()`)
  await waitFor(win, '.popover .menu-item')
  await clickText(win, '.popover .menu-item', 'Pursuing')
  await sleep(800)
  const after = readFileSync(findNote(name), 'utf8')
  log('moved', name, 'file changed:', before !== after, '| status line now:', /pipeline_status: pursuing/.test(after))
  const hist = (await js(win, 'window.kew.history(3)')).value
  log('history top:', hist[0].message, 'undoable:', hist[0].undoable)
  await js(win, `window.kew.undo(${JSON.stringify(hist[0].id)})`)
  await sleep(800)
  log('undo restored file:', readFileSync(findNote(name), 'utf8') === before)

  // Drag with the pointer: New -> Pursuing.
  const box = (sel) => js(win, `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 30 } })()`)
  const from = await box('.col[aria-label^="New"] .card-name')
  const to = await box('.col[aria-label^="Pursuing"]')
  const mouse = (type, p) => win.webContents.sendInputEvent({ type, x: Math.round(p.x), y: Math.round(p.y), button: 'left', clickCount: 1 })
  mouse('mouseMove', from); mouse('mouseDown', from)
  for (let i = 1; i <= 8; i++) { mouse('mouseMove', { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }); await sleep(30) }
  mouse('mouseUp', to)
  await sleep(900)
  const dragged = readFileSync(findNote(name), 'utf8')
  log('drag moved card:', /pipeline_status: pursuing/.test(dragged))
  const h2 = (await js(win, 'window.kew.history(3)')).value
  await js(win, `window.kew.undo(${JSON.stringify(h2[0].id)})`)
  await sleep(800)

  // Views: switch tabs, add a filter, reload, filter persists.
  await clickText(win, '.tab', 'All companies')
  await sleep(500)
  await waitFor(win, '.dtable-body')
  await shot(win, 'pipeline-table-light.png')
  await clickText(win, '.filter-bar button', 'Source')
  await waitFor(win, '.filter-item')
  await clickText(win, '.filter-item', 'Intro')
  await sleep(800)
  const rows = await js(win, `document.querySelectorAll('.dtable-body').length`)
  log('rows with Source=Intro:', rows)
  const views = readFileSync(join(vaultDir, '.kew/views.yaml'), 'utf8')
  log('views.yaml has filter:', /source:\s*\n\s*- intro/.test(views))
  win.webContents.reload()
  await waitFor(win, '.today-grid .row')
  key(win, '2', ['meta'])
  await waitFor(win, '.tabs')
  await clickText(win, '.tab', 'All companies')
  await sleep(600)
  log('after reload, filter button:', await js(win, `[...document.querySelectorAll('.filter-bar button')].map(b => b.textContent).join(' / ')`))
  log('after reload, rows:', await js(win, `document.querySelectorAll('.dtable-body').length`))
  await clickText(win, '.tab', 'Inbound')
  await waitFor(win, '.board .card')
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

  // Recent vaults: one folder that exists, one that doesn't (settings.json is read on each getState).
  const existing = join(tmp, 'Fund III Deals')
  mkdirSync(existing)
  writeFileSync(
    join(tmp, 'user-data', 'settings.json'),
    JSON.stringify({ lastVault: null, recent: [existing, join(tmp, 'Old Vault')] })
  )
  win.webContents.reload()
  await waitFor(win, '.recent-row')
  await shot(win, 'onboarding-recent-light.png')

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

  await pipeline(win)

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
