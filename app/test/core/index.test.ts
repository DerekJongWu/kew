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

const names = (rs: { name: string }[]): string[] => rs.map((r) => r.name)

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

describe('derived company fields', () => {
  it('adds _last_touch from the latest outreach event among the company\'s people, on every query', () => {
    const quill = idx.resolveName('Quill')!
    expect(quill.fields._last_touch).toBe('2026-11-10|out|linkedin')
    expect(idx.byId(quill.id)!.fields._last_touch).toBe('2026-11-10|out|linkedin')
    expect(idx.list('company').find((c) => c.name === 'Quill Security')!.fields._last_touch).toBe('2026-11-10|out|linkedin')
    expect(idx.list('company').find((c) => c.name === 'Harbor Analytics')!.fields._last_touch).toBeNull()
    expect(idx.list('person')[0].fields._last_touch).toBeUndefined()
  })

  it('adds _summary: the first non-empty line under "What it is", capped at 140 chars', () => {
    const quill = idx.resolveName('Quill')!
    expect(quill.fields._summary).toBe('Runtime guardrails for autonomous agents. Founders previously ran platform security at a payments firm.')
    const long = '---\ntype: company\nname: Long One\n---\n\n## What it is\n\n' + 'word '.repeat(60) + '\n'
    idx.indexFile('Companies/Long One.md', long, schema)
    const s = String(idx.resolveName('Long One')!.fields._summary)
    expect(s.length).toBeLessThanOrEqual(140)
    expect(s.endsWith('…')).toBe(true)
    idx.removeFile('Companies/Long One.md')
  })
})

describe('indexFile', () => {
  it('skips dot-prefixed files and folders, like rebuild', () => {
    const local = openIndex(':memory:')
    local.indexFile('Companies/.Acme.md', '---\ntype: company\nname: .Acme\n---\n', schema)
    local.indexFile('Companies/.drafts/Beta.md', '---\ntype: company\nname: Beta\n---\n', schema)
    expect(local.byPath('Companies/.Acme.md')).toBeNull()
    expect(local.byPath('Companies/.drafts/Beta.md')).toBeNull()
    expect(local.list('company')).toEqual([])
    local.close()
  })
})

describe('search and duplicates', () => {
  it('finds a word that only appears in a body', () => {
    const hits = idx.search('zebrafish', 10)
    expect(names(hits.map((h) => h.record))).toEqual(['Harbor Analytics'])
    expect(hits[0].snippet).toContain('zebrafish')
    expect(idx.search('!!!', 5)).toEqual([])
  })

  it('ranks exact and prefix name matches, then name-contains, then body-only matches', () => {
    const local = openIndex(':memory:')
    local.indexFile('Meetings/2026-01-05 Orchard Signal intro.md', '---\ntype: meeting\nname: 2026-01-05 Orchard Signal intro\n---\norchard orchard orchard orchard\n', schema)
    local.indexFile('Companies/Old Orchard Co.md', '---\ntype: company\nname: Old Orchard Co\n---\n', schema)
    local.indexFile('Research/Fruit.md', '---\ntype: research\nname: Fruit\n---\nOrchard yields.\n', schema)
    local.indexFile('Companies/Orchard Signal.md', '---\ntype: company\nname: Orchard Signal\n---\nSignal startup.\n', schema)
    local.indexFile('Companies/Orchard.md', '---\ntype: company\nname: Orchard\n---\n', schema)
    const found = names(local.search('orchard').map((h) => h.record))
    expect(found.slice(0, 2)).toEqual(['Orchard', 'Orchard Signal'])
    expect(found.slice(2, 4).sort()).toEqual(['2026-01-05 Orchard Signal intro', 'Old Orchard Co'])
    expect(found[4]).toBe('Fruit')
    expect(names(local.search('orchard', 2).map((h) => h.record))).toEqual(['Orchard', 'Orchard Signal'])
  })

  describe('ranking', () => {
    const local = openIndex(':memory:')
    const add = (folder: string, type: string, name: string, extra = '', body = ''): void =>
      local.indexFile(`${folder}/${name}.md`, `---\ntype: ${type}\nname: ${name}\n${extra}---\n${body}\n`, schema)
    beforeAll(() => {
      add('Research', 'research', 'Fruit', '', 'Orchard yields, orchard orchard orchard.')
      add('Companies', 'company', 'Borchardt Labs')
      add('Companies', 'company', 'Old Orchard Co')
      add('Companies', 'company', 'Orchard Signal Holdings')
      add('Companies', 'company', 'Orchard Signal', '', 'Signal startup.')
      add('Companies', 'company', 'Orchard')
      add('Companies', 'company', 'Greenfield Partners', 'aliases: [Grove]\n')
      add('Research', 'research', 'Groves of Academe')
    })
    const ranked = (q: string, limit?: number): string[] => names(local.search(q, limit).map((h) => h.record))

    it('puts the exact name first, then name prefixes, word prefixes, other name matches, then body-only', () => {
      expect(ranked('orchard')).toEqual([
        'Orchard', // exact
        'Orchard Signal', // name prefix, shorter first
        'Orchard Signal Holdings',
        'Old Orchard Co', // a word in the name starts with it
        'Borchardt Labs', // the name contains it
        'Fruit' // only the body matches
      ])
    })
    it('treats an alias as an exact match and matches every term as a word prefix', () => {
      expect(ranked('grove')[0]).toBe('Greenfield Partners')
      expect(ranked('grove')).toContain('Groves of Academe')
      expect(ranked('orch sig')).toEqual(['Orchard Signal', 'Orchard Signal Holdings'])
      expect(ranked('signal holdings')[0]).toBe('Orchard Signal Holdings')
    })
    it('ranks body-only matches after every name match and honours the limit', () => {
      expect(ranked('signal')).toEqual(['Orchard Signal', 'Orchard Signal Holdings']) // no repeat from the body
      expect(ranked('startup')).toEqual(['Orchard Signal'])
      expect(ranked('orchard', 2)).toEqual(['Orchard', 'Orchard Signal'])
      expect(ranked('orchard', 0)).toEqual([])
    })
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

describe('what counts as a record', () => {
  it('ignores notes outside type folders and non-.md paths, like rebuild', () => {
    const local = openIndex(':memory:')
    local.indexFile('Scratch/x.md', '---\ntype: company\nname: X\n---\n', schema)
    local.indexFile('Companies/x.png', '---\ntype: company\nname: Y\n---\n', schema)
    expect(local.byPath('Scratch/x.md')).toBeNull()
    expect(local.byPath('Companies/x.png')).toBeNull()
    expect(local.list('company')).toEqual([])
  })

  it('drops every row of a note that stops being a record', () => {
    const local = openIndex(':memory:')
    const text = '---\ntype: company\nname: Gone Co\naliases: [Gc]\n---\nuniqueword [[Elsewhere]]\n'
    local.indexFile('Companies/Gone Co.md', text, schema)
    expect(local.resolveName('gc')).not.toBeNull()
    const moved = { ...schema, types: { ...schema.types, company: { ...schema.types.company, folder: 'Cos' } } }
    local.indexFile('Companies/Gone Co.md', text, moved)
    expect(local.byPath('Companies/Gone Co.md')).toBeNull()
    expect(local.resolveName('gc')).toBeNull()
    expect(local.allNames().size).toBe(0)
    expect(local.search('uniqueword')).toEqual([])
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
