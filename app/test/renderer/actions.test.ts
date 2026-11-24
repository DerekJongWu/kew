import { describe, it, expect } from 'vitest'
import { plainError, createStatus, latestUndoable } from '../../src/renderer/src/lib/actions'

const named = (name: string, message: string): Error => Object.assign(new Error(message), { name })

describe('plainError', () => {
  it('explains an undo conflict by record name', () => {
    expect(
      plainError(
        named(
          'UndoConflictError',
          "Can't undo: People/Mara Quintero.md has changed since this action."
        )
      )
    ).toBe("Can't undo: Mara Quintero was edited after this change. Undo the later change first.")
  })
  it('passes NotUndoableError messages through', () => {
    expect(
      plainError(
        named('NotUndoableError', "Can't undo: this entry records edits made outside Kew.")
      )
    ).toBe("Can't undo: this entry records edits made outside Kew.")
  })
  it('explains a missing vault', () => {
    expect(plainError(named('NoVaultError', 'No vault is open'))).toBe(
      'No vault is open. Open one to continue.'
    )
  })
})

describe('createStatus', () => {
  it('tracks in-flight work and the last error', async () => {
    const s = createStatus()
    const p = s.run(() => Promise.resolve(1))
    expect(s.get().pending).toBe(1)
    await p
    expect(s.get()).toEqual({ pending: 0, error: null })
    await expect(s.run(() => Promise.reject(named('NoVaultError', 'x')))).rejects.toThrow()
    expect(s.get()).toEqual({ pending: 0, error: 'No vault is open. Open one to continue.' })
    await s.run(() => Promise.resolve(2))
    expect(s.get().error).toBeNull()
  })
})

describe('latestUndoable', () => {
  it('skips undo entries, external edits and stale actions', () => {
    const e = (
      id: string,
      kind: string,
      undoable: boolean
    ): { id: string; kind: string; undoable: boolean } => ({ id, kind, undoable })
    expect(
      latestUndoable([
        e('u', 'undo', true),
        e('x', 'external', false),
        e('a', 'action', false),
        e('b', 'action', true)
      ])?.id
    ).toBe('b')
    expect(latestUndoable([e('u', 'undo', true)])).toBeNull()
  })
})
