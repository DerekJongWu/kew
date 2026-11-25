/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain .mjs, no annotations */
// End-to-end smoke test of the PACKAGED app. Run via `npm run e2e [path/to/Kew.app]`.
// Launches Contents/MacOS/Kew with a temp --user-data-dir and a temp HOME and KEW_HOME (so "Documents/Kew Sample"
// lands in the temp folder, never the real one), and drives the window over the Chrome DevTools
// protocol (no extra dependencies). Asserts the vault files on disk after each step.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appPath = resolve(
  process.argv[2] ??
    process.env.KEW_APP ??
    join(here, '..', 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Kew.app')
)
const binary = join(appPath, 'Contents/MacOS/Kew')
if (!existsSync(binary)) throw new Error(`No packaged app at ${binary}. Run npm run dist first.`)

const tmp = mkdtempSync(join(tmpdir(), 'kew-e2e-'))
const home = join(tmp, 'home')
mkdirSync(join(home, 'Documents'), { recursive: true })
const vaultDir = join(home, 'Documents', 'Kew Sample')
// Guard: never let a run touch the real Documents folder.
const realKewFolders = ['Kew Sample', 'Kew'].map((n) => join(homedir(), 'Documents', n))
const realBefore = realKewFolders.filter((p) => existsSync(p))
if (realBefore.length)
  throw new Error(`Refusing to run: ${realBefore.join(', ')} already exists. Move it away first.`)
const port = 9300 + Math.floor(Math.random() * 500)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
function check(label, ok, detail = '') {
  if (!ok) throw new Error(`FAIL: ${label} ${detail}`)
  passed++
  console.log(`PASS  ${label}${detail ? ` (${detail})` : ''}`)
}

console.log(`app: ${appPath}\ntemp: ${tmp}`)
const child = spawn(
  binary,
  [`--user-data-dir=${join(tmp, 'user-data')}`, `--remote-debugging-port=${port}`],
  { env: { ...process.env, HOME: home, KEW_HOME: home }, stdio: ['ignore', 'pipe', 'ignore'] }
)
let stdout = ''
child.stdout.on('data', (d) => (stdout += d))
const exited = new Promise((r) => child.once('exit', (code, signal) => r({ code, signal })))

// --- minimal CDP client ---------------------------------------------------------------------
async function connect() {
  const end = Date.now() + 20_000
  while (Date.now() < end) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(200)
  }
  throw new Error('The packaged app did not open a window')
}
const ws = new WebSocket(await connect())
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = () => rej(new Error('DevTools connection failed'))
})
let nextId = 1
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result)
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = nextId++
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed')
  return r.result.value
}
const type = (text) => send('Input.insertText', { text })
const KEYS = { Return: [13, 'Enter'] }
async function key(k, { meta = false } = {}) {
  const [code, name] = KEYS[k] ?? [k.toUpperCase().charCodeAt(0), k]
  const base = { key: name, code: /^\d$/.test(k) ? `Digit${k}` : name, windowsVirtualKeyCode: code, modifiers: meta ? 4 : 0 }
  await send('Input.dispatchKeyEvent', { type: k === 'Return' ? 'keyDown' : 'rawKeyDown', ...base, ...(k === 'Return' ? { text: '\r' } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}
async function waitFor(selector, timeout = 15_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await js(`!!document.querySelector(${JSON.stringify(selector)})`)) return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${selector}`)
}
const clickText = (selector, text) =>
  js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true })()`)
async function waitFile(path, test, timeout = 8000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (existsSync(path) && test(readFileSync(path, 'utf8'))) return true
    await sleep(150)
  }
  return false
}
const note = (folder, name) => join(vaultDir, folder, `${name}.md`)
const read = (folder, name) => readFileSync(note(folder, name), 'utf8')

try {
  // 0. The app must say it honours KEW_HOME (a stale build would write into the real Documents).
  {
    const end = Date.now() + 15_000
    while (!stdout.includes('kew:home=') && Date.now() < end) await sleep(100)
    const line = /kew:home=(.*)/.exec(stdout)?.[1]?.trim()
    if (line !== home)
      throw new Error(`ABORT: app did not report kew:home=${home} (got ${line ?? 'nothing'}); is it a stale build?`)
    check('app honours KEW_HOME', true)
  }

  // 1. Onboarding -> sample vault
  await waitFor('.onboarding')
  check('onboarding shows on first launch', true)
  check('"Try the sample" clicked', await clickText('button', 'Try the sample'))
  await waitFor('.today-grid .row')
  check('sample vault created in the temp Documents', existsSync(join(vaultDir, 'Companies')), vaultDir)
  check('vault has companies and people', readdirSync(join(vaultDir, 'Companies')).length > 5 && readdirSync(join(vaultDir, 'People')).length > 3)

  // 2. Today shows follow-ups
  const followUps = await js(`(() => { const s = [...document.querySelectorAll('.today-grid .section')].find((s) => s.querySelector('.section-title')?.textContent.startsWith('Follow-ups due')); return s ? s.querySelectorAll('.row').length : 0 })()`)
  check('Today shows at least one follow-up', followUps >= 1, `${followUps} due`)

  // 3. Create company
  await key('3', { meta: true })
  await waitFor('.dtable-body')
  await js(`[...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'New company').click()`)
  await waitFor('[role="dialog"][aria-modal="true"] input')
  await sleep(300)
  await type('Smoke Test Co')
  await sleep(300)
  await key('Return')
  check('company file created', await waitFile(note('Companies', 'Smoke Test Co'), (t) => /^type: company/m.test(t) && /^name: Smoke Test Co/m.test(t)))

  // 4. Move it to Reached out on the board
  await key('2', { meta: true })
  await waitFor('.board .card')
  await sleep(500)
  const cardOk = await js(`(() => { const c = [...document.querySelectorAll('.board .card')].find((c) => c.querySelector('.card-name')?.textContent === 'Smoke Test Co'); if (!c) return false; c.querySelector('[aria-expanded]').click(); return true })()`)
  check('new company card is on the board', cardOk)
  await waitFor('.popover .menu-item')
  check('"Reached out" chosen', await clickText('.popover .menu-item', 'Reached out'))
  check('status written to the note', await waitFile(note('Companies', 'Smoke Test Co'), (t) => /^pipeline_status: reached-out/m.test(t)), 'pipeline_status: reached-out')

  // 5. Log a send to a sample person
  const person = 'Mara Quintero'
  const before = read('People', person)
  await key('K', { meta: true })
  await waitFor('.cmdk-input')
  await type(person)
  await sleep(700)
  check('person found in the command bar', await js(`(() => { const l = [...document.querySelectorAll('.cmdk [cmdk-item] .cmdk-label')].find((e) => e.textContent === ${JSON.stringify(person)}); if (!l) return false; l.closest('[cmdk-item]').click(); return true })()`))
  await waitFor('.outreach-card')
  await sleep(400)
  check('"Log send" clicked', await clickText('.outreach-card button', 'Log send'))
  await waitFor('.outreach-card .inline-form input')
  await type('Smoke test send')
  await sleep(300)
  await key('Return')
  check('send logged as a line in the person note', await waitFile(note('People', person), (t) => /- \d{4}-\d{2}-\d{2}, out · \w+: Smoke test send/.test(t)))

  // 6. Undo the send
  const entries = await js(`window.kew.history(1)`)
  const top = entries.value[0]
  check('history top entry is the send', /send/i.test(top.message) && top.undoable, top.message)
  const undone = await js(`window.kew.undo(${JSON.stringify(top.id)})`)
  check('undo accepted', !undone.error)
  check('person note restored byte for byte', await waitFile(note('People', person), (t) => t === before))

  // 7. Quit cleanly with an edit still pending (the flush path)
  await js(`document.querySelector('.cm-content')?.focus()`)
  await type('Typed just before quitting. ')
  ws.send(JSON.stringify({ id: nextId++, method: 'Browser.close' })) // no reply: the app goes away
  const result = await Promise.race([exited, sleep(15_000).then(() => null)])
  check('app exited on its own', result !== null, result ? `code ${result.code}` : 'still running')
  check('pending edit was saved before exit', read('People', person).includes('Typed just before quitting.'))

  check('real Documents has no new Kew folders', !realKewFolders.some((p) => existsSync(p)))

  console.log(`\nE2E PASS (${passed} checks)`)
} catch (e) {
  console.error(String(e.message ?? e))
  if (realKewFolders.some((p) => existsSync(p))) console.error('WARNING: a Kew folder appeared in the real Documents; remove it.')
  console.error('E2E FAIL')
  process.exitCode = 1
} finally {
  if (child.exitCode === null) child.kill('SIGKILL')
  rmSync(tmp, { recursive: true, force: true })
}
