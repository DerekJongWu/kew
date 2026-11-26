import { describe, it, expect, vi, afterEach } from 'vitest'
import { createToasts, toastText } from '../../src/renderer/src/lib/toast'

afterEach(() => vi.useRealTimers())

describe('toasts', () => {
  it('shows one toast at a time and hides it after five seconds', () => {
    vi.useFakeTimers()
    const t = createToasts()
    const seen: (string | null)[] = []
    t.subscribe(() => seen.push(t.get()?.message ?? null))
    t.show('Logged send to Ana Ruiz')
    vi.advanceTimersByTime(3000)
    t.show('Moved Acme to Active') // replaces the first and restarts the clock
    expect(t.get()?.message).toBe('Moved Acme to Active')
    vi.advanceTimersByTime(4999)
    expect(t.get()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(t.get()).toBeNull()
    expect(seen).toEqual(['Logged send to Ana Ruiz', 'Moved Acme to Active', null])
  })
  it('holds while paused and counts down afresh when resumed', () => {
    vi.useFakeTimers()
    const t = createToasts()
    t.show('Passed on Acme')
    t.pause()
    vi.advanceTimersByTime(60_000)
    expect(t.get()?.message).toBe('Passed on Acme')
    t.resume()
    vi.advanceTimersByTime(4999)
    expect(t.get()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(t.get()).toBeNull()
    t.resume() // nothing showing: no-op
    expect(t.get()).toBeNull()
  })
  it('dismisses at once', () => {
    vi.useFakeTimers()
    const t = createToasts()
    t.show('x')
    t.dismiss()
    expect(t.get()).toBeNull()
  })
})

describe('toastText', () => {
  it('says what the action did, with the full name', () => {
    expect(toastText.logged('out', 'Ana Ruiz')).toBe('Logged send to Ana Ruiz')
    expect(toastText.logged('in', 'Ana Ruiz')).toBe('Logged reply from Ana Ruiz')
    expect(toastText.met('Ana Ruiz')).toBe('Marked Ana Ruiz as met')
    expect(toastText.moved('Acme', 'Reached out')).toBe('Moved Acme to Reached out')
    expect(toastText.passed('Acme')).toBe('Passed on Acme')
    expect(toastText.snoozed('Ana Ruiz', '2026-12-01', '2026-11-24')).toBe(
      'Snoozed Ana Ruiz until 1 Dec'
    )
  })
})
