// Holds the saved views the screen renders. Edits apply immediately and saves run one at a time,
// each built from the latest edited views, so rapid edits (two filter clicks, filter then sort)
// never overwrite each other.
import type { ViewDef } from '../../../shared/api'

export interface ViewsStore {
  get(): ViewDef[] | undefined
  subscribe(fn: () => void): () => void
  /** Load views from disk. Ignored while edits are still being saved, so they aren't overwritten. */
  sync(views: ViewDef[] | undefined): void
  /** Apply an edit to the latest views and queue a save. Resolves when this save is done; rejects if it fails. */
  edit(fn: (views: ViewDef[]) => ViewDef[]): Promise<void>
}

export function createViewsStore(save: (views: ViewDef[]) => Promise<unknown>): ViewsStore {
  let current: ViewDef[] | undefined
  let pending = 0
  let chain: Promise<unknown> = Promise.resolve()
  const subs = new Set<() => void>()
  const set = (v: ViewDef[] | undefined): void => {
    current = v
    subs.forEach((fn) => fn())
  }
  return {
    get: () => current,
    subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)),
    sync(views) {
      if (pending === 0 && views !== current) set(views)
    },
    edit(fn) {
      if (!current) return Promise.reject(new Error('Views are still loading.'))
      const next = fn(current)
      set(next)
      pending++
      const run = chain.then(() => save(next))
      chain = run.catch(() => undefined)
      return run.then(
        () => void pending--,
        (e) => {
          pending--
          throw e
        }
      )
    }
  }
}
