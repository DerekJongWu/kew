import { describe, it, expect } from 'vitest'
import { logEntryText } from '../../src/renderer/src/lib/outreach-log'
import { TYPE_PLURAL } from '../../src/renderer/src/lib/destinations'

describe('logEntryText', () => {
  it('keeps a typed summary, trimmed', () => {
    expect(logEntryText('out', '  Intro note  ')).toBe('Intro note')
  })
  it('falls back to what happened when the summary is empty', () => {
    expect(logEntryText('out', '')).toBe('Sent')
    expect(logEntryText('out', '   ')).toBe('Sent')
    expect(logEntryText('in', '')).toBe('Replied')
  })
})

describe('TYPE_PLURAL', () => {
  it('has proper plurals for search labels', () => {
    expect(TYPE_PLURAL.company).toBe('companies')
    expect(TYPE_PLURAL.person).toBe('people')
  })
})
