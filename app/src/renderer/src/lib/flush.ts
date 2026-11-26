// Savers for edits not written yet (editor autosave, field drafts). Main asks for a flush before a
// window closes or the app quits (kew.onFlush); App runs flushAll then.

export interface FlushOptions {
  /**
   * Leaving for good (window close, quit): an open note conflict resolves as "Keep mine" so no
   * typed text is lost. false (an in-app save, like the toast's Undo): conflicts stay open for the
   * user to decide, and only edits without one are saved.
   */
  resolveConflicts: boolean
}

export type Saver = (opts: FlushOptions) => void | Promise<void>

export function createFlushRegistry(): {
  register(fn: Saver): () => void
  flushAll(opts?: FlushOptions): Promise<void>
} {
  const savers = new Set<Saver>()
  return {
    register(fn) {
      savers.add(fn)
      return () => savers.delete(fn)
    },
    async flushAll(opts = { resolveConflicts: true }) {
      await Promise.allSettled([...savers].map(async (fn) => fn(opts)))
    }
  }
}

export const flushes = createFlushRegistry()
