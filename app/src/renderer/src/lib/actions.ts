// Every write goes through `status.run` so the status line can say "Saving…" or show the last failure.
import { useSyncExternalStore } from 'react'

export interface Status {
  pending: number
  error: string | null
}

/** Turns an error from the vault into a sentence a user can act on. */
export function plainError(e: unknown): string {
  const err = e instanceof Error ? e : new Error(String(e))
  const message = err.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
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

/** The entry ⌘Z undoes: the newest action whose files still match it (undo entries are skipped). */
export function latestUndoable<E extends { kind: string; undoable: boolean }>(
  entries: E[]
): E | null {
  return entries.find((e) => e.kind === 'action' && e.undoable) ?? null
}
