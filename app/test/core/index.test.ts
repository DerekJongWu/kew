import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openIndex, type Index } from '../../src/core/index'
import { loadSchema } from '../../src/core/schema/load'
import { DEFAULT_SCHEMA } from '../../src/core/schema/defaults'

const ROOT = join(__dirname, '../fixtures/vaults/basic')
const TODAY = '2026-11-24'
const schema = loadSchema(readFileSync(join(ROOT, '.kew/schema.yaml'), 'utf8'), null).schema

let idx: Index
beforeAll(async () => {
  idx = openIndex(':memory:')
  await idx.rebuild(ROOT, schema)
})

const names = (rs: { name: string }[]) => rs.map((r) => r.name)

describe('rebuild', () => {
  it('indexes the five type folders and ignores the rest', () => {
    expect(idx.list('company')).toHaveLength(4)
    expect(idx.list('person')).toHaveLength(4)
    expect(idx.list('meeting')).toHaveLength(1)
    expect(idx.list('theme')).toHaveLength(1)
    expect(idx.list('research')).toHaveLength(1)
    expect(idx.resolveName('Loose Note Inc')).toBeNull()
    expect(idx.byPath('Companies/quill-logo.png')).toBeNull()
  })

  it('has no problems on the fixture records', () => {
    const all = (['company', 'person', 'meeting', 'theme', 'research'] as const).flatMap((t) => idx.list(t))
    expect(all.flatMap((r) => r.problems)).toEqual([])
  })

  it('resolves names and aliases case-insensitively', () => {
    expect(idx.resolveName('quill')?.name).toBe('Quill Security')
    expect(idx.resolveName('[[HARBOR]]')?.name).toBe('Harbor Analytics')
    expect(idx.resolveName('nobody')).toBeNull()
  })
})

describe('backlinks and detail', () => {
  it('lists companies tagging the theme, plus body links', () => {
    const theme = idx.resolveName('AI Agent Security')!
    expect(names(idx.backlinks(theme.id)).sort()).toEqual(['Agent Security Landscape', 'Lumen Ledger', 'Quill Security'])
  })

  it('builds a company detail with people, body and backlinks', () => {
    const d = idx.detail(idx.resolveName('Quill')!.id, ROOT, TODAY)!
    expect(d.body).toContain('Runtime guardrails')
    expect(names(d.people!)).toEqual(['Sam Okafor'])
    expect(names(d.backlinks).sort()).toEqual(['Agent Security Landscape', 'Sam Okafor'])
    expect(d.outreach).toBeUndefined()
    expect(d.timeline.map((t) => t.kind)).toEqual(['created'])
  })

  it('builds a person detail with outreach and meetings, newest first', () => {
    const d = idx.detail(idx.resolveName('Ines Calder')!.id, ROOT, TODAY)!
    expect(d.outreach!.state.state).toBe('follow-up-due')
    expect(d.timeline.map((t) => [t.kind, t.date])).toEqual([['meeting', '2026-10-20']])
    const p = idx.detail(idx.resolveName('Priya Raman')!.id, ROOT, TODAY)!
    expect(p.outreach!.events).toHaveLength(2)
    expect(p.timeline.map((t) => t.date)).toEqual(['2026-11-23', '2026-11-20'])
    expect(idx.detail('missing', ROOT, TODAY)).toBeNull()
  })
})

describe('today', () => {
  it('returns the expected people and excludes the unmet founder of a passed company', () => {
    const t = idx.today(TODAY)
    expect(names(t.followUps.map((x) => x.person))).toEqual(['Sam Okafor', 'Ines Calder'])
    expect(t.followUps.map((x) => x.company?.name)).toEqual(['Quill Security', 'Harbor Analytics'])
    expect(names(t.repliesOwed.map((x) => x.person))).toEqual(['Priya Raman'])
    expect(names(t.reachOut)).toEqual(['Lumen Ledger'])
    expect(names(t.newInbound)).toEqual(['Harbor Analytics'])
  })

  it('hides a snoozed reply until its date', () => {
    const local = openIndex(':memory:')
    local.indexFile('People/Zed.md', '---\ntype: person\nname: Zed\nnext_follow_up: 2026-12-01\n---\n\n## Outreach log\n\n- 2026-11-23, in · email: hi\n', schema)
    expect(local.today('2026-11-24').repliesOwed).toEqual([])
    expect(names(local.today('2026-12-01').repliesOwed.map((x) => x.person))).toEqual(['Zed'])
  })
})

describe('list', () => {
  it('filters, sorts and searches by text', () => {
    expect(names(idx.list('company', { filters: { pipeline_status: ['new', 'passed'] } }))).toEqual(['Fernwood Robotics', 'Harbor Analytics'])
    expect(names(idx.list('company', { filters: { themes: ['ai agent security'] }, sort: { field: 'name', dir: 'desc' } }))).toEqual(['Quill Security', 'Lumen Ledger'])
    expect(names(idx.list('company', { text: 'harb' }))).toEqual(['Harbor Analytics'])
    expect(names(idx.list('company', { sort: { field: 'first_seen', dir: 'asc' } }))[0]).toBe('Fernwood Robotics')
  })
})

describe('search and duplicates', () => {
  it('finds a word that only appears in a body', () => {
    const hits = idx.search('zebrafish', 10)
    expect(names(hits.map((h) => h.record))).toEqual(['Harbor Analytics'])
    expect(hits[0].snippet).toContain('zebrafish')
    expect(idx.search('!!!', 5)).toEqual([])
  })

  it('finds duplicates by name, alias, domain and linkedin', () => {
    const d = idx.findDuplicates('company', 'Quill Security Inc', { website: 'https://www.quill.example' })
    expect(d.map((x) => [x.record.name, x.reason])).toEqual([['Quill Security', 'name']])
    expect(idx.findDuplicates('company', 'Quill', {})[0].reason).toBe('alias')
    expect(idx.findDuplicates('company', 'Other', { website: 'www.quill.example/about' })[0].reason).toBe('domain')
    expect(idx.findDuplicates('person', 'Someone', { linkedin: 'https://linkedin.com/in/Sam-Okafor-Example/' })[0].reason).toBe('linkedin')
    expect(idx.findDuplicates('company', 'Inc', { website: '' })).toEqual([])
  })

  it('exposes lower-cased names for unique naming', () => {
    const n = idx.allNames()
    expect(n.has('quill security')).toBe(true)
    expect(n.has('quill')).toBe(true)
  })
})

describe('incremental edits and problems', () => {
  it('lists broken YAML notes with the parse error', () => {
    const local = openIndex(':memory:')
    local.indexFile('People/Bad One.md', '---\nname: [oops\n---\nbody\n', schema)
    const r = local.byPath('People/Bad One.md')!
    expect(r.type).toBe('person')
    expect(r.name).toBe('Bad One')
    expect(r.fields).toEqual({})
    expect(r.problems.length).toBeGreaterThan(0)
    expect(r.id).toBe('path:People/Bad One.md')
  })

  it('flags type/folder mismatch and malformed log lines; frontmatter type wins', () => {
    const local = openIndex(':memory:')
    local.indexFile('Companies/Odd.md', '---\ntype: person\nname: Odd\nmet: maybe\n---\n\n## Outreach log\n\n- garbage\n', schema)
    const r = local.byPath('Companies/Odd.md')!
    expect(r.type).toBe('person')
    expect(r.problems.join('\n')).toMatch(/mismatch/i)
    expect(r.problems.join('\n')).toMatch(/met:/)
    expect(r.problems.join('\n')).toMatch(/Malformed outreach log/)
  })

  it('resolves a link as soon as its target appears, and reindexes and removes files', () => {
    const local = openIndex(':memory:')
    local.indexFile('Themes/T.md', '---\ntype: theme\nname: T\n---\nsee [[Later]]\n', schema)
    const t = local.resolveName('T')!
    expect(local.backlinks(t.id)).toEqual([])
    local.indexFile('Companies/Later.md', '---\ntype: company\nname: Later\naliases: [Lt]\n---\n', schema)
    const later = local.resolveName('lt')!
    expect(names(local.backlinks(later.id))).toEqual(['T'])
    local.indexFile('Companies/Later.md', '---\ntype: company\nname: Later\n---\n', schema)
    expect(local.resolveName('lt')).toBeNull()
    local.removeFile('Companies/Later.md')
    expect(local.resolveName('Later')).toBeNull()
    expect(names(local.search('Later').map((h) => h.record))).toEqual(['T'])
  })

  it('keeps a stable id when present and falls back on duplicates', () => {
    const local = openIndex(':memory:')
    local.indexFile('Companies/A.md', '---\nid: X1\ntype: company\nname: A\n---\n', DEFAULT_SCHEMA)
    local.indexFile('Companies/B.md', '---\nid: X1\ntype: company\nname: B\n---\n', DEFAULT_SCHEMA)
    expect(local.byId('X1')!.name).toBe('A')
    expect(local.byPath('Companies/B.md')!.problems.join()).toMatch(/Duplicate id/)
  })
})

describe('performance', () => {
  it('rebuilds 2,000 notes in under 5 seconds', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kew-perf-'))
    try {
      for (const f of ['Companies', 'People']) mkdirSync(join(root, f, 'sub'), { recursive: true })
      for (let i = 0; i < 2000; i++) {
        const company = i % 2 === 0
        const dir = company ? 'Companies' : 'People'
        const log = company ? '' : '\n## Outreach log\n\n- 2026-11-01, out · email: hello\n'
        const extra = company ? 'pipeline_status: new\n' : `company: "[[Company ${i - 1}]]"\ncadence_days: 7\n`
        writeFileSync(join(root, dir, i % 3 === 0 ? 'sub' : '', `${company ? 'Company' : 'Person'} ${i}.md`),
          `---\nid: ID${i}\ntype: ${company ? 'company' : 'person'}\nname: ${company ? 'Company' : 'Person'} ${i}\n${extra}---\n\nSome body text number ${i} with [[Company 0]].\n${log}`)
      }
      const local = openIndex(':memory:')
      const start = performance.now()
      await local.rebuild(root, DEFAULT_SCHEMA)
      expect(performance.now() - start).toBeLessThan(5000)
      expect(local.list('company').length + local.list('person').length).toBe(2000)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
