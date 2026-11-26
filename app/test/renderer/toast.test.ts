import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  STALE_UNDO,
  createToasts,
  entryIdOf,
  toastText,
  toastUndo
} from '../../src/renderer/src/lib/toast'

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

describe('toastUndo', () => {
  type E = { id: string; kind: string; undoable: boolean; message: string }
  const e = (id: string, message: string, kind = 'action', undoable = true): E => ({
    id,
    kind,
    undoable,
    message
  })
  it('undoes the toasted action while it is still the newest change', () => {
    expect(toastUndo([e('A', 'Moved Acme to Active'), e('Z', 'Older')], 'A')).toEqual({ undo: 'A' })
  })
  it('refuses when something newer landed, instead of undoing that', () => {
    const entries = [e('B', 'Saved views'), e('A', 'Moved Acme to Active')]
    expect(toastUndo(entries, 'A')).toEqual({ reason: STALE_UNDO })
    expect(toastUndo([e('C', 'Edited Acme'), ...entries], 'A')).toEqual({ reason: STALE_UNDO })
  })
  it('refuses when the action was already undone', () => {
    const entries = [e('U', 'Undid: Moved Acme to Active', 'undo'), e('A', 'Moved Acme to Active')]
    expect(toastUndo(entries, 'A')).toEqual({ reason: STALE_UNDO })
  })
  it('ignores outside edits, as ⌘Z does', () => {
    expect(
      toastUndo([e('X', 'Changed outside Kew', 'external', false), e('A', 'Moved')], 'A')
    ).toEqual({ undo: 'A' })
  })
})

describe('toast entries', () => {
  it('keeps the entry id of the action it announces and drops Undo when settled', () => {
    vi.useFakeTimers()
    const t = createToasts()
    t.show('Moved Acme to Active', entryIdOf({ entry: { id: 'A' }, changedIds: [] }))
    const shown = t.get()!
    expect(shown.entryId).toBe('A')
    t.settle(shown.id + 1, 'ignored') // another toast's id: no effect
    expect(t.get()?.message).toBe('Moved Acme to Active')
    t.settle(shown.id, STALE_UNDO)
    expect(t.get()).toEqual({ id: shown.id, message: STALE_UNDO })
    vi.advanceTimersByTime(5000)
    expect(t.get()).toBeNull()
    expect(entryIdOf(undefined)).toBeUndefined()
    expect(entryIdOf({ duplicates: [] })).toBeUndefined()
  })
})
