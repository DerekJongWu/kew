// Every write goes through `status.run` so the status line can say "Saving…" or show the last failure.
import { useSyncExternalStore } from 'react'

export interface Status {
  pending: number
  error: string | null
}

/** Turns an error from the vault into a sentence a user can act on. */
export function plainError(e: unknown): string {
  const err = e instanceof Error ? e : new Error(String(e))
  const message = err.message
  if (err.name === 'UndoConflictError') {
    const file = /Can't undo: (.+?) has changed/.exec(message)?.[1] ?? 'a file'
    const name = file.split('/').pop()!.replace(/\.md$/, '')
    return `Can't undo: ${name} was edited after this change. Undo the later change first.`
  }
  if (err.name === 'NoVaultError') return 'No vault is open. Open one to continue.'
  return message
}

export function createStatus(): {
  get(): Status
  run<T>(fn: () => Promise<T>): Promise<T>
  subscribe(fn: () => void): () => void
} {
  let state: Status = { pending: 0, error: null }
  const subs = new Set<() => void>()
  const set = (next: Status): void => {
    state = next
    subs.forEach((fn) => fn())
  }
  return {
    get: () => state,
    async run(fn) {
      set({ ...state, pending: state.pending + 1 })
      try {
        const out = await fn()
        set({ pending: state.pending - 1, error: null })
        return out
      } catch (e) {
        set({ pending: state.pending - 1, error: plainError(e) })
        throw e
      }
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    }
  }
}

export const status = createStatus()

export const useStatus = (): Status => useSyncExternalStore(status.subscribe, status.get)

const UNDID = 'Undid: '

/**
 * What ⌘Z undoes, newest entries first: the newest action that hasn't been undone. Undo entries
 * cancel the action they undid (matched by message; undoing an undo cancels that undo, so the
 * action is live again) and external edits are skipped. If that action can't be undone (its
 * notes changed since), ⌘Z stops there with the reason instead of undoing something older.
 */
export function undoTarget<E extends { kind: string; undoable: boolean; message: string }>(
  entries: E[]
): { entry: E } | { reason: string } | null {
  const cancelled: string[] = []
  for (const e of entries) {
    if (e.kind === 'external') continue
    const i = cancelled.indexOf(e.message)
    if (i >= 0) {
      cancelled.splice(i, 1)
      continue
    }
    if (e.kind === 'undo') {
      if (e.message.startsWith(UNDID)) cancelled.push(e.message.slice(UNDID.length))
      continue
    }
    if (e.undoable) return { entry: e }
    return { reason: `Can't undo “${e.message}”: its notes changed since.` }
  }
  return null
}
