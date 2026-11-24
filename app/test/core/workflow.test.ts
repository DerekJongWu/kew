import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fsp, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { History } from '../../src/core/history'
import { openIndex, type Index } from '../../src/core/index'
import { loadSchema } from '../../src/core/schema/load'
import { ValidationError } from '../../src/core/schema/validate'
import { undoAction, type Ctx } from '../../src/core/write/apply'
import { createRecord, setFields } from '../../src/core/write/records'
import { logOutreach, weMet, passCompany, snooze } from '../../src/core/write/workflow'

const FIXTURE = join(__dirname, '../fixtures/vaults/basic')
const TODAY = '2026-11-24'
const schema = loadSchema(readFileSync(join(FIXTURE, '.kew/schema.yaml'), 'utf8'), null).schema
const TEMPLATES: Ctx['templates'] = {
  company: '---\ntags: [company]\npipeline_status: new\n---\n\n## What it is\n',
  person: '---\ntags: [person]\n---\n\n## Outreach log\n',
  meeting: '## Notes\n',
  theme: '---\ntags: [theme]\n---\n',
  research: '---\ntags: [research]\n---\n'
}

let tmp: string, vault: string, idx: Index, history: History, ctx: Ctx

const read = (rel: string): string => readFileSync(join(vault, rel), 'utf8')
const idOf = (name: string): string => idx.resolveName(name)!.id
const status = (name: string): unknown => idx.resolveName(name)!.fields.pipeline_status

async function addPerson(name: string, company: string): Promise<string> {
  await createRecord(ctx, 'person', name, { company, met: false, cadence_days: 7 })
  return idOf(name)
}

beforeEach(async () => {
  tmp = await fsp.mkdtemp(join(tmpdir(), 'kew-workflow-'))
  vault = join(tmp, 'vault')
  await fsp.cp(FIXTURE, vault, { recursive: true })
  history = await History.open(join(tmp, 'history.git'), vault)
  idx = openIndex(':memory:')
  await idx.rebuild(vault, schema)
  ctx = { root: vault, schema: () => schema, index: idx, history, today: () => TODAY, templates: TEMPLATES }
})
afterEach(async () => {
  idx.close()
  await fsp.rm(tmp, { recursive: true, force: true })
})

describe('logOutreach', () => {
  it('first send moves a new company to reached-out in one entry; undo reverts both', async () => {
    const id = await addPerson('Nova Test', 'Harbor Analytics')
    const before = (await history.list(50)).length
    const r = await logOutreach(ctx, id, { dir: 'out', channel: 'email', text: 'Hello' })
    expect(r.entry.message).toBe('Logged a send to Nova Test')
    expect((await history.list(50)).length).toBe(before + 1)
    expect(status('Harbor Analytics')).toBe('reached-out')
    expect(read('People/Nova Test.md')).toContain('- 2026-11-24, out · email: Hello')
    await undoAction(ctx, r.entry.id)
    expect(status('Harbor Analytics')).toBe('new')
    expect(read('People/Nova Test.md')).not.toContain('Hello')
  })

  it('moves a pursuing company too, but not on the second send', async () => {
    const id = await addPerson('Nova Test', 'Lumen Ledger')
    await logOutreach(ctx, id, { dir: 'out', channel: 'email', text: 'one' })
    expect(status('Lumen Ledger')).toBe('reached-out')
    await setFields(ctx, idOf('Lumen Ledger'), { pipeline_status: 'pursuing' })
    await logOutreach(ctx, id, { dir: 'out', channel: 'email', text: 'two' })
    expect(status('Lumen Ledger')).toBe('pursuing')
    expect(read('Companies/Lumen Ledger.md')).toContain('pipeline_status: pursuing')
  })

  it('leaves an active company alone, and does not move on in/note events', async () => {
    const a = await addPerson('Nova Test', 'Harbor Analytics')
    await setFields(ctx, idOf('Harbor Analytics'), { pipeline_status: 'active' })
    await logOutreach(ctx, a, { dir: 'out', channel: 'email', text: 'x' })
    expect(status('Harbor Analytics')).toBe('active')
    const b = await addPerson('Other Test', 'Lumen Ledger')
    const r = await logOutreach(ctx, b, { dir: 'in', channel: 'email', text: 'hi' })
    expect(r.entry.message).toBe('Logged a reply from Other Test')
    expect(status('Lumen Ledger')).toBe('pursuing')
    const n = await logOutreach(ctx, b, { dir: 'note', channel: 'call', text: 'n' })
    expect(n.entry.message).toBe('Added a note on Other Test')
  })

  it('changes only the person when the company is unresolved', async () => {
    const id = await addPerson('Nova Test', 'Nowhere Inc')
    const r = await logOutreach(ctx, id, { dir: 'out', channel: 'email', text: 'x' })
    expect(r.changedIds).toEqual([id])
  })

  it('clears next_follow_up, collapses newlines, honors the date, creates the section before ## Notes', async () => {
    const id = await addPerson('Nova Test', 'Harbor Analytics')
    await setFields(ctx, id, { next_follow_up: '2026-12-01' })
    const path = idx.byId(id)!.path
    await fsp.writeFile(
      join(vault, path),
      read(path).replace('## Outreach log\n', '## Notes\n\nhand\n')
    )
    await logOutreach(ctx, id, { dir: 'in', channel: 'linkedin', text: ' a\r\nb\n c ', date: '2026-11-20' })
    const text = read(path)
    expect(text).not.toContain('next_follow_up')
    expect(text).toMatch(/## Outreach log\n\n- 2026-11-20, in · linkedin: a b c\n\n## Notes/)
  })

  it('rejects bad channels and dates, and allows empty text', async () => {
    const id = await addPerson('Nova Test', 'Harbor Analytics')
    await expect(logOutreach(ctx, id, { dir: 'out', channel: 'a b', text: '' })).rejects.toThrow(ValidationError)
    await expect(logOutreach(ctx, id, { dir: 'out', channel: 'email', text: '', date: '2026-02-30' })).rejects.toThrow(ValidationError)
    await logOutreach(ctx, id, { dir: 'out', channel: 'email', text: '' })
    expect(read('People/Nova Test.md')).toMatch(/^- 2026-11-24, out · email: $/m)
  })
})

describe('weMet', () => {
  it('moves a reached-out company to active, leaves a passed one, and is a no-op when repeated', async () => {
    const a = idOf('Sam Okafor')
    const r = await weMet(ctx, a)
    expect(r.entry.message).toBe('Met Sam Okafor')
    expect(idx.byId(a)!.fields.met).toBe('true')
    expect(status('Quill Security')).toBe('active')
    const again = await weMet(ctx, a)
    expect(again.changedIds).toEqual([])
    const t = idOf('Tomas Veld')
    await weMet(ctx, t)
    expect(idx.byId(t)!.fields.met).toBe('true')
    expect(status('Fernwood Robotics')).toBe('passed')
  })
})

describe('passCompany', () => {
  it('sets status and reason, and drops unmet people from Today', async () => {
    const before = idx.today(TODAY)
    expect(before.repliesOwed.some((x) => x.person.name === 'Priya Raman')).toBe(true)
    const r = await passCompany(ctx, idOf('Lumen Ledger'), '  too early ')
    expect(r.entry.message).toBe('Passed on Lumen Ledger')
    expect(status('Lumen Ledger')).toBe('passed')
    expect(idx.resolveName('Lumen Ledger')!.fields.pass_reason).toBe('too early')
    const t = idx.today(TODAY)
    expect([...t.followUps, ...t.repliesOwed].some((x) => x.person.name === 'Priya Raman')).toBe(false)
  })
  it('requires a reason and a company', async () => {
    await expect(passCompany(ctx, idOf('Lumen Ledger'), '  ')).rejects.toThrow(ValidationError)
    await expect(passCompany(ctx, idOf('Sam Okafor'), 'x')).rejects.toThrow(ValidationError)
  })
})

describe('snooze', () => {
  it('writes next_follow_up for people and reach_out_on for companies', async () => {
    const r = await snooze(ctx, idOf('Sam Okafor'), '2026-12-01')
    expect(r.entry.message).toBe('Snoozed Sam Okafor until 2026-12-01')
    expect(idx.resolveName('Sam Okafor')!.fields.next_follow_up).toBe('2026-12-01')
    await snooze(ctx, idOf('Lumen Ledger'), '2026-12-02')
    expect(idx.resolveName('Lumen Ledger')!.fields.reach_out_on).toBe('2026-12-02')
  })
  it('rejects other types and bad dates', async () => {
    await expect(snooze(ctx, idOf('AI Agent Security'), '2026-12-01')).rejects.toThrow(ValidationError)
    await expect(snooze(ctx, idOf('Sam Okafor'), 'soon')).rejects.toThrow(ValidationError)
  })
})
