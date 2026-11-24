import { describe, it, expect } from 'vitest'
import {
  httpsHref,
  keyFromLabel,
  listValue,
  otherKeys,
  propertyFields,
  propertyKeyProblem,
  splitProblems,
  displayValue,
  guessType,
  labelFromKey,
  optionValue
} from '../../src/renderer/src/lib/properties'
import { normalizeBody, reconcile } from '../../src/renderer/src/lib/body-sync'
import { linkAt, linkQuery, matchesName } from '../../src/renderer/src/lib/wikilinks'
import type { FieldDef } from '../../src/shared/api'

const f = (key: string, type: FieldDef['type'] = 'text'): FieldDef => ({
  key,
  label: key,
  type,
  tier: 'starter'
})

describe('propertyFields', () => {
  it('keeps schema order and drops id, type, name and _ keys', () => {
    const fields = [
      f('id'),
      f('type'),
      f('name'),
      f('website', 'url'),
      f('_x'),
      f('stage', 'select')
    ]
    expect(propertyFields(fields).map((x) => x.key)).toEqual(['website', 'stage'])
  })
})

describe('otherKeys', () => {
  it('lists frontmatter keys the schema does not know, in note order', () => {
    const fields = [f('website')]
    const values = {
      id: 'x',
      type: 'company',
      name: 'A',
      website: 'a',
      zeta: 1,
      _summary: 's',
      alpha: 'b'
    }
    expect(otherKeys(values, fields)).toEqual(['zeta', 'alpha'])
  })
})

describe('splitProblems', () => {
  it('attaches "key: message" problems to known keys and leaves the rest unmatched', () => {
    const out = splitProblems(
      ["stage: 'x' is not an option", 'Type/folder mismatch: oops', 'raise: bad'],
      ['stage', 'raise']
    )
    expect(out.byKey).toEqual({ stage: ["'x' is not an option"], raise: ['bad'] })
    expect(out.unmatched).toEqual(['Type/folder mismatch: oops'])
  })
})

describe('keyFromLabel / propertyKeyProblem', () => {
  it('slugs a label', () => {
    expect(keyFromLabel('Board seat?')).toBe('board_seat')
    expect(keyFromLabel('  ARR (USD) 2025 ')).toBe('arr_usd_2025')
    expect(keyFromLabel('2nd look')).toBe('2nd_look')
  })
  it('rejects bad, empty and taken keys', () => {
    expect(propertyKeyProblem('', [])).toMatch(/label/)
    expect(propertyKeyProblem('2nd_look', [])).toMatch(/start with a letter/)
    expect(propertyKeyProblem('stage', ['stage'])).toMatch(/already/)
    expect(propertyKeyProblem('board_seat', ['stage'])).toBeNull()
  })
})

describe('listValue / displayValue / httpsHref', () => {
  it('normalizes single and list values', () => {
    expect(listValue(null)).toEqual([])
    expect(listValue('')).toEqual([])
    expect(listValue('[[A]]')).toEqual(['[[A]]'])
    expect(listValue(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('shows raw values readably', () => {
    expect(displayValue(['a', 'b'])).toBe('a, b')
    expect(displayValue(true)).toBe('true')
    expect(displayValue(null)).toBe('')
  })
  it('only builds https links', () => {
    expect(httpsHref('quill.example')).toBe('https://quill.example')
    expect(httpsHref('https://x.example/a')).toBe('https://x.example/a')
    expect(httpsHref('http://x.example')).toBeNull()
    expect(httpsHref('javascript:alert(1)')).toBeNull()
    expect(httpsHref('')).toBeNull()
  })
})

describe('reconcile', () => {
  const base = { baseline: 'a', pending: null as string | null, doc: 'a' }
  it('ignores the body it already has', () => {
    expect(reconcile({ ...base, incoming: 'a' })).toBe('same')
  })
  it('treats our own save landing as the same', () => {
    expect(reconcile({ baseline: 'a', pending: 'ab', doc: 'ab', incoming: 'ab' })).toBe('saved')
  })
  it('reloads an outside change when there are no local edits', () => {
    expect(reconcile({ ...base, incoming: 'z' })).toBe('reload')
  })
  it('flags a conflict when there are local edits', () => {
    expect(reconcile({ ...base, doc: 'ab', incoming: 'z' })).toBe('conflict')
    expect(reconcile({ baseline: 'a', pending: 'ab', doc: 'ab', incoming: 'z' })).toBe('conflict')
  })
  it('normalizes CRLF', () => {
    expect(normalizeBody('a\r\nb')).toBe('a\nb')
  })
})

describe('wikilinks', () => {
  it('finds the link under a position', () => {
    const t = 'See [[Quill Security]] and [[Ana|her]].'
    expect(linkAt(t, 8)).toEqual({ name: 'Quill Security', from: 4, to: 22 })
    expect(linkAt(t, 30)?.name).toBe('Ana')
    expect(linkAt(t, 1)).toBeNull()
  })
  it('reads an open [[ query before the cursor', () => {
    expect(linkQuery('Met [[Qu')).toEqual({ from: 4, text: 'Qu' })
    expect(linkQuery('Met [[')).toEqual({ from: 4, text: '' })
    expect(linkQuery('Met [[Quill]] x')).toBeNull()
    expect(linkQuery('no link')).toBeNull()
  })
  it('matches a record by name or alias, ignoring case', () => {
    expect(matchesName({ name: 'Quill', fields: {} }, 'quill')).toBe(true)
    expect(matchesName({ name: 'Quill', fields: { aliases: ['QS'] } }, 'qs')).toBe(true)
    expect(matchesName({ name: 'Quill', fields: {} }, 'Quil')).toBe(false)
  })
})

describe('add-property helpers', () => {
  it('makes option values from labels', () => {
    expect(optionValue(' Board Seat ')).toBe('board-seat')
    expect(optionValue('Series A+')).toBe('series-a')
  })
  it('labels a key', () => {
    expect(labelFromKey('board_seat')).toBe('Board seat')
  })
  it('guesses a type from a raw value', () => {
    expect(guessType(true)).toBe('checkbox')
    expect(guessType(3)).toBe('number')
    expect(guessType('2026-11-24')).toBe('date')
    expect(guessType('[[Ana]]')).toBe('relation')
    expect(guessType(['[[Ana]]'])).toBe('relation')
    expect(guessType(['a', 'b'])).toBe('multi-select')
    expect(guessType('https://x.example')).toBe('url')
    expect(guessType('hello')).toBe('text')
  })
})
