import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fsp, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { History } from '../../src/core/history'
import { openIndex, type Index } from '../../src/core/index'
import { loadSchema } from '../../src/core/schema/load'
import { ValidationError } from '../../src/core/schema/validate'
import { applyAction, undoAction, ConflictError, type Ctx } from '../../src/core/write/apply'
import { createRecord, setFields, setBody, rename } from '../../src/core/write/records'
import { parseNote } from '../../src/core/note'
import type { ActionResult, DuplicateHit } from '../../src/shared/api'

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
const QUILL = 'Companies/Quill Security.md'
const QUILL_ID = '01KFIXQUILL0000000000000001'
const isResult = (r: ActionResult | { duplicates: DuplicateHit[] }): r is ActionResult =>
  'entry' in r

beforeEach(async () => {
  tmp = await fsp.mkdtemp(join(tmpdir(), 'kew-write-'))
  vault = join(tmp, 'vault')
  await fsp.cp(FIXTURE, vault, { recursive: true })
  history = await History.open(join(tmp, 'history.git'), vault)
  idx = openIndex(':memory:')
  await idx.rebuild(vault, schema)
  ctx = {
    root: vault,
    schema: () => schema,
    index: idx,
    history,
    today: () => TODAY,
    templates: TEMPLATES
  }
})
afterEach(async () => {
  idx.close()
  await fsp.rm(tmp, { recursive: true, force: true })
})

describe('createRecord', () => {
  it('writes a note with an id, given fields, first_seen and the template body', async () => {
    const r = await createRecord(ctx, 'company', 'Nimbus Data', {
      website: 'nimbus.example',
      pipeline_status: 'pursuing'
    })
    expect(isResult(r)).toBe(true)
    if (!isResult(r)) return
    const text = read('Companies/Nimbus Data.md')
    const id = /^id: (\w{26})$/m.exec(text)?.[1]
    expect(id).toBeTruthy()
    expect(text).toBe(
      `---\nid: ${id}\ntype: company\nname: Nimbus Data\nwebsite: nimbus.example\npipeline_status: pursuing\n` +
        `first_seen: ${TODAY}\ntags: [company]\n---\n\n## What it is\n`
    )
    expect(r.entry.message).toBe('Created Nimbus Data')
    expect(r.entry.kind).toBe('action')
    expect(r.changedIds).toEqual([id])
    expect(idx.resolveName('Nimbus Data')?.id).toBe(id)
  })

  it('adds created for research and uses a template without frontmatter as the body', async () => {
    const r = await createRecord(ctx, 'research', 'Robotics Notes')
    expect(isResult(r)).toBe(true)
    expect(read('Research/Robotics Notes.md')).toMatch(
      /\ncreated: 2026-11-24\ntags: \[research\]\n---\n$/
    )
    await createRecord(ctx, 'meeting', '2026-11-24 Quill Security intro', { date: '2026-11-24' })
    expect(read('Meetings/2026-11-24 Quill Security intro.md')).toMatch(
      /\ndate: 2026-11-24\n---\n## Notes\n$/
    )
  })

  it('returns duplicates for a known domain and writes nothing unless forced', async () => {
    const before = await history.list(50)
    const r = await createRecord(ctx, 'company', 'Quill Labs Two', {
      website: 'https://quill.example/about'
    })
    expect(isResult(r)).toBe(false)
    if (isResult(r)) return
    expect(r.duplicates.map((d) => [d.record.name, d.reason])).toEqual([
      ['Quill Security', 'domain']
    ])
    expect(existsSync(join(vault, 'Companies/Quill Labs Two.md'))).toBe(false)
    expect(await history.list(50)).toHaveLength(before.length)

    const forced = await createRecord(
      ctx,
      'company',
      'Quill Labs Two',
      { website: 'https://quill.example/about' },
      true
    )
    expect(isResult(forced)).toBe(true)
    expect(existsSync(join(vault, 'Companies/Quill Labs Two.md'))).toBe(true)
  })

  it('rejects names that would break file names or links', async () => {
    const n = (await history.list(50)).length
    await expect(createRecord(ctx, 'company', 'Acme / Labs')).rejects.toThrow(/can't contain \//)
    await expect(createRecord(ctx, 'company', 'Acme | Labs')).rejects.toThrow(/can't contain \|/)
    await expect(createRecord(ctx, 'company', 'Acme:Labs#1')).rejects.toBeInstanceOf(
      ValidationError
    )
    await expect(createRecord(ctx, 'company', 'Acme  Labs')).rejects.toBeInstanceOf(ValidationError)
    expect(
      (await fsp.readdir(join(vault, 'Companies'))).filter((f) => f.startsWith('Acme'))
    ).toEqual([])
    expect(await history.list(50)).toHaveLength(n)
  })

  it('suffixes cross-type clashes', async () => {
    const r = await createRecord(ctx, 'company', 'Sam Okafor')
    expect(isResult(r) && r.entry.message).toBe('Created Sam Okafor (company)')
    expect(read('Companies/Sam Okafor (company).md')).toContain('\nname: Sam Okafor (company)\n')

    await createRecord(ctx, 'person', 'AI Agent Security', { company: 'Quill Security' })
    const p = read('People/AI Agent Security (Quill Security).md')
    expect(p).toContain('\nname: AI Agent Security (Quill Security)\n')
    expect(p).toContain("\ncompany: '[[Quill Security]]'\n")
  })

  it('rejects an invalid field value and writes nothing', async () => {
    await expect(
      createRecord(ctx, 'company', 'Bad Co', { stage: 'bogus' }, true)
    ).rejects.toBeInstanceOf(ValidationError)
    expect(existsSync(join(vault, 'Companies/Bad Co.md'))).toBe(false)
  })
})

describe('setFields', () => {
  it('refuses derived fields (keys starting with _)', async () => {
    await expect(setFields(ctx, QUILL_ID, { _last_touch: 'x' })).rejects.toThrow(ValidationError)
    await expect(createRecord(ctx, 'company', 'Underscore Co', { _summary: 'x' })).rejects.toThrow(ValidationError)
  })

  it('changes only the target lines', async () => {
    const before = read(QUILL)
    const r = await setFields(ctx, QUILL_ID, { stage: 'series-a', pipeline_status: 'active' })
    const after = read(QUILL)
    const b = before.split('\n'),
      a = after.split('\n')
    expect(a).toHaveLength(b.length)
    const diff = b.map((l, i) => (l === a[i] ? null : [l, a[i]])).filter(Boolean)
    expect(diff).toEqual([
      ['pipeline_status: reached-out', 'pipeline_status: active'],
      ['stage: seed', 'stage: series-a']
    ])
    expect(r.entry.message).toBe('Updated Quill Security')
    expect(r.changedIds).toEqual([QUILL_ID])
    expect(idx.byId(QUILL_ID)?.fields.stage).toBe('series-a')
  })

  it('writes messages from labels', async () => {
    expect((await setFields(ctx, QUILL_ID, { pipeline_status: 'active' })).entry.message).toBe(
      'Moved Quill Security to Active'
    )
    expect((await setFields(ctx, QUILL_ID, { stage: 'series-a' })).entry.message).toBe(
      'Set Stage on Quill Security'
    )
  })

  it('removes a key on null and passes unknown keys through', async () => {
    await setFields(ctx, QUILL_ID, { source: null, my_custom: 'Hello: world' })
    const text = read(QUILL)
    expect(text).not.toContain('source:')
    expect(text).toContain("\nmy_custom: 'Hello: world'\ntags: [company]\n")
  })

  it('throws on an invalid value and writes nothing', async () => {
    const before = read(QUILL)
    const n = (await history.list(50)).length
    await expect(
      setFields(ctx, QUILL_ID, {
        stage: 'seed',
        conviction: 'not-a-number' as never,
        pipeline_status: 'bogus'
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(read(QUILL)).toBe(before)
    expect(await history.list(50)).toHaveLength(n)
  })

  it('assigns an id to a note that lacked one, in the same write', async () => {
    const rel = 'Companies/Orphan Co.md'
    await fsp.writeFile(join(vault, rel), '---\ntype: company\nname: Orphan Co\n---\nBody\n')
    idx.indexFile(rel, read(rel), schema)
    const pathId = idx.byPath(rel)!.id
    const r = await setFields(ctx, pathId, { stage: 'seed' })
    const text = read(rel)
    const id = /^id: (\w{26})$/m.exec(text)?.[1]
    expect(id).toBeTruthy()
    expect(text).toBe(`---\ntype: company\nname: Orphan Co\nid: ${id}\nstage: seed\n---\nBody\n`)
    expect(r.changedIds).toEqual([id])
    const entries = await history.list(3)
    expect(entries.map((e) => e.message)).toEqual([
      'Set Stage on Orphan Co',
      'External edits',
      'Initial state'
    ])
  })

  it('refuses to change id, type or name', async () => {
    const before = read(QUILL)
    await expect(setFields(ctx, QUILL_ID, { id: null })).rejects.toBeInstanceOf(ValidationError)
    await expect(setFields(ctx, QUILL_ID, { type: 'person' })).rejects.toBeInstanceOf(
      ValidationError
    )
    await expect(setFields(ctx, QUILL_ID, { name: 'Other' })).rejects.toThrow(/rename/)
    expect(read(QUILL)).toBe(before)
  })

  it('does not write or commit when nothing changes', async () => {
    const latest = (await history.list(1))[0]
    const r = await setFields(ctx, QUILL_ID, { stage: 'seed' })
    expect(r.changedIds).toEqual([])
    expect(r.entry.id).toBe(latest.id)
    expect((await history.list(1))[0].id).toBe(latest.id)
  })
})

describe('setBody', () => {
  it('replaces the body and keeps the frontmatter bytes', async () => {
    const before = read(QUILL)
    const r = await setBody(ctx, QUILL_ID, '\nNew body.\n')
    const fmEnd = before.indexOf('\n---\n') + 5
    expect(read(QUILL)).toBe(before.slice(0, fmEnd) + '\nNew body.\n')
    expect(r.entry.message).toBe('Edited Quill Security')
  })
})

describe('rename', () => {
  it('assigns an id to a note that lacked one, and reports it first in changedIds', async () => {
    const rel = 'Companies/Orphan Co.md'
    await fsp.writeFile(join(vault, rel), '---\ntype: company\nname: Orphan Co\n---\nBody\n')
    idx.indexFile(rel, read(rel), schema)
    const pathId = idx.byPath(rel)!.id
    expect(pathId.startsWith('path:')).toBe(true)
    const r = await rename(ctx, pathId, 'Orphan Two')
    const text = read('Companies/Orphan Two.md')
    const id = /^id: (\w{26})$/m.exec(text)?.[1]
    expect(id).toBeTruthy()
    expect(text).toBe(`---\ntype: company\nname: Orphan Two\nid: ${id}\n---\nBody\n`)
    expect(r.changedIds[0]).toBe(id)
    expect(idx.byId(id!)?.path).toBe('Companies/Orphan Two.md')
  })

  it('renames the file, rewrites links in other notes, and undo restores all of it', async () => {
    const sam = 'People/Sam Okafor.md',
      res = 'Research/Agent Security Landscape.md'
    const orig = { quill: read(QUILL), sam: read(sam), res: read(res) }
    const r = await rename(ctx, QUILL_ID, 'Quillon')
    expect(r.entry.message).toBe('Renamed Quill Security to Quillon')
    expect(existsSync(join(vault, QUILL))).toBe(false)
    const moved = read('Companies/Quillon.md')
    expect(moved).toBe(orig.quill.replace('name: Quill Security', 'name: Quillon'))
    expect(read(sam)).toBe(orig.sam.replace('"[[Quill Security]]"', '"[[Quillon]]"'))
    expect(read(res)).toBe(orig.res.replace('"[[Quill Security]]"', '"[[Quillon]]"'))
    expect(r.entry.files.sort()).toEqual(
      ['Companies/Quill Security.md', 'Companies/Quillon.md', res, sam].sort()
    )
    expect(idx.byId(QUILL_ID)?.path).toBe('Companies/Quillon.md')
    expect(
      idx
        .backlinks(QUILL_ID)
        .map((x) => x.name)
        .sort()
    ).toEqual(['Agent Security Landscape', 'Sam Okafor'])
    expect([...r.changedIds].sort()).toEqual(
      ['01KFIXRESEARCH00000000041', '01KFIXSAM00000000000000011', QUILL_ID].sort()
    )

    const u = await undoAction(ctx, r.entry.id)
    expect(u.entry.message).toBe('Undid: Renamed Quill Security to Quillon')
    expect(u.entry.kind).toBe('undo')
    expect(read(QUILL)).toBe(orig.quill)
    expect(read(sam)).toBe(orig.sam)
    expect(read(res)).toBe(orig.res)
    expect(existsSync(join(vault, 'Companies/Quillon.md'))).toBe(false)
    expect(idx.byId(QUILL_ID)?.path).toBe(QUILL)
  })

  it('rewrites links in loose notes outside the type folders, and undo restores them', async () => {
    const loose = 'Scratch/Ideas/Follow ups.md'
    const original = 'Ping [[quill security|Quill]] and [[Quill Security#Notes]].\n'
    await fsp.mkdir(join(vault, 'Scratch/Ideas'), { recursive: true })
    await fsp.writeFile(join(vault, loose), original)
    await fsp.writeFile(join(vault, '.hidden.md'), '[[Quill Security]]\n')
    const r = await rename(ctx, QUILL_ID, 'Quillon')
    expect(read(loose)).toBe('Ping [[Quillon|Quill]] and [[Quillon#Notes]].\n')
    expect(read('.hidden.md')).toBe('[[Quill Security]]\n')
    expect(r.entry.files).toContain(loose)
    await undoAction(ctx, r.entry.id)
    expect(read(loose)).toBe(original)
  })

  it('re-quotes frontmatter links when the new name has an apostrophe; every note still parses', async () => {
    const created = await createRecord(ctx, 'person', 'Pat Obrien')
    if (!isResult(created)) throw new Error('expected a record')
    const patId = created.changedIds[0]
    const meeting = 'Meetings/2026-11-01 Pat sync.md'
    const loose = 'Scratch/Pat.md'
    await fsp.writeFile(
      join(vault, meeting),
      [
        '---',
        'type: meeting',
        'name: 2026-11-01 Pat sync',
        "attendees: ['[[Pat Obrien]]', '[[Sam Okafor]]'] # who came",
        'host:',
        "  - '[[Pat Obrien]]'",
        'owner: "[[Pat Obrien]]"',
        "note: 'keep me'",
        '---',
        'Met [[Pat Obrien|Pat]] today.',
        ''
      ].join('\n')
    )
    await fsp.writeFile(join(vault, loose), 'Ask [[Pat Obrien]].\n')
    idx.indexFile(meeting, read(meeting), schema)

    await rename(ctx, patId, "Pat O'Brien")

    const text = read(meeting)
    expect(text).toBe(
      [
        '---',
        'type: meeting',
        'name: 2026-11-01 Pat sync',
        "attendees: ['[[Pat O''Brien]]', '[[Sam Okafor]]']",
        "host: ['[[Pat O''Brien]]']",
        'owner: "[[Pat O\'Brien]]"',
        "note: 'keep me'",
        '---',
        "Met [[Pat O'Brien|Pat]] today.",
        ''
      ].join('\n')
    )
    const parsed = parseNote(text)
    expect(parsed.ok).toBe(true)
    expect(parsed.fm.attendees).toEqual(["[[Pat O'Brien]]", '[[Sam Okafor]]'])
    expect(parsed.fm.host).toEqual(["[[Pat O'Brien]]"])
    expect(parsed.fm.owner).toBe("[[Pat O'Brien]]")
    expect(read(loose)).toBe("Ask [[Pat O'Brien]].\n")
    expect(parseNote(read("People/Pat O'Brien.md")).ok).toBe(true)
    expect(idx.backlinks(patId).map((x) => x.name)).toContain('2026-11-01 Pat sync')
  })

  it('rejects bad names and case-only renames, changing nothing', async () => {
    const before = read(QUILL)
    const n = (await history.list(50)).length
    await expect(rename(ctx, QUILL_ID, 'Acme / Labs')).rejects.toThrow(/can't contain \//)
    await expect(rename(ctx, QUILL_ID, 'Acme | Labs')).rejects.toThrow(/can't contain \|/)
    await expect(rename(ctx, QUILL_ID, 'quill security')).rejects.toThrow(/capitalization/)
    expect(read(QUILL)).toBe(before)
    expect(await fsp.readdir(join(vault, 'Companies'))).toContain('Quill Security.md')
    expect(await history.list(50)).toHaveLength(n)
  })

  it("suffixes a clashing new name but not the record's own alias", async () => {
    const r = await rename(ctx, QUILL_ID, 'Harbor Analytics')
    expect(r.entry.message).toBe('Renamed Quill Security to Harbor Analytics (company)')
    expect(existsSync(join(vault, 'Companies/Harbor Analytics (company).md'))).toBe(true)
    await rename(ctx, QUILL_ID, 'Quill')
    expect(existsSync(join(vault, 'Companies/Quill.md'))).toBe(true)
  })
})

describe('applyAction', () => {
  it('applies on top of a hand edit made between read and write, and records it first', async () => {
    const handEdited = read(QUILL) + '\nHand-written line.\n'
    let calls = 0
    ctx.hooks = {
      beforeWrite: async () => {
        if (calls++ === 0) await fsp.writeFile(join(vault, QUILL), handEdited)
      }
    }
    const r = await setFields(ctx, QUILL_ID, { pipeline_status: 'active' })
    expect(read(QUILL)).toBe(
      handEdited.replace('pipeline_status: reached-out', 'pipeline_status: active')
    )
    const entries = await history.list(3)
    expect(entries.map((e) => [e.message, e.kind])).toEqual([
      ['Moved Quill Security to Active', 'action'],
      ['External edits', 'external'],
      ['Initial state', 'external']
    ])
    expect(entries[1].files).toEqual([QUILL])
    expect(r.entry.id).toBe(entries[0].id)
  })

  it('throws ConflictError when the file keeps changing, and keeps the hand edit', async () => {
    let n = 0
    ctx.hooks = { beforeWrite: async () => fsp.appendFile(join(vault, QUILL), `edit ${++n}\n`) }
    await expect(setFields(ctx, QUILL_ID, { pipeline_status: 'active' })).rejects.toBeInstanceOf(
      ConflictError
    )
    expect(read(QUILL)).toMatch(/pipeline_status: reached-out[\s\S]*edit 1\nedit 2\n$/)
    expect((await history.list(10)).some((e) => e.kind === 'action')).toBe(false)
  })

  it('deletes with a null result and leaves no temp files', async () => {
    const r = await applyAction(ctx, 'Deleted Quill Security', [{ path: QUILL, apply: () => null }])
    expect(existsSync(join(vault, QUILL))).toBe(false)
    expect(idx.byId(QUILL_ID)).toBeNull()
    expect(r.changedIds).toEqual([QUILL_ID])
    await applyAction(ctx, 'Created x', [
      { path: 'Themes/New/Deep.md', apply: () => '---\ntype: theme\n---\n' }
    ])
    expect(read('Themes/New/Deep.md')).toBe('---\ntype: theme\n---\n')
    const all = await fsp.readdir(vault, { recursive: true })
    expect(all.filter((f) => String(f).includes('kew-tmp'))).toEqual([])
  })

  it('refuses deleting a path while writing a case variant of it', async () => {
    const before = read(QUILL)
    await expect(
      applyAction(ctx, 'bad', [
        { path: QUILL, apply: () => null },
        { path: 'Companies/quill security.md', apply: () => 'x' }
      ])
    ).rejects.toThrow(/capitalization/)
    expect(read(QUILL)).toBe(before)
  })

  it('rolls back earlier writes when a later write fails', async () => {
    const before = read(QUILL)
    const n = (await history.list(50)).length
    const locked = join(vault, 'Locked')
    ctx.hooks = {
      beforeWrite: async () => {
        await fsp.mkdir(locked, { recursive: true })
        await fsp.chmod(locked, 0o555)
      }
    }
    try {
      await expect(
        applyAction(ctx, 'Two files', [
          { path: QUILL, apply: (c) => c + 'more\n' },
          { path: 'Locked/new.md', apply: () => 'x' }
        ])
      ).rejects.toMatchObject({ code: 'EACCES' })
    } finally {
      await fsp.chmod(locked, 0o755)
    }
    expect(read(QUILL)).toBe(before)
    expect(existsSync(join(locked, 'new.md'))).toBe(false)
    expect(await history.list(50)).toHaveLength(n)
    expect(idx.byId(QUILL_ID)?.path).toBe(QUILL)
  })

  it('surfaces the original write error when an existing file in a read-only folder fails', async () => {
    const before = read(QUILL)
    const locked = join(vault, 'Locked')
    await fsp.mkdir(locked)
    await fsp.writeFile(join(locked, 'old.md'), 'keep\n')
    await fsp.chmod(locked, 0o555)
    try {
      const err = await applyAction(ctx, 'Two files', [
        { path: QUILL, apply: (c) => c + 'more\n' },
        { path: 'Locked/old.md', apply: (c) => c + 'more\n' }
      ]).catch((e: unknown) => e)
      expect(err).toMatchObject({ code: 'EACCES' })
      expect((err as Error).message).not.toMatch(/could not be put back/)
    } finally {
      await fsp.chmod(locked, 0o755)
    }
    expect(read(QUILL)).toBe(before)
    expect(read('Locked/old.md')).toBe('keep\n')
  })

  it('names the files it could not put back, keeping the original error as the cause', async () => {
    const real = fsp.rename.bind(fsp)
    let calls = 0
    const fail = (code: string): NodeJS.ErrnoException =>
      Object.assign(new Error(`${code}: simulated`), { code })
    const spy = vi.spyOn(fsp, 'rename').mockImplementation(async (a, b) => {
      calls++
      if (calls === 2) throw fail('EIO') // the second file's write
      if (calls === 3) throw fail('EPERM') // putting the first file back
      return real(a, b)
    })
    try {
      const err = (await applyAction(ctx, 'Two files', [
        { path: QUILL, apply: (c) => c + 'more\n' },
        { path: 'Companies/Lumen Ledger.md', apply: (c) => c + 'more\n' }
      ]).catch((e: unknown) => e)) as Error
      expect(err.message).toMatch(/could not be put back: Companies\/Quill Security\.md/)
      expect(err.message).toContain('EIO: simulated')
      expect(err.cause).toMatchObject({ code: 'EIO' })
    } finally {
      spy.mockRestore()
    }
  })

  it('refuses paths outside the vault', async () => {
    await expect(
      applyAction(ctx, 'bad', [{ path: '../escape.md', apply: () => 'x' }])
    ).rejects.toThrow(/outside the vault/)
    expect(existsSync(join(tmp, 'escape.md'))).toBe(false)
  })
})
