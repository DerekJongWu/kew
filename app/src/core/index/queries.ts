// Read side of the index. Links stay unresolved in the table and are resolved here by name or alias.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db, Row } from './db'
import { aliasesOf, key } from './indexer'
import { unlink } from '../links'
import { computeOutreach } from '../outreach'
import { bareDomain, linkedinSlug, normName } from '../names'
import { parseNote } from '../note'
import type {
  DuplicateHit, FieldValue, ListQuery, OutreachEvent, OutreachState, RecordDetail, RecordSummary,
  RecordType, SearchHit, StageCategory, TimelineItem, TodayData, TodayPerson
} from '../../shared/api'
import type { Schema } from '../../shared/api'

interface RecRow extends Row { id: string; path: string; type: RecordType; name: string; fields: string; problems: string }

const toSummary = (r: RecRow): RecordSummary => ({
  id: r.id, type: r.type, name: r.name, path: r.path,
  fields: JSON.parse(r.fields) as Record<string, FieldValue>, problems: JSON.parse(r.problems) as string[]
})

const str = (v: FieldValue | undefined): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const links = (v: FieldValue | undefined): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map((x) => key(unlink(String(x)))).filter(Boolean)

export function categoryOf(schema: Schema, status: FieldValue | undefined): StageCategory | null {
  const field = schema.types.company.fields.find((f) => f.key === 'pipeline_status')
  const s = str(status)
  return field?.options?.find((o) => o.value === s)?.category ?? null
}

export function byId(db: Db, id: string): RecordSummary | null {
  const r = db.get<RecRow>('SELECT * FROM records WHERE id = ?', id)
  return r ? toSummary(r) : null
}

export function byPath(db: Db, rel: string): RecordSummary | null {
  const r = db.get<RecRow>('SELECT * FROM records WHERE path = ?', rel)
  return r ? toSummary(r) : null
}

export function resolveName(db: Db, name: string, prefer?: RecordType): RecordSummary | null {
  const r = db.get<RecRow>(
    `SELECT r.* FROM names n JOIN records r ON r.id = n.id WHERE n.key = ?
     ORDER BY (r.type = ?) DESC, r.path LIMIT 1`, key(unlink(name)), prefer ?? '')
  return r ? toSummary(r) : null
}

const ofType = (db: Db, type: RecordType): RecordSummary[] =>
  db.all<RecRow>('SELECT * FROM records WHERE type = ? ORDER BY path', type).map(toSummary)

export function backlinks(db: Db, id: string): RecordSummary[] {
  return db.all<RecRow>(
    `SELECT DISTINCT r.* FROM records r JOIN links l ON l.src = r.id
     WHERE r.id != ?1 AND l.target IN (SELECT key FROM names WHERE id = ?1) ORDER BY r.path`, id).map(toSummary)
}

function sortValue(r: RecordSummary, field: string): string | number {
  if (field === 'name') return r.name
  const v = r.fields[field]
  if (typeof v === 'number') return v
  if (Array.isArray(v)) return v.map((x) => unlink(String(x))).join(', ')
  return v === null || v === undefined ? '' : unlink(String(v))
}

export function list(db: Db, type: RecordType, q: ListQuery = {}): RecordSummary[] {
  let rows = ofType(db, type)
  for (const [field, allowed] of Object.entries(q.filters ?? {})) {
    const ok = new Set(allowed.map((a) => key(unlink(a))))
    rows = rows.filter((r) => {
      const v = field === 'name' ? r.name : r.fields[field]
      const vals = Array.isArray(v) ? v : [v]
      const keys = vals.map((x) => key(unlink(x === null || x === undefined ? '' : String(x))))
      return (keys.length ? keys : ['']).some((k) => ok.has(k))
    })
  }
  if (q.text?.trim()) {
    const t = key(q.text)
    rows = rows.filter((r) => [r.name, ...aliasesOf(r.fields)].some((n) => n.toLowerCase().includes(t)))
  }
  const field = q.sort?.field ?? 'name'
  const dir = (q.sort?.dir ?? 'asc') === 'asc' ? 1 : -1
  return rows.sort((a, b) => {
    const x = sortValue(a, field), y = sortValue(b, field)
    if (x === '' && y !== '') return 1 // empty values sort last in either direction
    if (y === '' && x !== '') return -1
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return c * dir || a.name.localeCompare(b.name)
  })
}

// ---- outreach context ----

function eventsOf(db: Db, personId: string): OutreachEvent[] {
  return db.all('SELECT * FROM events WHERE person_id = ? ORDER BY rowid', personId).map((e) => ({
    personId: String(e.person_id), date: String(e.date), dir: e.dir as OutreachEvent['dir'],
    channel: String(e.channel), text: String(e.text)
  }))
}

// Meetings with their resolved company and attendee ids.
function meetings(db: Db): { m: RecordSummary; ids: string[] }[] {
  return ofType(db, 'meeting').map((m) => ({
    m,
    ids: [
      ...links(m.fields.company).map((n) => resolveName(db, n, 'company')),
      ...links(m.fields.attendees).map((n) => resolveName(db, n, 'person'))
    ].filter((r): r is RecordSummary => r !== null).map((r) => r.id)
  }))
}

function lastMeetings(all: { m: RecordSummary; ids: string[] }[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const { m, ids } of all) {
    const date = str(m.fields.date)
    if (!date) continue
    for (const id of ids) if ((out.get(id) ?? '') < date) out.set(id, date)
  }
  return out
}

function outreachFor(db: Db, schema: Schema, person: RecordSummary, lastMeeting: string | null, today: string) {
  const events = eventsOf(db, person.id)
  const company = links(person.fields.company)[0] ? resolveName(db, links(person.fields.company)[0], 'company') : null
  const cadence = person.fields.cadence_days
  const cadenceNum = typeof cadence === 'number' ? cadence : typeof cadence === 'string' && cadence.trim() !== '' && Number.isFinite(Number(cadence)) ? Number(cadence) : null
  const state = computeOutreach({
    met: person.fields.met === true || person.fields.met === 'true',
    cadenceDays: cadenceNum,
    nextFollowUp: str(person.fields.next_follow_up) || null,
    companyClosed: company?.type === 'company' && categoryOf(schema, company.fields.pipeline_status) === 'closed',
    lastMeeting
  }, events, today)
  return { events, state, company }
}

export function today(db: Db, schema: Schema, date: string): TodayData {
  const lastMeeting = lastMeetings(meetings(db))
  const followUps: TodayPerson[] = []
  const repliesOwed: TodayPerson[] = []
  for (const person of ofType(db, 'person')) {
    const { state, company } = outreachFor(db, schema, person, lastMeeting.get(person.id) ?? null, date)
    const item = { person, company, state }
    if (state.state === 'follow-up-due') followUps.push(item)
    else if (state.state === 'reply-owed' && (state.dueDate ?? '') <= date) repliesOwed.push(item)
  }
  const order = (a: TodayPerson, b: TodayPerson): number =>
    (a.state.dueDate ?? '').localeCompare(b.state.dueDate ?? '') || a.person.name.localeCompare(b.person.name)
  followUps.sort(order)
  repliesOwed.sort(order)

  const companies = ofType(db, 'company')
  const reachOut = companies
    .filter((c) => str(c.fields.reach_out_on) !== '' && str(c.fields.reach_out_on) <= date && categoryOf(schema, c.fields.pipeline_status) !== 'closed')
    .sort((a, b) => str(a.fields.reach_out_on).localeCompare(str(b.fields.reach_out_on)) || a.name.localeCompare(b.name))
  const newInbound = companies
    .filter((c) => categoryOf(schema, c.fields.pipeline_status) === 'new')
    .sort((a, b) => str(b.fields.first_seen).localeCompare(str(a.fields.first_seen)) || a.name.localeCompare(b.name))
  return { followUps, repliesOwed, reachOut, newInbound }
}

export function detail(db: Db, schema: Schema, id: string, root: string, date: string): RecordDetail | null {
  const rec = byId(db, id)
  if (!rec) return null
  let body = ''
  try {
    body = parseNote(readFileSync(join(root, rec.path), 'utf8')).body
  } catch {
    body = ''
  }
  const mt = meetings(db)
  const timeline: TimelineItem[] = []
  for (const { m, ids } of mt) {
    if (ids.includes(id)) timeline.push({ date: str(m.fields.date), kind: 'meeting', text: m.name, recordId: m.id })
  }
  const created = str(rec.fields.first_seen) || str(rec.fields.created)
  if (created) timeline.push({ date: created, kind: 'created', text: 'First seen' })

  const out: RecordDetail = { ...rec, body, backlinks: backlinks(db, id), timeline: [] }
  if (rec.type === 'person') {
    const { events, state } = outreachFor(db, schema, rec, lastMeetings(mt).get(id) ?? null, date)
    out.outreach = { events, state }
    for (const e of events) timeline.push({ date: e.date, kind: 'outreach', text: `${e.dir} · ${e.channel}: ${e.text}` })
  }
  if (rec.type === 'company') {
    out.people = ofType(db, 'person').filter((p) => {
      const c = links(p.fields.company)[0]
      return c !== undefined && resolveName(db, c, 'company')?.id === id
    })
  }
  out.timeline = timeline.map((t, i) => ({ t, i })).sort((a, b) => b.t.date.localeCompare(a.t.date) || a.i - b.i).map((x) => x.t)
  return out
}

export function search(db: Db, text: string, limit = 20): SearchHit[] {
  const terms = text.match(/[\p{L}\p{N}]+/gu) ?? []
  if (terms.length === 0) return []
  const match = terms.map((t) => `"${t}"*`).join(' ')
  const rows = db.all<RecRow & { snip: string }>(
    `SELECT r.*, snippet(fts, -1, '«', '»', '…', 12) AS snip FROM fts JOIN records r ON r.rowid = fts.rowid
     WHERE fts MATCH ? ORDER BY rank LIMIT ?`, match, limit)
  return rows.map((r) => ({ record: toSummary(r), snippet: r.snip }))
}

export function findDuplicates(db: Db, type: RecordType, name: string, fields: Record<string, FieldValue>): DuplicateHit[] {
  if (type !== 'company' && type !== 'person') return []
  const n = normName(name)
  const domain = type === 'company' ? bareDomain(str(fields.website)) : ''
  const slug = type === 'person' ? linkedinSlug(str(fields.linkedin)) : ''
  const hits: DuplicateHit[] = []
  for (const r of ofType(db, type)) {
    let reason: DuplicateHit['reason'] | null = null
    if (n && normName(r.name) === n) reason = 'name'
    else if (n && aliasesOf(r.fields).some((a) => normName(a) === n)) reason = 'alias'
    else if (domain && bareDomain(str(r.fields.website)) === domain) reason = 'domain'
    else if (slug && linkedinSlug(str(r.fields.linkedin)) === slug) reason = 'linkedin'
    if (reason) hits.push({ record: r, reason })
  }
  return hits
}

export function allNames(db: Db): Set<string> {
  return new Set(db.all('SELECT DISTINCT key FROM names').map((r) => String(r.key)))
}

export type { OutreachState }
