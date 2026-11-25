import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { promises as fsp, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault, vaultDataDir } from '../../src/core/vault'
import { BUILTIN_TEMPLATES, planSetup, setupVault } from '../../src/core/setup'
import { generateSample } from '../../src/core/sample'
import { parseNote } from '../../src/core/note'
import { ValidationError, validateFields } from '../../src/core/schema/validate'
import { DEFAULT_SCHEMA } from '../../src/core/schema/defaults'
import type { RecordType } from '../../src/shared/api'

const TODAY = '2026-11-24'
const TYPES: RecordType[] = ['company', 'person', 'meeting', 'theme', 'research']
const EXPECTED_PLAN = [
  'Companies/',
  'People/',
  'Meetings/',
  'Themes/',
  'Research/',
  'Templates/Company.md',
  'Templates/Person.md',
  'Templates/Meeting.md',
  'Templates/Theme.md',
  'Templates/Research.md',
  '.kew/schema.yaml'
]

let tmp: string, root: string, dataDir: string
const open: Vault[] = []
const openVault = async (): Promise<Vault> => {
  const v = await Vault.open(root, dataDir, { today: () => TODAY })
  open.push(v)
  return v
}

beforeEach(async () => {
  tmp = await fsp.mkdtemp(join(tmpdir(), 'kew-vault-'))
  root = join(tmp, 'My Vault')
  dataDir = join(tmp, 'data')
  await fsp.mkdir(root)
})
afterEach(async () => {
  for (const v of open.splice(0)) v.close()
  await fsp.rm(tmp, { recursive: true, force: true })
})

async function writeUnrelated(): Promise<Record<string, Buffer>> {
  const files: Record<string, Buffer> = {
    'todo.txt': Buffer.from('buy milk\n'),
    'scan.pdf': Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]),
    'Scratch/data.json': Buffer.from('{"a":1}')
  }
  for (const [rel, b] of Object.entries(files)) {
    await fsp.mkdir(join(root, rel, '..'), { recursive: true })
    await fsp.writeFile(join(root, rel), b)
  }
  return files
}

describe('built-in templates', () => {
  it('are imported as raw text identical to the files on disk', () => {
    for (const t of ['Company', 'Person', 'Meeting', 'Theme', 'Research'] as const) {
      const disk = readFileSync(join(__dirname, `../../src/core/templates/${t}.md`), 'utf8')
      expect(BUILTIN_TEMPLATES[t.toLowerCase() as RecordType]).toBe(disk)
    }
    expect(BUILTIN_TEMPLATES.company).toContain('## What it is')
    expect(BUILTIN_TEMPLATES.theme).toContain('## Signal log')
  })
})

describe('planSetup and setupVault', () => {
  it('plans exactly the 5 folders, 5 templates and the schema for a folder of unrelated files', async () => {
    await writeUnrelated()
    const plan = await planSetup(root)
    expect(plan.root).toBe(root)
    expect(plan.willCreate).toEqual(EXPECTED_PLAN)
    expect(plan.existingNotes).toBe(0)
  })

  it('counts existing .md notes anywhere outside dot folders', async () => {
    await fsp.mkdir(join(root, 'Inbox'))
    await fsp.writeFile(join(root, 'Inbox/a.md'), '# a\n')
    await fsp.writeFile(join(root, 'b.md'), '# b\n')
    await fsp.mkdir(join(root, '.obsidian'))
    await fsp.writeFile(join(root, '.obsidian/c.md'), '# c\n')
    expect((await planSetup(root)).existingNotes).toBe(2)
  })

  it('is idempotent, creates only what is missing and leaves other files untouched', async () => {
    const files = await writeUnrelated()
    await fsp.mkdir(join(root, 'Templates'))
    await fsp.writeFile(join(root, 'Templates/Company.md'), 'my own template\n')
    await setupVault(root)
    await setupVault(root)
    for (const [rel, b] of Object.entries(files)) expect((await fsp.readFile(join(root, rel))).equals(b)).toBe(true)
    expect(readFileSync(join(root, 'Templates/Company.md'), 'utf8')).toBe('my own template\n')
    expect(readFileSync(join(root, 'Templates/Person.md'), 'utf8')).toBe(BUILTIN_TEMPLATES.person)
    expect((await planSetup(root)).willCreate).toEqual([])
    expect(await fsp.readdir(root)).not.toContain('.git')
  })
})

describe('vaultDataDir', () => {
  it('is <userData>/vaults/<first 16 hex of sha256(realpath)>', () => {
    const key = createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 16)
    expect(vaultDataDir('/u', root)).toBe(join('/u', 'vaults', key))
  })
})

describe('sample vault', () => {
  beforeEach(async () => {
    await generateSample(root, TODAY)
  })

  it('has the promised records and fills every Today section', async () => {
    const v = await openVault()
    const counts = Object.fromEntries(await Promise.all(TYPES.map(async (t) => [t, (await v.list(t)).length])))
    expect(counts).toEqual({ company: 14, person: 11, meeting: 4, theme: 3, research: 2 })

    const schema = await v.schema()
    const stage = schema.types.company.fields.find((f) => f.key === 'pipeline_status')!
    const cat = (s: unknown) => stage.options!.find((o) => o.value === s)?.category
    const companies = await v.list('company')
    for (const c of ['new', 'in-progress', 'active', 'closed']) {
      expect(companies.filter((r) => cat(r.fields.pipeline_status) === c).length).toBeGreaterThanOrEqual(2)
    }
    const people = await v.list('person')
    expect(people.filter((p) => p.fields.met === true)).toHaveLength(6)
    expect(people.filter((p) => p.fields.met !== true)).toHaveLength(5)

    const today = await v.today()
    expect(today.followUps.length).toBeGreaterThanOrEqual(3)
    expect(today.repliesOwed.length).toBeGreaterThanOrEqual(2)
    expect(today.reachOut).toHaveLength(2)
    expect(today.newInbound).toHaveLength(3)
    for (const c of today.newInbound) expect(String(c.fields.first_seen) >= '2026-11-22').toBe(true)

    const info = v.info()
    expect(info).toEqual({ root, name: 'My Vault', isSample: true, schemaError: null })
  })

  it('writes notes that all pass validateFields and index without problems', async () => {
    let n = 0
    for (const t of TYPES) {
      const folder = DEFAULT_SCHEMA.types[t].folder
      for (const f of await fsp.readdir(join(root, folder))) {
        const p = parseNote(readFileSync(join(root, folder, f), 'utf8'))
        expect(p.ok).toBe(true)
        expect(p.fm.type).toBe(t)
        expect(validateFields(DEFAULT_SCHEMA, t, p.fm), `${folder}/${f}`).toEqual([])
        n++
      }
    }
    expect(n).toBe(34)
    const v = await openVault()
    for (const t of TYPES) for (const r of await v.list(t)) expect(r.problems, r.path).toEqual([])
  })

  it('starts history with the sample in the initial commit', async () => {
    const v = await openVault()
    const h = await v.history()
    expect(h).toHaveLength(1)
    expect(h[0].message).toBe('Initial state')
    expect(h[0].files).toContain('.kew/schema.yaml')
    expect(h[0].files).toContain('Companies/Pinemoth Analytics.md')
    // Only notes and .kew/*.yaml go into the initial snapshot (not the .kew/sample marker).
    expect(h[0].files).not.toContain('.kew/sample')
  })
})

describe('Vault', () => {
  beforeEach(async () => {
    await setupVault(root)
  })

  it('creates records from the built-in templates and supports undo', async () => {
    const v = await openVault()
    expect(v.info().isSample).toBe(false)
    const res = await v.createRecord('company', 'Glimmerbank')
    if (!('entry' in res)) throw new Error('unexpected duplicates')
    const [id] = res.changedIds
    const d = (await v.get(id))!
    expect(d.fields.pipeline_status).toBe('new')
    expect(d.fields.first_seen).toBe(TODAY)
    expect(d.body).toContain('## Why it could work')
    expect(v.pathOf(id)).toBe(join(root, 'Companies/Glimmerbank.md'))
    await v.undo(res.entry.id)
    expect(await v.get(id)).toBeNull()
    expect((await v.history()).map((h) => h.message).slice(0, 2)).toEqual(['Undid: Created Glimmerbank', 'Created Glimmerbank'])
  })

  it('uses the vault template when present', async () => {
    await fsp.writeFile(join(root, 'Templates/Theme.md'), '---\ntype: theme\n---\n\n## Custom section\n')
    const v = await openVault()
    const res = await v.createRecord('theme', 'Quiet Compute')
    if (!('entry' in res)) throw new Error('unexpected duplicates')
    expect((await v.get(res.changedIds[0]))!.body).toContain('## Custom section')
  })

  it('applies schema changes, reports affected counts, and reloads the schema on undo', async () => {
    const v = await openVault()
    const res = await v.createRecord('company', 'Glimmerbank', { stage: 'seed' })
    if (!('entry' in res)) throw new Error('unexpected duplicates')
    const change = { kind: 'rename-field', type: 'company', from: 'stage', to: 'round_stage' } as const
    expect(v.affectedCount(change)).toBe(1)
    const r = await v.changeSchema(change)
    expect((await v.schema()).types.company.fields.some((f) => f.key === 'round_stage')).toBe(true)
    expect(readFileSync(join(dataDir, 'last-schema.yaml'), 'utf8')).toContain('round_stage')
    await v.undo(r.entry.id)
    const keys = (await v.schema()).types.company.fields.map((f) => f.key)
    expect(keys).toContain('stage')
    expect(keys).not.toContain('round_stage')
    expect((await v.list('company'))[0].fields.stage).toBe('seed')
  })

  it('falls back to the last valid schema when the file is broken, without touching it', async () => {
    let v = await openVault()
    await v.createRecord('company', 'Glimmerbank')
    v.close()
    const broken = 'version: 1\ntypes: [oops\n'
    await fsp.writeFile(join(root, '.kew/schema.yaml'), broken)
    v = await openVault()
    expect(v.info().schemaError).not.toBeNull()
    expect((await v.list('company')).map((c) => c.name)).toEqual(['Glimmerbank'])
    expect((await v.schema()).types.company.folder).toBe('Companies')
    expect(readFileSync(join(root, '.kew/schema.yaml'), 'utf8')).toBe(broken)
  })

  it('refuses schema changes while .kew/schema.yaml is broken, leaving the file alone', async () => {
    const v = await openVault()
    const broken = 'version: 1\ntypes: [oops\n'
    await fsp.writeFile(join(root, '.kew/schema.yaml'), broken)
    await v.onExternalChange(['.kew/schema.yaml'])
    const n = (await v.history()).length
    const change = { kind: 'add-field', type: 'company', field: { key: 'region', label: 'Region', type: 'text', tier: 'custom' } } as const
    await expect(v.changeSchema(change)).rejects.toThrow(
      'Fix .kew/schema.yaml (or undo to the last valid version) before changing fields'
    )
    await expect(v.changeSchema(change)).rejects.toBeInstanceOf(ValidationError)
    expect(readFileSync(join(root, '.kew/schema.yaml'), 'utf8')).toBe(broken)
    expect((await v.history()).length).toBe(n)
  })

  it('rebuilds the index on open when the schema changed', async () => {
    let v = await openVault()
    await v.createRecord('company', 'Glimmerbank', { conviction: 'high' })
    v.close()
    const text = readFileSync(join(root, '.kew/schema.yaml'), 'utf8')
    await fsp.writeFile(join(root, '.kew/schema.yaml'), text.replace('value: high', 'value: strong'))
    v = await openVault()
    expect((await v.list('company'))[0].problems).toEqual(["conviction: 'high' is not an option"])
  })

  it('re-indexes external changes without recording history', async () => {
    const v = await openVault()
    const before = (await v.history()).length
    await fsp.writeFile(join(root, 'Companies/Hand Made.md'), '---\ntype: company\nname: Hand Made\n---\n')
    await fsp.writeFile(join(root, 'Companies/ignore.txt'), 'x')
    const ids = await v.onExternalChange(['Companies/Hand Made.md', 'Companies/ignore.txt', '.obsidian/x.md'])
    expect(ids).toHaveLength(1)
    expect((await v.get(ids[0]))!.name).toBe('Hand Made')
    await fsp.rm(join(root, 'Companies/Hand Made.md'))
    expect(await v.onExternalChange(['Companies/Hand Made.md'])).toEqual(ids)
    expect(await v.list('company')).toEqual([])
    expect((await v.history()).length).toBe(before)
  })

  it('reloads the schema when .kew/schema.yaml changes on disk', async () => {
    const v = await openVault()
    await v.createRecord('company', 'Glimmerbank', { conviction: 'high' })
    const text = readFileSync(join(root, '.kew/schema.yaml'), 'utf8')
    await fsp.writeFile(join(root, '.kew/schema.yaml'), text.replace('value: high', 'value: strong'))
    const ids = await v.onExternalChange(['.kew/schema.yaml'])
    expect(ids).toHaveLength(1)
    expect((await v.list('company'))[0].problems).toHaveLength(1)
    await fsp.writeFile(join(root, '.kew/schema.yaml'), 'nope: [')
    await v.onExternalChange(['.kew/schema.yaml'])
    expect(v.info().schemaError).not.toBeNull()
  })

  it('reads views, defaulting when missing, and saves them', async () => {
    const v = await openVault()
    const views = await v.views()
    expect(views.map((x) => x.id)).toEqual(['inbound', 'active', 'passed', 'all'])
    await v.saveViews(views.slice(0, 1))
    expect((await v.views()).map((x) => x.id)).toEqual(['inbound'])
  })

  it('can be closed twice', async () => {
    const v = await openVault()
    v.close()
    expect(() => v.close()).not.toThrow()
  })
})
