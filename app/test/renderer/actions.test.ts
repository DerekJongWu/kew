import { describe, it, expect } from 'vitest'
import { plainError, createStatus, undoTarget } from '../../src/renderer/src/lib/actions'

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

describe('undoTarget', () => {
  type E = { id: string; kind: string; undoable: boolean; message: string }
  const e = (id: string, kind: string, undoable: boolean, message = id): E => ({
    id,
    kind,
    undoable,
    message
  })
  const target = (entries: E[]): string | null => {
    const t = undoTarget(entries)
    return t === null ? null : 'entry' in t ? t.entry.id : t.reason
  }

  it('skips external edits and actions already undone, walking back one action per ⌘Z', () => {
    expect(
      target([
        e('u', 'undo', true, 'Undid: A'),
        e('x', 'external', false),
        e('a', 'action', false, 'A'),
        e('b', 'action', true, 'B')
      ])
    ).toBe('b')
    expect(target([e('u', 'undo', true, 'Undid: A'), e('a', 'action', false, 'A')])).toBeNull()
  })

  it('treats an action whose undo was itself undone as live again', () => {
    expect(
      target([
        e('r', 'undo', true, 'Undid: Undid: A'),
        e('u', 'undo', false, 'Undid: A'),
        e('a', 'action', true, 'A'),
        e('b', 'action', true, 'B')
      ])
    ).toBe('a')
  })

  it('stops at the newest action when it can no longer be undone, instead of undoing an older one', () => {
    expect(
      target([
        e('x', 'external', false),
        e('a', 'action', false, 'Set Stage on Acme'),
        e('b', 'action', true)
      ])
    ).toBe('Can’t undo “Set Stage on Acme”: its notes changed since.'.replace('’', "'"))
  })
})
