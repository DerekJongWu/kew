import { watch } from 'chokidar'
import { relative, sep } from 'node:path'

const WATCHED_DOTFILES = new Set(['.kew/schema.yaml', '.kew/views.yaml'])
const OWN_WRITE_MS = 1000
const DEBOUNCE_MS = 300

/** True if a vault-relative, forward-slash path is one the vault should hear about. */
export function isRelevant(rel: string): boolean {
  if (WATCHED_DOTFILES.has(rel)) return true
  const segs = rel.split('/')
  if (segs.some((s) => s.startsWith('.'))) return false
  return /\.md$/i.test(rel)
}

/** Directories to descend into: anything not dot-prefixed, plus `.kew`. */
function isWalkable(rel: string): boolean {
  return rel.split('/').every((s) => !s.startsWith('.') || s === '.kew')
}

export interface VaultWatcher {
  /** Mark vault-relative paths as written by the app itself; their events are ignored for 1 s. */
  markOwnWrite(rels: string[]): void
  close(): Promise<void>
}

/** Watches `root`; calls `onPaths` (vault-relative, forward slashes) after a 300 ms debounce. */
export function watchVault(root: string, onPaths: (paths: string[]) => void): VaultWatcher {
  const own = new Map<string, number>()
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | null = null
  const toRel = (abs: string): string => relative(root, abs).split(sep).join('/')

  const w = watch(root, {
    ignoreInitial: true,
    ignored: (path, stats) => {
      const rel = toRel(path)
      if (rel === '') return false
      if (stats?.isFile()) return !isRelevant(rel)
      return !isWalkable(rel)
    }
  })
  const handle = (abs: string): void => {
    const rel = toRel(abs)
    if (!isRelevant(rel)) return
    const t = own.get(rel)
    if (t !== undefined && Date.now() - t < OWN_WRITE_MS) return
    pending.add(rel)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const paths = [...pending]
      pending.clear()
      onPaths(paths)
    }, DEBOUNCE_MS)
  }
  w.on('add', handle).on('change', handle).on('unlink', handle)
  return {
    markOwnWrite: (rels) => {
      const now = Date.now()
      for (const r of rels) if (r === '.kew/views.yaml') own.set(r, now)
    },
    close: async () => {
      if (timer) clearTimeout(timer)
      await w.close()
    }
  }
}
