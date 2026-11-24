import { describe, it, expect, vi } from 'vitest'
import { createFlushRegistry } from '../../src/renderer/src/lib/flush'
import { saveDraft } from '../../src/renderer/src/lib/properties'

describe('flush registry', () => {
  it('runs every registered saver and waits for all of them, even if one fails', async () => {
    const reg = createFlushRegistry()
    const order: string[] = []
    reg.register(async () => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('slow')
    })
    reg.register(() => {
      throw new Error('boom')
    })
    reg.register(() => void order.push('sync'))
    await reg.flushAll()
    expect(order.sort()).toEqual(['slow', 'sync'])
  })
  it('forgets a saver once unregistered', async () => {
    const reg = createFlushRegistry()
    const fn = vi.fn()
    const off = reg.register(fn)
    off()
    await reg.flushAll()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('saveDraft with flushAll', () => {
  it('flushAll resolves only after a slow field commit finishes', async () => {
    const reg = createFlushRegistry()
    const sent = { current: null as string | null }
    let finished = false
    const commit = (): Promise<boolean> =>
      new Promise((r) =>
        setTimeout(() => {
          finished = true
          r(true)
        }, 30)
      )
    reg.register(() => saveDraft(' $9M ', '', sent, commit))
    await reg.flushAll()
    expect(finished).toBe(true)
    expect(sent.current).toBe('$9M')
  })
  it('sends nothing when the draft matches, and clears `sent` when a commit fails so it can be retried', async () => {
    const sent = { current: null as string | null }
    let calls = 0
    const ok = async (): Promise<boolean> => (calls++, true)
    await saveDraft('a', 'a', sent, ok)
    expect(calls).toBe(0)
    await saveDraft('b', 'a', sent, async () => false)
    expect(sent.current).toBeNull()
    await saveDraft('b', 'a', sent, ok)
    await saveDraft('b', 'a', sent, ok) // already sent: not resent
    expect(calls).toBe(1)
  })
})
