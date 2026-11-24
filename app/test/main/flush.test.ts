import { describe, it, expect, vi, afterEach } from 'vitest'
import { createCloseGuard, requestFlush } from '../../src/main/flush'

afterEach(() => vi.useRealTimers())

describe('requestFlush', () => {
  it('asks the renderer and resolves on its ack', async () => {
    let ack: () => void = () => undefined
    const send = vi.fn()
    const off = vi.fn()
    const p = requestFlush({
      send,
      onAck: (cb) => ((ack = cb), off),
      timeoutMs: 2000
    })
    expect(send).toHaveBeenCalledOnce()
    ack()
    await p
    expect(off).toHaveBeenCalled()
  })
  it('gives up after the timeout when no ack comes', async () => {
    vi.useFakeTimers()
    let done = false
    const p = requestFlush({
      send: () => undefined,
      onAck: () => () => undefined,
      timeoutMs: 2000
    }).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(1999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(done).toBe(true)
  })
  it('resolves at once when the renderer is gone (send throws)', async () => {
    await requestFlush({
      send: () => {
        throw new Error('destroyed')
      },
      onAck: () => () => undefined,
      timeoutMs: 2000
    })
  })
})

describe('createCloseGuard', () => {
  it('holds the first close, flushes, then proceeds once; the repeat close passes', async () => {
    let finish: () => void = () => undefined
    const flush = vi.fn(() => new Promise<void>((r) => (finish = r)))
    const guard = createCloseGuard(flush)
    const proceed = vi.fn()
    const e1 = { preventDefault: vi.fn() }
    guard(e1, proceed)
    expect(e1.preventDefault).toHaveBeenCalled()
    expect(flush).toHaveBeenCalledOnce()
    // A second close while flushing is held too, without a second flush.
    const e2 = { preventDefault: vi.fn() }
    guard(e2, proceed)
    expect(e2.preventDefault).toHaveBeenCalled()
    expect(flush).toHaveBeenCalledOnce()
    finish()
    await vi.waitFor(() => expect(proceed).toHaveBeenCalledOnce())
    // proceed() closes again: this time it goes through.
    const e3 = { preventDefault: vi.fn() }
    guard(e3, proceed)
    expect(e3.preventDefault).not.toHaveBeenCalled()
    expect(proceed).toHaveBeenCalledOnce()
  })
  it('proceeds even if the flush fails', async () => {
    const guard = createCloseGuard(() => Promise.reject(new Error('x')))
    const proceed = vi.fn()
    guard({ preventDefault: () => undefined }, proceed)
    await vi.waitFor(() => expect(proceed).toHaveBeenCalledOnce())
  })
})
