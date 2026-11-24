import { describe, it, expect, vi } from 'vitest'
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
import { BodySync, normalizeBody, reconcile } from '../../src/renderer/src/lib/body-sync'
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

describe('BodySync', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, shape is inferred
  const setup = (initial = 'a') => {
    let doc = initial
    const writes: string[] = []
    let release: (() => void) | null = null
    const replaced: [string, boolean][] = []
    const conflicts: (string | null)[] = []
    const sync = new BodySync(initial, {
      doc: () => doc,
      replace: (t, undoable) => {
        doc = t
        replaced.push([t, undoable])
      },
      write: (t) =>
        new Promise<void>((r) => {
          writes.push(t)
          release = r
        }),
      onConflict: (c) => conflicts.push(c),
      onError: () => undefined,
      delay: 800
    })
    return {
      sync,
      writes,
      replaced,
      conflicts,
      type: (t: string) => {
        doc = t
        sync.edited()
      },
      land: async () => {
        release?.()
        release = null
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  }

  it('saves 800 ms after typing stops', async () => {
    vi.useFakeTimers()
    const s = setup()
    s.type('ab')
    vi.advanceTimersByTime(799)
    expect(s.writes).toEqual([])
    vi.advanceTimersByTime(1)
    expect(s.writes).toEqual(['ab'])
    vi.useRealTimers()
  })

  it('reloads an outside change as a non-undoable replace; Reload from the bar is undoable', () => {
    const s = setup()
    s.sync.incoming('z')
    expect(s.replaced).toEqual([['z', false]])
    s.type('z local')
    s.sync.incoming('y')
    expect(s.conflicts).toEqual(['y'])
    s.sync.takeDisk()
    expect(s.replaced.at(-1)).toEqual(['y', true])
  })

  it('pauses autosave during a conflict, but flush keeps the local text instead of dropping it', async () => {
    const s = setup()
    s.type('a local')
    s.sync.incoming('outside')
    expect(s.conflicts).toEqual(['outside'])
    await s.sync.save()
    expect(s.writes).toEqual([])
    const p = s.sync.flush()
    expect(s.writes).toEqual(['a local'])
    expect(s.conflicts.at(-1)).toBeNull()
    await s.land()
    await p
  })

  it('flush during an in-flight save waits for it, then saves the newer text', async () => {
    const s = setup()
    s.type('ab')
    void s.sync.save()
    s.type('abc')
    const p = s.sync.flush()
    expect(s.writes).toEqual(['ab'])
    await s.land()
    expect(s.writes).toEqual(['ab', 'abc'])
    await s.land()
    await p
  })
})
