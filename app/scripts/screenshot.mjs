/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain .mjs, no annotations */
// Screenshots of the BUILT app for design review. Run via `npm run screenshot`.
// Starts the real main entry with a fresh temp userData folder, creates a sample vault in a
// temp folder through window.kew, then captures onboarding first, then Today (light, dark) and the ⌘K command bar.
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
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

const notesIn = (folder) => readdirSync(join(vaultDir, folder)).filter((f) => f.endsWith('.md'))
const readNote = (folder, file) => readFileSync(join(vaultDir, folder, file), 'utf8')
const openNew = async (win, label) => {
  await js(win, `(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(label)}); b.focus(); b.click() })()`)
  await waitFor(win, '[role="dialog"][aria-modal="true"] input')
  await sleep(200)
}
const dialogFocus = (win) => js(win, `document.activeElement.id ? document.activeElement.labels?.[0]?.textContent : document.activeElement.tagName`)
const submit = async (win) => {
  await sleep(200) // let typed text reach React state before Return
  key(win, 'Return')
}
/** Pick the first relation-picker result for `label` after typing `text`. */
async function pickRelation(win, label, text) {
  await js(win, `[...document.querySelectorAll('.relpick-input')].find((i) => i.labels[0].textContent === ${JSON.stringify(label)}).focus()`)
  if (text) win.webContents.insertText(text)
  await waitFor(win, '.relpick-opt')
  await sleep(500)
  key(win, 'Return')
  await sleep(200)
}

async function lists(win) {
  key(win, '3', ['meta'])
  await waitFor(win, '.dtable-body')
  await shot(win, 'list-companies-light.png')
  nativeTheme.themeSource = 'dark'
  await shot(win, 'list-companies-dark.png')
  nativeTheme.themeSource = 'light'
  key(win, '4', ['meta'])
  await waitFor(win, '.dtable-body')
  await shot(win, 'list-people-light.png')

  // Company: name + website. The file appears with id/type/name and the template body.
  key(win, '3', ['meta'])
  await waitFor(win, '.dtable-body')
  await openNew(win, 'New company')
  log('dialog focus starts on:', await dialogFocus(win))
  win.webContents.insertText('Zeta Test Co')
  key(win, 'Tab')
  win.webContents.insertText('zeta-test.example')
  await shot(win, 'new-record-dialog-light.png')
  await submit(win)
  await waitFor(win, '.record, .screen-title')
  await sleep(800)
  log('company file:', notesIn('Companies').includes('Zeta Test Co.md'))
  const co = readNote('Companies', 'Zeta Test Co.md')
  log('company frontmatter has id/type/name/website:', /^id: /m.test(co), /^type: company/m.test(co), /^name: Zeta Test Co/m.test(co), /website: .*zeta-test/.test(co))
  log('company body (first lines):', JSON.stringify(co.split('---').slice(2).join('---').slice(0, 80)))

  // Duplicate by website domain of a sample company.
  const sample = notesIn('Companies').find((f) => /^website: .+/m.test(readNote('Companies', f)) && f !== 'Zeta Test Co.md')
  const site = /^website: (.+)$/m.exec(readNote('Companies', sample))[1].replace(/['"]/g, '')
  log('sample company', sample, 'website', site)
  key(win, '3', ['meta'])
  await waitFor(win, '.dtable-body')
  await openNew(win, 'New company')
  win.webContents.insertText('A Brand New Name')
  key(win, 'Tab')
  win.webContents.insertText(site)
  log('form values before submit:', await js(win, `[...document.querySelectorAll('[role=dialog] input')].map((i) => i.value)`))
  await submit(win)
  await waitFor(win, '.dupes')
  await sleep(300)
  log('dupes shown:', await js(win, `document.querySelector('.dupes').textContent`))
  await shot(win, 'new-record-duplicate-light.png')
  const before = notesIn('Companies').length
  await clickText(win, '.form-actions button', 'Create anyway')
  await sleep(1000)
  log('create anyway added a file:', notesIn('Companies').length === before + 1, notesIn('Companies').includes('A Brand New Name.md'))

  // Person with a company.
  key(win, '4', ['meta'])
  await waitFor(win, '.dtable-body')
  await openNew(win, 'New person')
  win.webContents.insertText('Test Person')
  await pickRelation(win, 'Company', 'Zeta')
  await submit(win)
  await sleep(1000)
  log('person file:', /company: .*Zeta Test Co/.test(readNote('People', 'Test Person.md')), /type: person/.test(readNote('People', 'Test Person.md')))

  // Meeting: name is built from date + company + type.
  key(win, '5', ['meta'])
  await waitFor(win, '.dtable-body')
  await openNew(win, 'New meeting')
  await pickRelation(win, 'Company', 'Zeta')
  await js(win, `(() => { const s = document.querySelector('select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'intro'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await sleep(200)
  log('meeting name field:', await js(win, `document.querySelector('[role=dialog] input.field[required]').value`))
  await submit(win)
  await sleep(1000)
  log('meeting files with Zeta:', notesIn('Meetings').filter((f) => f.includes('Zeta')))

  // Theme and research.
  key(win, '6', ['meta'])
  await waitFor(win, '.dtable-body, .empty')
  await openNew(win, 'New theme')
  win.webContents.insertText('Test Theme')
  await submit(win)
  await sleep(1000)
  log('theme file:', notesIn('Themes').includes('Test Theme.md'), /type: theme/.test(readNote('Themes', 'Test Theme.md')))
  key(win, '7', ['meta'])
  await waitFor(win, '.dtable-body, .empty')
  await openNew(win, 'New research')
  win.webContents.insertText('Test Research')
  await pickRelation(win, 'About', 'Zeta')
  await submit(win)
  await sleep(1000)
  log('research file about:', /about:[\s\S]*Zeta Test Co/.test(readNote('Research', 'Test Research.md')))

  // Validation, Escape and focus return.
  key(win, '3', ['meta'])
  await waitFor(win, '.dtable-body')
  await openNew(win, 'New company')
  win.webContents.insertText('Bad/Name')
  await submit(win)
  await sleep(300)
  log('inline error:', await js(win, `document.querySelector('.form-error')?.textContent`))
  key(win, 'Escape')
  await sleep(300)
  log('dialog closed:', !(await js(win, `!!document.querySelector('[role=dialog]')`)), '| focus back on:', await js(win, `document.activeElement.textContent`))
  // ⌘N opens it; ⌘K "New person" opens the same dialog.
  key(win, 'N', ['meta'])
  await waitFor(win, '[role="dialog"][aria-modal="true"]')
  log('cmd+N dialog:', await js(win, `document.querySelector('.dialog-title').textContent`))
  key(win, 'Escape')
  await sleep(300)
  key(win, 'K', ['meta'])
  await waitFor(win, '.cmdk-input')
  win.webContents.insertText('new person')
  await sleep(300)
  key(win, 'Return')
  await waitFor(win, '[role="dialog"][aria-modal="true"]')
  log('cmd+K dialog:', await js(win, `document.querySelector('.dialog-title').textContent`))
  key(win, 'Escape')
  await sleep(300)
}

const readAny = (folder, name) => readFileSync(join(vaultDir, folder, name + '.md'), 'utf8')
const writeAny = (folder, name, text) => writeFileSync(join(vaultDir, folder, name + '.md'), text)
const historyTop = async (win, n = 1) => (await js(win, `window.kew.history(${n})`)).value
const undoTop = async (win) => {
  const [h] = await historyTop(win)
  const res = await js(win, `window.kew.undo(${JSON.stringify(h.id)})`)
  await sleep(800)
  return { message: h.message, ok: !res.error }
}
/** Open a record with ⌘K: type its name, Return opens the top hit. */
async function openRecord(win, name) {
  key(win, 'K', ['meta'])
  await waitFor(win, '.cmdk-input')
  win.webContents.insertText(name)
  await sleep(600)
  // Click the hit with exactly this name (the top hit can be a meeting named after it).
  const ok = await js(win, `(() => { const l = [...document.querySelectorAll('.cmdk [cmdk-item] .cmdk-label')].find((e) => e.textContent === ${JSON.stringify(name)}); if (!l) return false; l.closest('[cmdk-item]').click(); return true })()`)
  if (!ok) throw new Error(`No ⌘K hit named ${name}`)
  await waitFor(win, '.record .props')
  await sleep(400)
}
/** Set a native <select>/<input> value inside the property row labelled `label` the way a user would. */
const setProp = (win, label, value, event = 'change') =>
  js(win, `(() => {
    const row = [...document.querySelectorAll('.prop')].find((r) => r.querySelector('.prop-label')?.textContent === ${JSON.stringify(label)})
    const el = row.querySelector('select, input')
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }))
    return true
  })()`)
const editorText = (win) => js(win, `document.querySelector('.cm-content').innerText`)

async function records(win) {
  // Company page.
  await openRecord(win, 'Pinemoth Analytics')
  await waitFor(win, '.cm-content')
  await shot(win, 'record-company-light.png')
  nativeTheme.themeSource = 'dark'
  await shot(win, 'record-company-dark.png')
  nativeTheme.themeSource = 'light'
  const co = () => readAny('Companies', 'Pinemoth Analytics')
  const original = co()

  // Select field: Stage → Seed. File changes, history has it, undo restores.
  await setProp(win, 'Stage', 'seed')
  await sleep(800)
  log('select: stage written:', /^stage: seed$/m.test(co()), '| history:', (await historyTop(win))[0].message)
  const u1 = await undoTop(win)
  log('select: undo', u1.message, 'restored:', co() === original)

  // Relation field: Referred by → Nadia Ferreira.
  await js(win, `[...document.querySelectorAll('.relpick-input')].find((i) => i.labels[0].textContent === 'Referred by').focus()`)
  win.webContents.insertText('Nadia')
  await waitFor(win, '.relpick-opt')
  await sleep(400)
  key(win, 'Return')
  await sleep(900)
  log('relation: referred_by written:', /^referred_by: .*\[\[Nadia Ferreira\]\]/m.test(co()), '| history:', (await historyTop(win))[0].message)
  const u2 = await undoTop(win)
  log('relation: undo', u2.message, 'restored:', co() === original)

  // Date field: Reach out on.
  await setProp(win, 'Reach out on', '2026-12-03', 'input')
  await sleep(900)
  log('date: reach_out_on written:', /^reach_out_on: 2026-12-03$/m.test(co()), '| history:', (await historyTop(win))[0].message)
  const u3 = await undoTop(win)
  log('date: undo', u3.message, 'restored:', co() === original)

  // Add a custom property.
  await clickText(win, '.section-head button', 'Add a property')
  await waitFor(win, '[role="dialog"][aria-modal="true"] input')
  win.webContents.insertText('Board seat')
  await js(win, `(() => { const s = document.querySelector('[role=dialog] select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'checkbox'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await sleep(300)
  await shot(win, 'record-addproperty-light.png')
  await clickText(win, '[role=dialog] button', 'Add property')
  await sleep(1000)
  const schemaYaml = readFileSync(join(vaultDir, '.kew/schema.yaml'), 'utf8')
  log('add property: schema has board_seat:', /key: board_seat/.test(schemaYaml), '| panel shows it:', await js(win, `[...document.querySelectorAll('.prop-label')].some((l) => l.textContent === 'Board seat')`))
  await js(win, `[...document.querySelectorAll('.prop')].find((r) => r.querySelector('.prop-label')?.textContent === 'Board seat').querySelector('input').click()`)
  await sleep(800)
  log('add property: checkbox saved:', /^board_seat: true$/m.test(co()))

  // Editor: type, autosave after a pause, undo in the editor, undo in history.
  key(win, 'E', ['meta'])
  await sleep(200)
  log('cmd+E focuses editor:', await js(win, `document.activeElement.classList.contains('cm-content')`))
  const beforeEdit = co()
  win.webContents.insertText('Kew harness line. ')
  await sleep(300)
  log('autosave not yet (300 ms):', co() === beforeEdit)
  await sleep(1200)
  log('autosave after pause:', co().includes('Kew harness line.'), '| history:', (await historyTop(win))[0].message)
  win.webContents.send('kew:menu-undo') // Edit > Undo (⌘Z) while the editor has focus
  await sleep(1400)
  log('menu undo in editor removed text and saved:', !(await editorText(win)).includes('Kew harness line.'), !co().includes('Kew harness line.'))
  key(win, 'Z', ['meta', 'shift']) // CodeMirror's redo key, sent straight to the page
  await sleep(1400)
  log('redo saved again:', co().includes('Kew harness line.'))
  key(win, 'Escape')
  await sleep(300)
  log('Escape blurs editor:', !(await js(win, `document.activeElement.classList.contains('cm-content')`)))
  const u4 = await undoTop(win)
  log('history undo of body edit:', u4.message, 'file back to before redo:', !co().includes('Kew harness line.'))
  await sleep(800)
  log('editor reloaded after history undo:', !(await editorText(win)).includes('Kew harness line.'))

  // [[ autocomplete inserts a link.
  key(win, 'E', ['meta'])
  await sleep(200)
  win.webContents.insertText('See [[Orch')
  await waitFor(win, '.cm-tooltip-autocomplete li')
  await sleep(300)
  log('autocomplete options:', await js(win, `[...document.querySelectorAll('.cm-tooltip-autocomplete li')].map((l) => l.textContent).join(' / ')`))
  key(win, 'Return')
  await sleep(1500)
  log('autocomplete inserted link:', co().includes('See [[Orchard Signal]]'))
  key(win, 'Escape')

  // Rename a linked record: every link to it is rewritten.
  await openRecord(win, 'Orchard Signal')
  await js(win, `(() => { const i = document.querySelector('.record-title'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Orchard Signal Works'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(200)
  key(win, 'Return')
  await sleep(1500)
  log('rename: file moved:', notesIn('Companies').includes('Orchard Signal Works.md'), !notesIn('Companies').includes('Orchard Signal.md'))
  log('rename: person link updated:', /\[\[Orchard Signal Works\]\]/.test(readAny('People', 'Callum Reyes')))
  log('rename: Pinemoth body link updated:', co().includes('[[Orchard Signal Works]]'))
  log('rename: title shows:', await js(win, `document.querySelector('.record-title').value`), '| history:', (await historyTop(win))[0].message)
  // Name rule shown inline.
  await js(win, `(() => { const i = document.querySelector('.record-title'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Bad/Name'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(200)
  key(win, 'Return')
  await sleep(300)
  log('rename: bad name error:', await js(win, `document.querySelector('#record-title-err')?.textContent`))
  key(win, 'Escape')

  // Theme page lists its companies.
  await openRecord(win, 'Clinical Back Office')
  log('theme companies:', await js(win, `[...document.querySelectorAll('.section')].find((s) => s.querySelector('.section-title').textContent.startsWith('Companies'))?.querySelectorAll('.row').length`))

  // Person page.
  await openRecord(win, 'Mara Quintero')
  await waitFor(win, '.outreach-card')
  await shot(win, 'record-person-light.png')
  nativeTheme.themeSource = 'dark'
  await shot(win, 'record-person-dark.png')
  nativeTheme.themeSource = 'light'
  const pe = () => readAny('People', 'Mara Quintero')
  await clickText(win, '.outreach-card button', 'Log send')
  await waitFor(win, '.outreach-card .inline-form input')
  win.webContents.insertText('Harness follow-up note')
  await sleep(200)
  key(win, 'Return')
  await sleep(1200)
  log('log send: file has line:', /- \d{4}-\d{2}-\d{2}, out · \w+: Harness follow-up note/.test(pe()), '| history:', (await historyTop(win))[0].message)
  log('log send: log list shows it:', await js(win, `document.querySelector('.log-item .timeline-text')?.textContent`))
  log('log send: editor shows appended log line:', (await editorText(win)).includes('Harness follow-up note'))

  // Outside edit with no local edits: the editor reloads.
  writeAny('People', 'Mara Quintero', pe() + '\nAdded in another editor.\n')
  await sleep(2000)
  log('outside edit, no local edits → reloaded:', (await editorText(win)).includes('Added in another editor.'), '| conflict bar:', await js(win, `!!document.querySelector('.editor-conflict')`))

  // Outside edit with local edits: the conflict bar, then Keep mine keeps both in history.
  key(win, 'E', ['meta'])
  await sleep(200)
  win.webContents.insertText('Local words. ')
  writeAny('People', 'Mara Quintero', pe() + '\nSecond outside edit.\n')
  for (let i = 0; i < 8; i++) {
    await sleep(300)
    win.webContents.insertText('.') // keep typing so autosave waits
  }
  await sleep(300)
  log('conflict bar shown:', await js(win, `!!document.querySelector('.editor-conflict')`))
  await shot(win, 'record-conflict-light.png')
  await clickText(win, '.editor-conflict button', 'Keep mine')
  await sleep(1500)
  log('keep mine: file has local words:', pe().includes('Local words.'), '| outside edit gone from file:', !pe().includes('Second outside edit.'))
  const hist = await historyTop(win, 4)
  log('keep mine: history:', hist.map((h) => `${h.kind}:${h.message}`).join(' | '))
  const ext = hist.find((h) => h.kind === 'external')
  log('keep mine: outside version committed to history:', !!ext && ext.files.some((f) => f.includes('Mara Quintero')))
  key(win, 'Escape')
}

/** What main does before a window closes: ask the renderer to save, wait for its ack. */
async function flushRenderer(win) {
  const acked = new Promise((r) => ipcMain.once('kew:flushed', () => r(true)))
  win.webContents.send('kew:flush')
  return Promise.race([acked, sleep(2000).then(() => false)])
}

async function fixes(win) {
  const pe = () => readAny('People', 'Mara Quintero')
  // 1a. Flush (window close / quit) inside the 800 ms autosave window saves the editor text.
  await openRecord(win, 'Mara Quintero')
  await waitFor(win, '.cm-content')
  key(win, 'E', ['meta'])
  await sleep(200)
  win.webContents.insertText('Flushed words. ')
  const t0 = Date.now()
  const acked = await flushRenderer(win)
  log('flush: acked', acked, 'in', Date.now() - t0, 'ms | file has text:', pe().includes('Flushed words.'))

  // 1b. Leaving with the conflict bar up keeps the local text (as "Keep mine").
  win.webContents.insertText('Conflict local. ')
  writeAny('People', 'Mara Quintero', pe() + '\nThird outside edit.\n')
  for (let i = 0; i < 8; i++) {
    await sleep(300)
    win.webContents.insertText('.')
  }
  log('leave with conflict: bar shown:', await js(win, `!!document.querySelector('.editor-conflict')`))
  // ⌘[
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '[', modifiers: ['meta'] })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '[', modifiers: ['meta'] })
  await sleep(1500)
  log('leave with conflict: navigated away:', !(await js(win, `!!document.querySelector('.outreach-card')`)), '| local text saved:', pe().includes('Conflict local.'))
  const h = await historyTop(win, 3)
  log('leave with conflict: history:', h.map((x) => `${x.kind}:${x.message}`).join(' | '))

  // 3. ⌘[ in the editor navigates back without outdenting the line first.
  await openRecord(win, 'Mara Quintero')
  await waitFor(win, '.cm-content')
  key(win, 'E', ['meta'])
  await sleep(200)
  win.webContents.insertText('    Indented line.\n')
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '[', modifiers: ['meta'] })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '[', modifiers: ['meta'] })
  await sleep(1500)
  log('cmd+[ in editor: navigated back:', !(await js(win, `!!document.querySelector('.outreach-card')`)), '| line kept its indent:', pe().includes('    Indented line.'))

  // 4. A field draft is saved when ⌘[ leaves the page while the input has focus.
  await openRecord(win, 'Lanternfish Data')
  const co = () => readAny('Companies', 'Lanternfish Data')
  await js(win, `[...document.querySelectorAll('.prop')].find((r) => r.querySelector('.prop-label')?.textContent === 'Raise').querySelector('input').focus()`)
  win.webContents.insertText('$9M')
  await sleep(200)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '[', modifiers: ['meta'] })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '[', modifiers: ['meta'] })
  await sleep(1200)
  log('field draft on cmd+[: navigated:', !(await js(win, `!!document.querySelector('.record .props')`)) || (await js(win, `document.querySelector('.record-title')?.value`)) !== 'Lanternfish Data', '| raise saved:', /^raise: .*\$9M/m.test(co()))

  // 2. Renaming a hand-made note with no id keeps the page on it.
  writeAny('Companies', 'Handmade Co', '---\ntype: company\nname: Handmade Co\n---\nWritten in another app.\n')
  await sleep(1500)
  await openRecord(win, 'Handmade Co')
  await js(win, `(() => { const i = document.querySelector('.record-title'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Handmade Two'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(200)
  key(win, 'Return')
  await sleep(1500)
  log('rename no-id note: file has id:', /^id: \w{26}$/m.test(readAny('Companies', 'Handmade Two')), '| page title:', await js(win, `document.querySelector('.record-title')?.value`), '| deleted message:', await js(win, `!!document.querySelector('.empty-title') && document.querySelector('.empty-title').textContent.includes('deleted')`))
}

/** Last: close the window inside the autosave window; the close waits for the save. */
async function closeFlush(win) {
  await openRecord(win, 'Mara Quintero')
  await waitFor(win, '.cm-content')
  key(win, 'E', ['meta'])
  await sleep(200)
  win.webContents.insertText('Typed just before closing. ')
  const closed = new Promise((r) => win.once('closed', r))
  win.close()
  await Promise.race([closed, sleep(4000)])
  log('window close: closed', win.isDestroyed(), '| text saved:', readAny('People', 'Mara Quintero').includes('Typed just before closing.'))
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
  await lists(win)
  await records(win)
  await fixes(win)

  key(win, 'K', ['meta'])
  await waitFor(win, '.cmdk-input')
  for (const c of 'pe') key(win, c)
  await waitFor(win, '.cmdk [cmdk-group-heading]')
  await sleep(300) // search results arrive asynchronously
  await shot(win, 'command-bar-light.png')
  key(win, 'Escape')
  await sleep(300)
  await closeFlush(win)
}

main().then(
  () => app.exit(0),
  (e) => {
    console.error(e)
    app.exit(1)
  }
)
