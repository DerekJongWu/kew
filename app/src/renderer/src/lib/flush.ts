// Savers for edits not written yet (editor autosave, field drafts). Main asks for a flush before a
// window closes or the app quits (kew.onFlush); App runs flushAll then.

export type Saver = () => void | Promise<void>

export function createFlushRegistry(): {
  register(fn: Saver): () => void
  flushAll(): Promise<void>
} {
  const savers = new Set<Saver>()
  return {
    register(fn) {
      savers.add(fn)
      return () => savers.delete(fn)
    },
    async flushAll() {
      await Promise.allSettled([...savers].map(async (fn) => fn()))
    }
  }
}

export const flushes = createFlushRegistry()
