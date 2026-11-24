import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fsp } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { History, UndoConflictError, NotUndoableError } from '../../src/core/history'

let tmp: string, vault: string, gitdir: string

const write = async (rel: string, content: string): Promise<void> => {
  await fsp.mkdir(dirname(join(vault, rel)), { recursive: true })
  await fsp.writeFile(join(vault, rel), content)
}
const read = (rel: string): Promise<string> => fsp.readFile(join(vault, rel), 'utf8')
// Stand-in for the write path: applies the restores that undo() returns.
const apply = async (restores: { path: string; content: string | null }[]): Promise<void> => {
  for (const r of restores) {
    if (r.content === null) await fsp.rm(join(vault, r.path), { force: true })
    else await write(r.path, r.content)
  }
}

beforeEach(async () => {
  tmp = await fsp.mkdtemp(join(tmpdir(), 'kew-hist-'))
  vault = join(tmp, 'vault')
  gitdir = join(tmp, 'history.git')
  await fsp.mkdir(vault)
  await write('Companies/Acme.md', 'one\n')
  await write('.kew/schema.yaml', 'types: {}\n')
  await write('.obsidian/app.json', '{}')
  await write('.DS_Store', 'x')
})
afterEach(() => fsp.rm(tmp, { recursive: true, force: true }))

describe('History', () => {
  it('first open commits the vault as Initial state, outside the vault', async () => {
    const h = await History.open(gitdir, vault)
    const list = await h.list(10)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ message: 'Initial state', kind: 'external', undoable: false })
    expect(list[0].files.sort()).toEqual(['.kew/schema.yaml', 'Companies/Acme.md'])
    expect(existsSync(join(vault, '.git'))).toBe(false)
    expect(existsSync(gitdir)).toBe(true)
    expect(Number.isNaN(Date.parse(list[0].time))).toBe(false)
  })

  it('reopening does not add another initial commit', async () => {
    await History.open(gitdir, vault)
    const h = await History.open(gitdir, vault)
    expect(await h.list(10)).toHaveLength(1)
  })

  it('commitAction records an undoable entry', async () => {
    const h = await History.open(gitdir, vault)
    await write('Companies/Acme.md', 'two\n')
    const e = await h.commitAction(['Companies/Acme.md'], 'Edited Acme')
    expect(e).toMatchObject({ message: 'Edited Acme', kind: 'action', files: ['Companies/Acme.md'], undoable: true })
    const list = await h.list(10)
    expect(list.map((x) => x.message)).toEqual(['Edited Acme', 'Initial state'])
    expect(list[0].undoable).toBe(true)
  })

  it('undo returns restores and applying them brings back the exact previous bytes', async () => {
    const h = await History.open(gitdir, vault)
    await write('Companies/Acme.md', 'two\n')
    const e = await h.commitAction(['Companies/Acme.md'], 'Edited Acme')
    const u = await h.undo(e.id)
    expect(u.message).toBe('Edited Acme')
    expect(u.restores).toEqual([{ path: 'Companies/Acme.md', content: 'one\n' }])
    expect(await read('Companies/Acme.md')).toBe('two\n') // undo itself writes nothing
    await apply(u.restores)
    expect(await read('Companies/Acme.md')).toBe('one\n')
  })

  it('undo of a create yields a delete', async () => {
    const h = await History.open(gitdir, vault)
    await write('Companies/New.md', 'n\n')
    const e = await h.commitAction(['Companies/New.md'], 'Created New')
    const u = await h.undo(e.id)
    expect(u.restores).toEqual([{ path: 'Companies/New.md', content: null }])
    await apply(u.restores)
    expect(existsSync(join(vault, 'Companies/New.md'))).toBe(false)
  })

  it('undo of a delete restores the file', async () => {
    const h = await History.open(gitdir, vault)
    await fsp.rm(join(vault, 'Companies/Acme.md'))
    const e = await h.commitAction(['Companies/Acme.md'], 'Deleted Acme')
    expect(e.undoable).toBe(true)
    const u = await h.undo(e.id)
    expect(u.restores).toEqual([{ path: 'Companies/Acme.md', content: 'one\n' }])
  })

  it('undo after a hand edit throws UndoConflictError and the edit is intact', async () => {
    const h = await History.open(gitdir, vault)
    await write('Companies/Acme.md', 'two\n')
    const e = await h.commitAction(['Companies/Acme.md'], 'Edited Acme')
    await write('Companies/Acme.md', 'hand edit\n')
    expect((await h.list(10))[0].undoable).toBe(false)
    const err = await h.undo(e.id).catch((x) => x)
    expect(err).toBeInstanceOf(UndoConflictError)
    expect(err.path).toBe('Companies/Acme.md')
    expect(await read('Companies/Acme.md')).toBe('hand edit\n')
  })

  it('undoing an undo entry re-applies the change (redo)', async () => {
    const h = await History.open(gitdir, vault)
    await write('Companies/Acme.md', 'two\n')
    const e = await h.commitAction(['Companies/Acme.md'], 'Edited Acme')
    const u = await h.undo(e.id)
    await apply(u.restores)
    const undoEntry = await h.commitAction(u.restores.map((r) => r.path), 'Undid: ' + u.message, 'undo')
    expect(undoEntry.kind).toBe('undo')
    expect(undoEntry.message).toBe('Undid: Edited Acme')
    const redo = await h.undo(undoEntry.id)
    await apply(redo.restores)
    expect(await read('Companies/Acme.md')).toBe('two\n')
  })

  it('commitExternal returns null when paths are unchanged, else records External edits', async () => {
    const h = await History.open(gitdir, vault)
    expect(await h.commitExternal(['Companies/Acme.md'])).toBeNull()
    await write('Companies/Acme.md', 'hand\n')
    const e = await h.commitExternal(['Companies/Acme.md', 'Companies/Missing.md'])
    expect(e).toMatchObject({ message: 'External edits', kind: 'external', files: ['Companies/Acme.md'], undoable: false })
    expect(await h.commitExternal(['Companies/Acme.md'])).toBeNull()
  })

  it('commitExternal records a hand deletion', async () => {
    const h = await History.open(gitdir, vault)
    await fsp.rm(join(vault, 'Companies/Acme.md'))
    const e = await h.commitExternal(['Companies/Acme.md'])
    expect(e?.files).toEqual(['Companies/Acme.md'])
  })

  it('list respects limit and only commits the given paths', async () => {
    const h = await History.open(gitdir, vault)
    await write('Companies/Other.md', 'o\n')
    await write('Companies/Acme.md', 'two\n')
    const e = await h.commitAction(['Companies/Acme.md'], 'Edited Acme')
    expect(e.files).toEqual(['Companies/Acme.md'])
    expect(await h.list(1)).toHaveLength(1)
  })

  it('refuses to undo the Initial state and external entries', async () => {
    const h = await History.open(gitdir, vault)
    const initial = (await h.list(10))[0]
    await expect(h.undo(initial.id)).rejects.toBeInstanceOf(NotUndoableError)
    await write('Companies/Acme.md', 'hand\n')
    const ext = await h.commitExternal(['Companies/Acme.md'])
    await expect(h.undo(ext!.id)).rejects.toBeInstanceOf(NotUndoableError)
    expect(await read('Companies/Acme.md')).toBe('hand\n')
  })

  it('an entry with no files is not undoable and undo throws', async () => {
    const h = await History.open(gitdir, vault)
    const e = await h.commitAction(['Companies/Acme.md'], 'No-op')
    expect(e.files).toEqual([])
    expect(e.undoable).toBe(false)
    await expect(h.undo(e.id)).rejects.toBeInstanceOf(NotUndoableError)
  })

  it('a later action on the same file blocks undo of the earlier one', async () => {
    const h = await History.open(gitdir, vault)
    await write('Companies/Acme.md', 'two\n')
    const first = await h.commitAction(['Companies/Acme.md'], 'First')
    await write('Companies/Acme.md', 'three\n')
    await h.commitAction(['Companies/Acme.md'], 'Second')
    const list = await h.list(10)
    expect(list.map((x) => x.undoable)).toEqual([true, false, false])
    await expect(h.undo(first.id)).rejects.toBeInstanceOf(UndoConflictError)
  })

  it('undoes a rename: old file restored, new file deleted', async () => {
    const h = await History.open(gitdir, vault)
    await fsp.rename(join(vault, 'Companies/Acme.md'), join(vault, 'Companies/Acme2.md'))
    const e = await h.commitAction(['Companies/Acme.md', 'Companies/Acme2.md'], 'Renamed')
    const u = await h.undo(e.id)
    expect(u.restores).toEqual([
      { path: 'Companies/Acme.md', content: 'one\n' },
      { path: 'Companies/Acme2.md', content: null }
    ])
    await apply(u.restores)
    expect(await read('Companies/Acme.md')).toBe('one\n')
    expect(existsSync(join(vault, 'Companies/Acme2.md'))).toBe(false)
  })
})
