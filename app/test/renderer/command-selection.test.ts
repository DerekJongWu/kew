import { describe, it, expect } from 'vitest'
import {
  createPickIntent,
  defaultSelection,
  isNavigationKey,
  selectionKey
} from '../../src/renderer/src/lib/command-selection'

const hit = (id: string): { record: { id: string } } => ({ record: { id } })
const cmds = [{ id: 'new-company' }, { id: 'go-today' }]

describe('defaultSelection', () => {
  it('picks the first record hit when there are hits', () => {
    expect(
      defaultSelection({
        creating: false,
        dupes: null,
        hits: [hit('A'), hit('B')],
        commands: cmds,
        q: 'or'
      })
    ).toBe('rec-A')
  })
  it('falls back to the first shown command', () => {
    expect(
      defaultSelection({ creating: false, dupes: null, hits: [], commands: cmds, q: 'go' })
    ).toBe('new-company')
    expect(defaultSelection({ creating: false, dupes: null, hits: [], commands: [], q: '' })).toBe(
      ''
    )
  })
  it('falls back to Search notes when nothing else matches the query', () => {
    expect(
      defaultSelection({ creating: false, dupes: null, hits: [], commands: [], q: 'zz' })
    ).toBe('search-notes')
    // a record hit or a matching command still wins over the search item
    expect(
      defaultSelection({ creating: false, dupes: null, hits: [hit('A')], commands: [], q: 'zz' })
    ).toBe('rec-A')
    expect(
      defaultSelection({ creating: false, dupes: null, hits: [], commands: cmds, q: 'go' })
    ).toBe('new-company')
  })
  it('in the name prompt, picks the first duplicate, else Create', () => {
    expect(
      defaultSelection({ creating: true, dupes: [hit('D')], hits: [], commands: cmds, q: 'Acme' })
    ).toBe('dup-D')
    expect(
      defaultSelection({ creating: true, dupes: null, hits: [], commands: cmds, q: 'Acme' })
    ).toBe('create')
    expect(
      defaultSelection({ creating: true, dupes: null, hits: [], commands: cmds, q: ' ' })
    ).toBe('')
  })
})

describe('selectionKey', () => {
  it('changes when the query or the arriving hits change, so a stale pick is dropped', () => {
    const base = { creating: false, dupes: null, hits: [], commands: cmds, q: 'or' }
    const a = selectionKey(base)
    expect(selectionKey({ ...base })).toBe(a)
    expect(selectionKey({ ...base, hits: [hit('A')] })).not.toBe(a)
    expect(selectionKey({ ...base, q: 'orc' })).not.toBe(a)
    expect(selectionKey({ ...base, creating: true })).not.toBe(a)
  })
})

describe('pick intent', () => {
  it("ignores cmdk's own highlight moves after typing, so Return keeps the top record", () => {
    const intent = createPickIntent()
    // "pi" then "n": each keystroke clears intent; cmdk's auto-select of the pinned search row is ignored
    intent.typed()
    expect(intent.accepts()).toBe(false)
    // same hits for "pin" as for "pi": the default stays on the record, not "search-notes"
    const s = { creating: false, dupes: null, hits: [hit('P')], commands: [], q: 'pin' }
    expect(defaultSelection(s)).toBe('rec-P')
  })
  it('accepts a pick after an arrow key or the pointer, until the next keystroke', () => {
    const intent = createPickIntent()
    intent.navigated()
    expect(intent.accepts()).toBe(true)
    intent.typed()
    expect(intent.accepts()).toBe(false)
  })
  it('knows the keys that move the highlight', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End'])
      expect(isNavigationKey({ key, ctrlKey: false })).toBe(true)
    expect(isNavigationKey({ key: 'n', ctrlKey: true })).toBe(true)
    expect(isNavigationKey({ key: 'n', ctrlKey: false })).toBe(false)
    expect(isNavigationKey({ key: 'Enter', ctrlKey: false })).toBe(false)
  })
})
