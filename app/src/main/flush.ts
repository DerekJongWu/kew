// Before a window closes or the app quits, the renderer gets a chance to save edits it hasn't
// written yet (the editor's 800 ms autosave, a field being typed in). Main waits for its ack, or
// gives up after a timeout so a stuck renderer can't block quitting.

export const FLUSH_TIMEOUT_MS = 2000

/** Sends the flush request; resolves on the ack, after `timeoutMs`, or at once if sending fails. */
export function requestFlush(d: {
  send(): void
  onAck(cb: () => void): () => void
  timeoutMs?: number
}): Promise<void> {
  return new Promise((resolve) => {
    let off: () => void = () => undefined
    const done = (): void => {
      clearTimeout(timer)
      off()
      resolve()
    }
    const timer = setTimeout(done, d.timeoutMs ?? FLUSH_TIMEOUT_MS)
    off = d.onAck(done)
    try {
      d.send()
    } catch {
      done()
    }
  })
}

/**
 * Wraps a close/quit event: the first one is held (preventDefault) while `flush` runs, then
 * `proceed` repeats the close, which passes. Closes during the flush are held without a second flush.
 */
export function createCloseGuard(
  flush: () => Promise<void>
): (e: { preventDefault(): void }, proceed: () => void) => void {
  let state: 'idle' | 'flushing' | 'done' = 'idle'
  return (e, proceed) => {
    if (state === 'done') return
    e.preventDefault()
    if (state === 'flushing') return
    state = 'flushing'
    flush()
      .catch(() => undefined)
      .then(() => {
        state = 'done'
        proceed()
      })
  }
}
