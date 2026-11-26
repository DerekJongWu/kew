// The one app-level toast: a short line after a one-click action ("Logged send to Ana Ruiz"),
// with Undo. A new toast replaces the old one; each hides itself after TOAST_MS unless paused.
import { useSyncExternalStore } from 'react'
import { formatDate } from './dates'
import { undoTarget } from './actions'

export const TOAST_MS = 5000

export interface Toast {
  id: number
  message: string
  /** The history entry the toast's Undo reverts; absent when there's nothing to undo. */
  entryId?: string
}

export function createToasts(ms = TOAST_MS): {
  get(): Toast | null
  show(message: string, entryId?: string): void
  /** Replaces the text of toast `id` (if it's still showing), drops its Undo and restarts the clock. */
  settle(id: number, message: string): void
  dismiss(): void
  /** Hover or keyboard focus on the toast holds it; leaving starts a fresh countdown. */
  pause(): void
  resume(): void
  subscribe(fn: () => void): () => void
} {
  let current: Toast | null = null
  let next = 1
  let timer: ReturnType<typeof setTimeout> | null = null
  const subs = new Set<() => void>()
  const set = (t: Toast | null): void => {
    current = t
    subs.forEach((fn) => fn())
  }
  const stop = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const start = (): void => {
    stop()
    timer = setTimeout(() => set(null), ms)
  }
  return {
    get: () => current,
    show(message, entryId) {
      set({ id: next++, message, ...(entryId ? { entryId } : {}) })
      start()
    },
    settle(id, message) {
      if (current?.id !== id) return
      set({ id, message })
      start()
    },
    dismiss() {
      stop()
      set(null)
    },
    pause: stop,
    resume() {
      if (current) start()
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    }
  }
}

export const toasts = createToasts()

export const useToast = (): Toast | null => useSyncExternalStore(toasts.subscribe, toasts.get)

/** The history entry id in a write's result (an ActionResult), if it has one. */
export function entryIdOf(result: unknown): string | undefined {
  const entry = (result as { entry?: { id?: unknown } } | null | undefined)?.entry
  return typeof entry?.id === 'string' ? entry.id : undefined
}

export const STALE_UNDO = 'Can’t undo — something changed since'

/**
 * The toast's Undo reverts only the action it announced: when that action is still what ⌘Z would
 * undo. Anything newer (a note save, a view change, another edit) makes it stale; ⌘Z itself still
 * undoes the newest change.
 */
export function toastUndo<
  E extends { id: string; kind: string; undoable: boolean; message: string }
>(entries: E[], entryId: string): { undo: string } | { reason: string } {
  const target = undoTarget(entries)
  return target && 'entry' in target && target.entry.id === entryId
    ? { undo: entryId }
    : { reason: STALE_UNDO }
}

/** What a one-click action did, in the words the toast uses. */
export const toastText = {
  logged: (dir: 'out' | 'in' | 'note', name: string): string =>
    dir === 'in'
      ? `Logged reply from ${name}`
      : dir === 'out'
        ? `Logged send to ${name}`
        : `Logged a note on ${name}`,
  snoozed: (name: string, until: string, today: string): string =>
    `Snoozed ${name} until ${formatDate(until, today)}`,
  met: (name: string): string => `Marked ${name} as met`,
  moved: (name: string, stage: string): string => `Moved ${name} to ${stage}`,
  passed: (name: string): string => `Passed on ${name}`
}
