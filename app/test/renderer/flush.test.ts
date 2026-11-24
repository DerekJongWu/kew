import { describe, it, expect, vi } from 'vitest'
import { createFlushRegistry } from '../../src/renderer/src/lib/flush'

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
