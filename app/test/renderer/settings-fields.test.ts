import { describe, expect, it } from 'vitest'
import {
  deleteSentence,
  moveOption,
  notUndoableReason,
  optionValueProblem,
  renameKeyProblem,
  toEditOptions,
  toOptionDefs,
  usedBy
} from '../../src/renderer/src/lib/settings-fields'
import type { RecordSummary } from '../../src/shared/api'

const rec = (fields: RecordSummary['fields']): RecordSummary => ({
  id: 'x',
  type: 'company',
  name: 'X',
  path: 'X.md',
  fields,
  problems: []
})

describe('option editing', () => {
  const opts = toEditOptions([
    { value: 'new', label: 'New', category: 'new' },
    { value: 'no-reply', label: 'No reply', category: 'in-progress' }
  ])
  it('sends renamedFrom only for changed values', () => {
    const edited = opts.map((o) => (o.value === 'no-reply' ? { ...o, value: 'ghosted' } : o))
    expect(toOptionDefs(edited)).toEqual([
      { value: 'new', label: 'New', category: 'new' },
      { value: 'ghosted', label: 'No reply', category: 'in-progress', renamedFrom: 'no-reply' }
    ])
  })
  it('does not mark label-only edits or new options', () => {
    const edited = [
      ...opts.map((o) => ({ ...o, label: o.label + '!' })),
      { value: 'fresh', label: 'Fresh', origin: null }
    ]
    expect(toOptionDefs(edited).map((o) => o.renamedFrom)).toEqual([
      undefined,
      undefined,
      undefined
    ])
  })
  it('moves up and down, staying put at the ends', () => {
    expect(moveOption([1, 2, 3], 1, -1)).toEqual([2, 1, 3])
    expect(moveOption([1, 2, 3], 1, 1)).toEqual([1, 3, 2])
    const l = [1, 2]
    expect(moveOption(l, 0, -1)).toBe(l)
    expect(moveOption(l, 1, 1)).toBe(l)
  })
  it('checks option values', () => {
    expect(optionValueProblem('', opts, 0)).toMatch(/value/)
    expect(optionValueProblem('Bad Value', opts, 0)).toMatch(/lowercase/)
    expect(optionValueProblem('no-reply', opts, 0)).toMatch(/already/)
    expect(optionValueProblem('no-reply', opts, 1)).toBeNull()
  })
})

describe('field keys and usage', () => {
  it('validates a rename', () => {
    expect(renameKeyProblem('co_investors', 'coinv', ['name'])).toBeNull()
    expect(renameKeyProblem('Bad', 'a', [])).toMatch(/lowercase/)
    expect(renameKeyProblem('name', 'a', ['name'])).toMatch(/already a field/)
    expect(renameKeyProblem('a', 'a', ['a'])).toMatch(/already the key/)
  })
  it('counts notes with a non-empty value', () => {
    expect(
      usedBy([rec({ a: 'x' }), rec({ a: '' }), rec({ a: [] }), rec({ a: ['q'] }), rec({})], 'a')
    ).toBe(2)
  })
  it('words the delete confirmation', () => {
    expect(deleteSentence('Stage', 14)).toBe(
      'Removes Stage from 14 notes. You can undo this from History.'
    )
    expect(deleteSentence('Stage', 1)).toMatch(/1 note\./)
    expect(deleteSentence('Stage', 0)).toMatch(/^No notes use it/)
  })
})

describe('history reasons', () => {
  it('explains entries that cannot be undone', () => {
    expect(notUndoableReason({ kind: 'action', undoable: true })).toBeNull()
    expect(notUndoableReason({ kind: 'action', undoable: false })).toBe('This note changed since')
    expect(notUndoableReason({ kind: 'undo', undoable: false })).toBe('This note changed since')
    expect(notUndoableReason({ kind: 'external', undoable: false })).toMatch(/outside Kew/)
  })
})
