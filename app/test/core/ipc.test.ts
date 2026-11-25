import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Index } from '../../src/core/index'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChangeHandler } from '../../src/main/changes'
import {
  closeCurrentVault,
  buildHandlers,
  registerIpc,
  serializeError,
  type Deps,
  type Handlers
} from '../../src/main/ipc'
import { loadSettings, rememberVault } from '../../src/main/settings'
import { isRelevant, watchVault } from '../../src/main/watcher'
import { KEW_METHODS, type InvokeMethod } from '../../src/shared/methods'
import { ValidationError } from '../../src/core/schema/validate'
import type { Vault } from '../../src/core/vault'
import type { KewApi } from '../../src/shared/api'

const ALL_KEYS = [
  'getState',
  'planSetup',
  'createVault',
  'openVault',
  'chooseFolder',
  'today',
  'list',
  'get',
  'search',
  'schema',
  'views',
  'history',
  'createRecord',
  'setFields',
  'setBody',
  'rename',
  'logOutreach',
  'weMet',
  'passCompany',
  'snooze',
  'changeSchema',
  'affectedCount',
  'saveViews',
  'undo',
  'rebuildIndex',
  'openInFinder',
  'revealVault'
] as const satisfies readonly Exclude<keyof KewApi, 'onChanged'>[]

let tmp: string
let current: Vault | null
let events: string[]
let shown: string[]
let deps: Deps
const make = (): Handlers =>
  buildHandlers(
    () => current,
    (v) => {
      current = v
    },
    deps
  )

beforeEach(async () => {
  tmp = await fsp.mkdtemp(join(tmpdir(), 'kew-ipc-'))
  current = null
  events = []
  shown = []
  deps = {
    userData: join(tmp, 'userData'),
    home: join(tmp, 'home'),
    today: () => '2026-11-24',
    chooseFolder: async () => '/picked',
    showInFolder: (p) => {
      shown.push(p)
    },
    onVaultOpened: (v) => {
      events.push('open:' + v.root)
    },
    onVaultClosed: () => {
      events.push('close')
    },
    markOwnWrite: () => {}
  }
})
afterEach(async () => {
  current?.close()
  await fsp.rm(tmp, { recursive: true, force: true })
})

describe('handler map', () => {
  it('covers every KewApi method except onChanged', () => {
    expect(Object.keys(make()).sort()).toEqual([...ALL_KEYS].sort())
    expect([...KEW_METHODS].sort()).toEqual([...ALL_KEYS].sort())
  })

  it('registers one kew:<method> channel each and serializes thrown errors with their name', async () => {
    const channels: Record<string, (e: unknown, ...a: unknown[]) => unknown> = {}
    registerIpc(
      {
        handle: (c, f) => {
          channels[c] = f
        }
      },
      () => current,
      (v) => {
        current = v
      },
      deps
    )
    expect(Object.keys(channels).sort()).toEqual(
      KEW_METHODS.map((m: InvokeMethod) => `kew:${m}`).sort()
    )
    expect(await channels['kew:today']({})).toEqual({
      error: { name: 'NoVaultError', message: 'No vault is open' }
    })
  })

  it('serializes a ValidationError by name', () => {
    const env = serializeError(new ValidationError('bad value'))
    expect(env).toEqual({
      error: { name: 'ValidationError', message: expect.stringContaining('bad value') }
    })
  })
})

describe('integration through handlers', () => {
  it('sample vault: today non-empty, logOutreach shows in history', async () => {
    const h = make()
    await expect(h.today()).rejects.toMatchObject({ name: 'NoVaultError' })
    const root = join(tmp, 'sample')
    const info = await h.createVault('sample', root)
    expect(info.isSample).toBe(true)
    expect(events).toEqual(['open:' + root])
    const t = await h.today()
    expect(
      t.followUps.length + t.repliesOwed.length + t.reachOut.length + t.newInbound.length
    ).toBeGreaterThan(0)
    const person = (await h.list('person'))[0]
    const r = await h.logOutreach(person.id, { dir: 'out', channel: 'email', text: 'Hello there' })
    expect((await h.history()).map((e) => e.id)).toContain(r.entry.id)
    await h.openInFinder(person.id)
    await h.revealVault()
    expect(shown[1]).toBe(root)
    shown.pop()
    expect(shown).toHaveLength(1)
    expect(shown[0].endsWith(person.path)).toBe(true)
    expect((await h.getState()).recent).toEqual([{ root, exists: true }])
  })

  it('refuses a non-empty folder, then openVault adopts it; switching closes the old vault', async () => {
    const h = make()
    const a = join(tmp, 'a')
    await fsp.mkdir(a)
    await fsp.writeFile(join(a, '.DS_Store'), '')
    await h.createVault('empty', a)
    const b = join(tmp, 'b')
    await fsp.mkdir(b)
    await fsp.writeFile(join(b, 'x.md'), '# x')
    await expect(h.createVault('empty', b)).rejects.toMatchObject({
      name: 'FolderNotEmptyError',
      path: b
    })
    expect(serializeError(await h.createVault('empty', b).catch((e) => e))).toEqual({
      error: { name: 'FolderNotEmptyError', message: expect.any(String), path: b }
    })
    expect((await h.planSetup(b)).willCreate.length).toBeGreaterThan(0)
    await h.openVault(b)
    expect(events).toEqual(['open:' + a, 'close', 'open:' + b])
    expect((await h.getState()).recent).toEqual([
      { root: b, exists: true },
      { root: a, exists: true }
    ])
  })
})

describe('opening a vault', () => {
  it('rebuilds the index exactly once', async () => {
    const spy = vi.spyOn(Index.prototype, 'rebuild')
    try {
      const h = make()
      const a = join(tmp, 'once')
      await h.createVault('empty', a)
      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockClear()
      await h.openVault(a)
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('picks up notes added by hand while the app was closed', async () => {
    const h = make()
    const a = join(tmp, 'hand')
    await h.createVault('empty', a)
    await h.openVault(a) // reopen with a populated index
    await fsp.writeFile(join(a, 'Companies/Hand Made.md'), '---\ntype: company\nname: Hand Made\n---\n')
    await h.openVault(a)
    expect((await h.list('company')).map((c) => c.name)).toEqual(['Hand Made'])
  })
})

describe('recent and missing folders', () => {
  it('flags recent folders that no longer exist and refuses to open them without writing', async () => {
    const h = make()
    const gone = join(tmp, 'gone')
    await fsp.mkdir(gone)
    await h.createVault('empty', gone)
    await fsp.rm(gone, { recursive: true })
    expect((await h.getState()).recent).toEqual([{ root: gone, exists: false }])
    await expect(h.openVault(gone)).rejects.toMatchObject({
      name: 'FolderMissingError',
      path: gone
    })
    await expect(fsp.stat(gone)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('vault switching', () => {
  it('a failed openVault keeps the previous vault open and usable', async () => {
    const h = make()
    await h.createVault('sample', join(tmp, 's'))
    const bad = join(tmp, 'file.txt')
    await fsp.writeFile(bad, 'not a folder')
    await expect(h.openVault(join(bad, 'sub'))).rejects.toBeDefined()
    expect(current).not.toBeNull()
    expect(events).toEqual(['open:' + join(tmp, 's')])
    expect((await h.list('person')).length).toBeGreaterThan(0)
  })
  it('closeCurrentVault closes the vault and notifies once', async () => {
    const h = make()
    await h.createVault('empty', join(tmp, 'e'))
    closeCurrentVault(
      () => current,
      (v) => {
        current = v
      },
      deps
    )
    closeCurrentVault(
      () => current,
      (v) => {
        current = v
      },
      deps
    )
    expect(current).toBeNull()
    expect(events).toEqual(['open:' + join(tmp, 'e'), 'close'])
  })
})

describe('change handler', () => {
  const fake = (ids: string[]): Vault => ({ onExternalChange: async () => ids }) as unknown as Vault
  it('broadcasts ids, and schema edits even with no ids', async () => {
    const v = fake(['a']),
      v2 = fake([]),
      out: string[][] = []
    await createChangeHandler(
      () => v,
      (i) => out.push(i)
    )(v, ['Companies/A.md'])
    await createChangeHandler(
      () => v2,
      (i) => out.push(i)
    )(v2, ['.kew/schema.yaml'])
    expect(out).toEqual([['a'], []])
  })
  it('stays silent when nothing changed, or when the vault was switched meanwhile', async () => {
    const old = fake(['a']),
      out: string[][] = []
    const quiet = fake([]),
      other = fake([])
    await createChangeHandler(
      () => quiet,
      (i) => out.push(i)
    )(quiet, ['x.md'])
    await createChangeHandler(
      () => null,
      (i) => out.push(i)
    )(old, ['x.md'])
    await createChangeHandler(
      () => other,
      (i) => out.push(i)
    )(old, ['.kew/schema.yaml'])
    expect(out).toEqual([])
  })
  it('reports errors instead of throwing', async () => {
    const bad = {
      onExternalChange: async () => {
        throw new Error('boom')
      }
    } as unknown as Vault
    const errs: unknown[] = []
    await createChangeHandler(
      () => bad,
      () => {},
      (e) => errs.push(e)
    )(bad, ['x.md'])
    expect(errs).toHaveLength(1)
  })
})

describe('settings', () => {
  it('keeps recent de-duplicated, most recent first, capped at 5', () => {
    for (const r of ['/1', '/2', '/3', '/4', '/5', '/6', '/3']) rememberVault(deps.userData, r)
    expect(loadSettings(deps.userData)).toEqual({
      lastVault: '/3',
      recent: ['/3', '/6', '/5', '/4', '/2']
    })
  })
  it('defaults when missing', () => {
    expect(loadSettings(deps.userData)).toEqual({ lastVault: null, recent: [] })
  })
})

describe('watcher', () => {
  it('filters paths', () => {
    expect(isRelevant('Companies/Acme.md')).toBe(true)
    expect(isRelevant('.kew/schema.yaml')).toBe(true)
    expect(isRelevant('.kew/views.yaml')).toBe(true)
    expect(isRelevant('.kew/sample')).toBe(false)
    expect(isRelevant('.git/x.md')).toBe(false)
    expect(isRelevant('Companies/.Acme.md.kew-tmp-123')).toBe(false)
    expect(isRelevant('Companies/.hidden.md')).toBe(false)
    expect(isRelevant('Companies/logo.png')).toBe(false)
  })

  it("suppresses the app's own views.yaml writes but not external ones", async () => {
    const root = join(tmp, 'o')
    await fsp.mkdir(join(root, '.kew'), { recursive: true })
    const seen: string[][] = []
    const w = watchVault(root, (p) => seen.push(p))
    await new Promise((r) => setTimeout(r, 300))
    w.markOwnWrite(['.kew/views.yaml', 'Companies/A.md'])
    await fsp.writeFile(join(root, '.kew', 'views.yaml'), 'v')
    await new Promise((r) => setTimeout(r, 1000))
    expect(seen).toEqual([])
    await new Promise((r) => setTimeout(r, 300))
    await fsp.writeFile(join(root, '.kew', 'views.yaml'), 'v2')
    await new Promise((r) => setTimeout(r, 1000))
    await w.close()
    expect(seen.flat()).toEqual(['.kew/views.yaml'])
  })

  it('reports debounced external edits only', async () => {
    const root = join(tmp, 'w')
    await fsp.mkdir(join(root, 'Companies'), { recursive: true })
    const seen: string[][] = []
    const w = watchVault(root, (p) => seen.push(p))
    await new Promise((r) => setTimeout(r, 300))
    await fsp.writeFile(join(root, 'Companies', 'A.md'), 'a')
    await fsp.writeFile(join(root, 'Companies', '.A.md.kew-tmp-1'), 'a')
    await fsp.writeFile(join(root, 'Companies', 'pic.png'), 'a')
    await new Promise((r) => setTimeout(r, 1500))
    await w.close()
    expect(seen.flat()).toEqual(['Companies/A.md'])
  })
})
