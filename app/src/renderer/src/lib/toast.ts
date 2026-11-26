// The one app-level toast: a short line after a one-click action ("Logged send to Ana Ruiz"),
// with Undo. A new toast replaces the old one; each hides itself after TOAST_MS unless paused.
import { useSyncExternalStore } from 'react'
import { formatDate } from './dates'

export const TOAST_MS = 5000

export interface Toast {
  id: number
  message: string
}

export function createToasts(ms = TOAST_MS): {
  get(): Toast | null
  show(message: string): void
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
    show(message) {
      set({ id: next++, message })
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
