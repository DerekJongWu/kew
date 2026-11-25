// Write side of the index: turns notes into rows. Reads the vault, never writes it.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db } from './db'
import { parseNote } from '../note'
import { extractLinks, unlink } from '../links'
import { parseLog, logProblems } from '../outreach'
import { validateFields } from '../schema/validate'
import type { FieldValue, RecordType, Schema } from '../../shared/api'

export const RECORD_TYPES: RecordType[] = ['company', 'person', 'meeting', 'theme', 'research']
const isType = (v: unknown): v is RecordType => RECORD_TYPES.includes(v as RecordType)

export const key = (s: string): string => s.trim().toLowerCase()

export function aliasesOf(fields: Record<string, FieldValue>): string[] {
  const a = fields.aliases
  const list = Array.isArray(a) ? a : typeof a === 'string' ? [a] : []
  return list.map((x) => String(x).trim()).filter(Boolean)
}

const baseName = (rel: string): string => rel.split('/').pop()!.replace(/\.md$/i, '')

/** First non-empty line under "## What it is", at most 140 characters. */
export function whatItIs(body: string): string {
  const lines = body.split(/\r?\n/)
  const at = lines.findIndex((l) => /^##\s+What it is\s*$/i.test(l))
  if (at < 0) return ''
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,6}\s/.test(l)) return ''
    const t = l.trim()
    if (t) return t.length > 140 ? `${t.slice(0, 139).trimEnd()}…` : t
  }
  return ''
}

export function indexFile(db: Db, rel: string, text: string, schema: Schema): void {
  const folderType = RECORD_TYPES.find((t) => rel.startsWith(schema.types[t].folder + '/'))
  // Same rule as rebuild: only .md files inside a type folder are records, and dot entries are skipped.
  const hidden = rel.split('/').some((seg) => seg.startsWith('.'))
  if (!folderType || hidden || !/\.md$/i.test(rel)) {
    removeFile(db, rel)
    return
  }
  const parsed = parseNote(text)
  const problems: string[] = []
  if (!parsed.ok && parsed.error) problems.push(parsed.error)

  const declared = parsed.fm.type
  let type: RecordType
  if (isType(declared)) {
    type = declared
    if (folderType !== declared) {
      problems.push(`Type/folder mismatch: type is '${declared}' but the note is in ${schema.types[folderType].folder}/`)
    }
  } else {
    type = folderType
    if (parsed.ok && declared !== undefined && declared !== '') problems.push(`Unknown type '${String(declared)}'`)
  }

  const fields = parsed.fm
  problems.push(...validateFields(schema, type, fields))
  if (type === 'person') problems.push(...logProblems(text))

  const stored: Record<string, FieldValue> = { ...fields }
  for (const k of Object.keys(stored)) if (k.startsWith('_')) delete stored[k] // reserved for derived fields
  if (type === 'company') stored._summary = whatItIs(parsed.body)

  const fmName = typeof fields.name === 'string' ? fields.name.trim() : ''
  const name = fmName || baseName(rel)
  const fmId = typeof fields.id === 'string' ? fields.id.trim() : ''

  db.transaction(() => {
    removeFile(db, rel)
    let id = fmId || `path:${rel}`
    if (fmId && db.get('SELECT 1 AS x FROM records WHERE id = ?', id)) {
      problems.push(`Duplicate id ${fmId}; another note already uses it`)
      id = `path:${rel}`
    }
    db.run('INSERT INTO records (id, path, type, name, fields, problems) VALUES (?, ?, ?, ?, ?, ?)',
      id, rel, type, name, JSON.stringify(stored), JSON.stringify(problems))
    const row = db.get<{ rowid: number }>('SELECT rowid FROM records WHERE id = ?', id)!
    const aliases = aliasesOf(fields)
    for (const n of new Set([name, ...aliases].map(key))) if (n) db.run('INSERT INTO names (key, id) VALUES (?, ?)', n, id)

    const targets = new Set<string>()
    for (const f of schema.types[type].fields) {
      if (f.type !== 'relation') continue
      const v = fields[f.key]
      for (const item of Array.isArray(v) ? v : typeof v === 'string' ? [v] : []) {
        const t = key(unlink(String(item)))
        if (t) targets.add(t)
      }
    }
    for (const l of extractLinks(parsed.body)) targets.add(key(l))
    for (const t of targets) db.run('INSERT INTO links (src, target) VALUES (?, ?)', id, t)

    if (type === 'person') {
      for (const e of parseLog(text, id)) db.run('INSERT INTO events VALUES (?, ?, ?, ?, ?)', id, e.date, e.dir, e.channel, e.text)
    }
    db.run('INSERT INTO fts (rowid, name, aliases, body) VALUES (?, ?, ?, ?)', row.rowid, name, aliases.join(' '), parsed.body)
  })
}

export function removeFile(db: Db, rel: string): void {
  const row = db.get<{ rowid: number; id: string }>('SELECT rowid, id FROM records WHERE path = ?', rel)
  if (!row) return
  db.transaction(() => {
    db.run('DELETE FROM fts WHERE rowid = ?', row.rowid)
    db.run('DELETE FROM names WHERE id = ?', row.id)
    db.run('DELETE FROM links WHERE src = ?', row.id)
    db.run('DELETE FROM events WHERE person_id = ?', row.id)
    db.run('DELETE FROM records WHERE rowid = ?', row.rowid)
  })
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(join(root, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) await walk(root, rel, out)
    else if (e.isFile() && /\.md$/i.test(e.name)) out.push(rel)
  }
}

export async function rebuild(db: Db, root: string, schema: Schema): Promise<void> {
  const files: string[] = []
  for (const t of RECORD_TYPES) await walk(root, schema.types[t].folder, files)
  files.sort()
  const texts: string[] = []
  for (let i = 0; i < files.length; i += 64) {
    texts.push(...(await Promise.all(files.slice(i, i + 64).map((f) => readFile(join(root, f), 'utf8')))))
  }
  db.transaction(() => {
    for (const t of ['records', 'names', 'links', 'events', 'fts']) db.exec(`DELETE FROM ${t}`)
    files.forEach((f, i) => indexFile(db, f, texts[i], schema))
  })
}
