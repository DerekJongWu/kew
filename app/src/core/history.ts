import fs, { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import git from 'isomorphic-git'
import type { HistoryEntry } from '../shared/api'

type Kind = HistoryEntry['kind']
export interface UndoRestore { path: string; content: string | null }

export class UndoConflictError extends Error {
  constructor(public readonly path: string) {
    super(`Can't undo: ${path} has changed since this action.`)
    this.name = 'UndoConflictError'
  }
}

export class NotUndoableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotUndoableError'
  }
}

const AUTHOR = { name: 'Kew', email: 'kew@localhost' }
const TRAILER = /\n\nKew-Kind: (action|external|undo)\s*$/

async function readCurrent(root: string, path: string): Promise<Buffer | null> {
  try {
    return await fsp.readFile(join(root, path))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') return null
    throw e
  }
}

const same = (a: Buffer | null, b: Buffer | null): boolean => (a === null || b === null ? a === b : a.equals(b))

export class History {
  private constructor(private readonly gitdir: string, private readonly root: string) {}

  static async open(gitdir: string, root: string): Promise<History> {
    const h = new History(gitdir, root)
    await fsp.mkdir(gitdir, { recursive: true })
    let hasHead = true
    try {
      await git.resolveRef({ fs, dir: root, gitdir, ref: 'HEAD' })
    } catch {
      hasHead = false
    }
    if (!hasHead) {
      await git.init({ fs, dir: root, gitdir, defaultBranch: 'main' })
      const files = await h.scanVault('')
      await h.stage(files)
      await h.commit('Initial state', 'external')
    }
    return h
  }

  /** Every file in the vault, skipping dot entries other than `.kew`. */
  private async scanVault(rel: string): Promise<string[]> {
    const out: string[] = []
    for (const d of await fsp.readdir(join(this.root, rel), { withFileTypes: true })) {
      if (d.name.startsWith('.') && !(rel === '' && d.name === '.kew')) continue
      const p = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) out.push(...(await this.scanVault(p)))
      else if (d.isFile()) out.push(p)
    }
    return out
  }

  private async stage(paths: string[]): Promise<void> {
    for (const filepath of paths) {
      if ((await readCurrent(this.root, filepath)) !== null) await git.add({ fs, dir: this.root, gitdir: this.gitdir, filepath })
      else await git.remove({ fs, dir: this.root, gitdir: this.gitdir, filepath })
    }
  }

  private commit(message: string, kind: Kind): Promise<string> {
    return git.commit({ fs, dir: this.root, gitdir: this.gitdir, message: `${message}\n\nKew-Kind: ${kind}`, author: AUTHOR, committer: AUTHOR })
  }

  async commitExternal(paths: string[]): Promise<HistoryEntry | null> {
    if (paths.length === 0) return null
    const rows = await git.statusMatrix({ fs, dir: this.root, gitdir: this.gitdir, filepaths: paths })
    const changed = rows.filter(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1)).map(([f]) => f)
    if (changed.length === 0) return null
    await this.stage(changed)
    return this.entry(await this.commit('External edits', 'external'))
  }

  async commitAction(paths: string[], message: string, kind: 'action' | 'undo' = 'action'): Promise<HistoryEntry> {
    await this.stage(paths)
    return this.entry(await this.commit(message, kind))
  }

  async list(limit: number): Promise<HistoryEntry[]> {
    const log = await git.log({ fs, dir: this.root, gitdir: this.gitdir, depth: limit })
    return Promise.all(log.map((c) => this.entry(c.oid)))
  }

  async undo(entryId: string): Promise<{ message: string; restores: UndoRestore[] }> {
    const { message, files, parent, kind } = await this.describe(entryId)
    if (kind === 'external') throw new NotUndoableError("Can't undo: this entry records edits made outside Kew.")
    if (files.length === 0) throw new NotUndoableError("Can't undo: this entry changed no files.")
    const restores: UndoRestore[] = []
    for (const path of files) {
      if (!same(await readCurrent(this.root, path), await this.blobAt(entryId, path))) throw new UndoConflictError(path)
      const before = parent ? await this.blobAt(parent, path) : null
      restores.push({ path, content: before === null ? null : before.toString('utf8') })
    }
    return { message, restores }
  }

  private async blobAt(oid: string, filepath: string): Promise<Buffer | null> {
    try {
      const { blob } = await git.readBlob({ fs, dir: this.root, gitdir: this.gitdir, oid, filepath })
      return Buffer.from(blob)
    } catch (e) {
      if ((e as { code?: string }).code === 'NotFoundError') return null
      throw e
    }
  }

  private async describe(oid: string): Promise<{ message: string; kind: Kind; time: string; files: string[]; parent: string | null }> {
    const { commit } = await git.readCommit({ fs, dir: this.root, gitdir: this.gitdir, oid })
    const m = TRAILER.exec(commit.message)
    const parent = commit.parent[0] ?? null
    const trees = parent ? [git.TREE({ ref: parent }), git.TREE({ ref: oid })] : [git.TREE({ ref: oid })]
    const found: string[][] = await git.walk({
      fs, dir: this.root, gitdir: this.gitdir, trees,
      map: async (filepath, entries) => {
        if (filepath === '.') return undefined
        const types = await Promise.all(entries.map((e) => e?.type() ?? null))
        if (types.some((t) => t === 'tree')) return undefined // directory: recurse via default iterate
        const oids = await Promise.all(entries.map((e) => e?.oid() ?? null))
        if (parent && oids[0] === oids[1]) return undefined
        return [filepath]
      }
    })
    return {
      message: m ? commit.message.slice(0, m.index) : commit.message.trimEnd(),
      kind: (m?.[1] as Kind | undefined) ?? 'external',
      time: new Date(commit.committer.timestamp * 1000).toISOString(),
      files: found.flat().sort(),
      parent
    }
  }

  private async entry(oid: string): Promise<HistoryEntry> {
    const d = await this.describe(oid)
    let undoable = d.kind !== 'external' && d.files.length > 0
    for (const path of undoable ? d.files : []) {
      if (!same(await readCurrent(this.root, path), await this.blobAt(oid, path))) { undoable = false; break }
    }
    return { id: oid, message: d.message, time: d.time, kind: d.kind, files: d.files, undoable }
  }
}
