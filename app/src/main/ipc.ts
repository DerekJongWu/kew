import { existsSync, promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { Vault, vaultDataDir } from '../core/vault'
import { planSetup, setupVault } from '../core/setup'
import { generateSample } from '../core/sample'
import { rememberVault, loadSettings } from './settings'
import { KEW_METHODS, type Envelope, type InvokeMethod } from '../shared/methods'
import type { KewApi, VaultInfo } from '../shared/api'

export type Handlers = { [K in InvokeMethod]: KewApi[K] }

/** Electron-only and environment dependencies, injected so handlers can run under plain Node. */
export interface Deps {
  userData: string
  home: string
  today(): string
  chooseFolder(): Promise<string | null>
  showInFolder(path: string): void
  /** Called after a vault opens (start the watcher) and before it closes (stop it). */
  onVaultOpened(v: Vault): void
  onVaultClosed(): void
  /** Called with vault-relative files the app just wrote. */
  markOwnWrite(files: string[]): void
}

function named(name: string, message: string, path?: string): Error & { path?: string } {
  const e: Error & { path?: string } = new Error(message)
  e.name = name
  if (path !== undefined) e.path = path
  return e
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fsp.stat(p)).isDirectory()
  } catch {
    return false
  }
}

const IGNORED_ENTRIES = new Set(['.DS_Store'])
async function isNonEmpty(dir: string): Promise<boolean> {
  try {
    return (await fsp.readdir(dir)).some((n) => !IGNORED_ENTRIES.has(n))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw e
  }
}

/**
 * Stops the watcher and closes the open vault (if any), resolving once its queued actions have
 * finished. Used on switch and on app quit.
 */
export async function closeCurrentVault(
  getVault: () => Vault | null,
  setVault: (v: Vault | null) => void,
  deps: Pick<Deps, 'onVaultClosed'>
): Promise<void> {
  const v = getVault()
  if (!v) return
  deps.onVaultClosed()
  setVault(null)
  await v.close()
}

export function buildHandlers(
  getVault: () => Vault | null,
  setVault: (v: Vault | null) => void,
  deps: Deps
): Handlers {
  const need = (): Vault => {
    const v = getVault()
    if (!v) throw named('NoVaultError', 'No vault is open')
    return v
  }
  const open = async (root: string): Promise<VaultInfo> => {
    // Open the new vault first: if it fails, the current vault stays open and usable.
    // Vault.open rebuilds the index, picking up hand edits made while the app was closed.
    const v = await Vault.open(root, vaultDataDir(deps.userData, root), { today: deps.today })
    await closeCurrentVault(getVault, setVault, deps)
    setVault(v)
    rememberVault(deps.userData, root)
    deps.onVaultOpened(v)
    return v.info()
  }
  const track = async <R extends { entry: { files: string[] } }>(p: Promise<R>): Promise<R> => {
    const r = await p
    deps.markOwnWrite(r.entry.files)
    return r
  }

  const raw = {
    getState: async () => ({
      vault: getVault()?.info() ?? null,
      recent: await Promise.all(
        loadSettings(deps.userData).recent.map(async (root) => ({
          root,
          exists: await isDirectory(root)
        }))
      )
    }),
    planSetup: (root) => planSetup(root),
    createVault: async (kind, root) => {
      const target = root ?? join(deps.home, 'Documents', kind === 'sample' ? 'Kew Sample' : 'Kew')
      if (await isNonEmpty(target))
        throw named('FolderNotEmptyError', `Folder is not empty: ${target}`, target)
      if (kind === 'sample') await generateSample(target, deps.today())
      else await setupVault(target)
      return open(target)
    },
    openVault: async (root) => {
      // Never recreate a vault's skeleton for a folder that has gone away.
      if (!(await isDirectory(root)))
        throw named('FolderMissingError', `Folder not found: ${root}`, root)
      await setupVault(root)
      return open(root)
    },
    chooseFolder: () => deps.chooseFolder(),
    today: () => need().today(),
    list: (type, q) => need().list(type, q),
    get: (id) => need().get(id),
    search: (text, limit) => need().search(text, limit),
    schema: async () => need().schema(),
    views: () => need().views(),
    history: (limit) => need().history(limit),
    createRecord: async (type, name, fields, force) => {
      const r = await need().createRecord(type, name, fields, force)
      if ('entry' in r) deps.markOwnWrite(r.entry.files)
      return r
    },
    setFields: (id, c) => track(need().setFields(id, c)),
    setBody: (id, b) => track(need().setBody(id, b)),
    rename: (id, n) => track(need().rename(id, n)),
    logOutreach: (id, e) => track(need().logOutreach(id, e)),
    weMet: (id) => track(need().weMet(id)),
    passCompany: (id, r) => track(need().passCompany(id, r)),
    snooze: (id, u) => track(need().snooze(id, u)),
    changeSchema: (c) => track(need().changeSchema(c)),
    affectedCount: async (c) => need().affectedCount(c),
    saveViews: (v) => track(need().saveViews(v)),
    undo: (id) => track(need().undo(id)),
    rebuildIndex: () => need().rebuildIndex(),
    openInFinder: async (id) => {
      const p = need().pathOf(id)
      if (p) deps.showInFolder(p)
    },
    revealVault: async () => deps.showInFolder(need().root)
  } satisfies Handlers
  // Make synchronous throws (NoVaultError) surface as rejections like every other failure.
  return Object.fromEntries(
    Object.entries(raw).map(([k, f]) => [
      k,
      async (...a: unknown[]) => (f as (...x: unknown[]) => unknown)(...a)
    ])
  ) as unknown as Handlers
}

export function serializeError(e: unknown): Envelope {
  const err = e instanceof Error ? e : new Error(String(e))
  const path = (err as { path?: unknown }).path
  return {
    error: {
      name: err.name,
      message: err.message,
      ...(err.name === 'FolderNotEmptyError' && typeof path === 'string' ? { path } : {})
    }
  }
}

/** Wires every handler to `ipc.handle('kew:<method>')`; results are wrapped as `{ value }` or `{ error }`. */
export function registerIpc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ipc: { handle(channel: string, fn: (event: any, ...args: any[]) => unknown): void },
  getVault: () => Vault | null,
  setVault: (v: Vault | null) => void,
  deps: Deps
): Handlers {
  const handlers = buildHandlers(getVault, setVault, deps)
  for (const m of KEW_METHODS) {
    const fn = handlers[m] as (...a: unknown[]) => Promise<unknown>
    ipc.handle(`kew:${m}`, async (_e, ...args: unknown[]): Promise<Envelope> => {
      try {
        return { value: await fn(...args) }
      } catch (e) {
        return serializeError(e)
      }
    })
  }
  return handlers
}

/** Reopens the last vault if it still exists. Failures are swallowed so launch always succeeds. */
export async function reopenLast(handlers: Handlers, userData: string): Promise<void> {
  const { lastVault } = loadSettings(userData)
  if (!lastVault || !existsSync(lastVault)) return
  try {
    await handlers.openVault(lastVault)
  } catch (e) {
    console.error('Could not reopen last vault', e)
  }
}
