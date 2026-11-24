import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NoteParseError,
  appendToSection,
  newNote,
  parseNote,
  readList,
  scalar,
  setBody,
  setKeys
} from '../../src/core/note'

const dir = join(__dirname, '../fixtures/vaults/messy')
const load = (n: string): string => readFileSync(join(dir, n), 'utf8')

// Lines that disappeared and lines that appeared (multiset difference).
function diffLines(before: string, after: string): { removed: string[]; added: string[] } {
  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)
  const minus = (x: string[], y: string[]): string[] => {
    const rest = [...y]
    return x.filter((l) => {
      const i = rest.indexOf(l)
      if (i >= 0) {
        rest.splice(i, 1)
        return false
      }
      return true
    })
  }
  return { removed: minus(a, b), added: minus(b, a) }
}

describe('parseNote', () => {
  it('reads frontmatter, comments and block lists', () => {
    const p = parseNote(load('block-lists.md'))
    expect(p.ok).toBe(true)
    expect(p.fm.status).toBe('tracking')
    expect(p.fm.themes).toEqual(['[[AI]]', '[[Infra]]'])
    expect(p.body).toContain('# Acme')
    expect(p.eol).toBe('\n')
  })
  it('detects CRLF', () => {
    const p = parseNote(load('crlf.md'))
    expect(p.ok).toBe(true)
    expect(p.eol).toBe('\r\n')
    expect(p.fm.tags).toEqual(['person'])
  })
  it('reports no frontmatter without throwing', () => {
    const p = parseNote(load('no-frontmatter.md'))
    expect(p.ok).toBe(false)
    expect(p.fm).toEqual({})
  })
  it('returns ok:false with an error for broken YAML', () => {
    const p = parseNote(load('broken-yaml.md'))
    expect(p.ok).toBe(false)
    expect(p.error).toBeTruthy()
  })
  it('does not end frontmatter at a --- in the body', () => {
    const p = parseNote(load('body-dashes.md'))
    expect(p.ok).toBe(true)
    expect(Object.keys(p.fm)).toEqual(['type', 'status'])
    expect(p.body).toContain('status: not-frontmatter')
  })
  it('maps null to empty string', () => {
    expect(parseNote('---\nowner:\n---\n').fm.owner).toBe('')
  })
})

describe('setKeys', () => {
  it('changes only the target line, keeping comments and block lists', () => {
    const t = load('block-lists.md')
    const out = setKeys(t, { owner: 'Pat' })
    expect(diffLines(t, out)).toEqual({ removed: ['owner: Sam'], added: ['owner: Pat'] })
  })
  it('adds a missing key before tags:', () => {
    const t = load('block-lists.md')
    const out = setKeys(t, { stage: 'seed' })
    expect(diffLines(t, out)).toEqual({ removed: [], added: ['stage: seed'] })
    expect(out.split('\n').indexOf('stage: seed')).toBe(out.split('\n').indexOf('tags:') - 1)
  })
  it('removes a key and its block with undefined', () => {
    const t = load('block-lists.md')
    const out = setKeys(t, { themes: undefined })
    expect(diffLines(t, out).added).toEqual([])
    expect(diffLines(t, out).removed).toEqual(['themes:', '  - "[[AI]]"', '  - "[[Infra]]"'])
  })
  it('preserves CRLF', () => {
    const out = setKeys(load('crlf.md'), { status: 'passed', stage: 'seed' })
    expect(out).not.toMatch(/(?<!\r)\n/)
    expect(diffLines(load('crlf.md'), out)).toEqual({
      removed: ['status: active'],
      added: ['status: passed', 'stage: seed']
    })
  })
  it('writes lists in flow style and removes the replaced block list', () => {
    const t = load('block-lists.md')
    const out = setKeys(t, { themes: ['[[A]]', '[[B]]'] })
    expect(out).toContain("themes: ['[[A]]', '[[B]]']")
    expect(out).not.toContain('"[[AI]]"')
    expect(diffLines(t, out).removed).toEqual(['themes:', '  - "[[AI]]"', '  - "[[Infra]]"'])
    expect(parseNote(out).fm.themes).toEqual(['[[A]]', '[[B]]'])
  })
  it('quotes comma items in flow lists so they round-trip', () => {
    const out = setKeys(load('block-lists.md'), { themes: ['a, b', 'c'] })
    expect(parseNote(out).fm.themes).toEqual(['a, b', 'c'])
  })
  it('throws NoteParseError on broken YAML and on missing frontmatter', () => {
    expect(() => setKeys(load('broken-yaml.md'), { status: 'x' })).toThrow(NoteParseError)
    expect(() => setKeys(load('no-frontmatter.md'), { status: 'x' })).toThrow(NoteParseError)
  })
  it('edits only real frontmatter when the body has ---', () => {
    const t = load('body-dashes.md')
    const out = setKeys(t, { status: 'passed' })
    expect(diffLines(t, out)).toEqual({ removed: ['status: tracking'], added: ['status: passed'] })
  })
})

describe('setBody', () => {
  it('replaces everything after the frontmatter', () => {
    const t = load('block-lists.md')
    const out = setBody(t, '\n# New\n')
    expect(out.startsWith(t.split('\n---\n')[0])).toBe(true)
    expect(parseNote(out).body).toBe('\n# New\n')
  })
  it('keeps CRLF', () => {
    expect(setBody(load('crlf.md'), '\r\nhi\r\n')).not.toMatch(/(?<!\r)\n/)
  })
})

describe('scalar', () => {
  it('applies the quoting rule', () => {
    expect(scalar('AI: agents')).toBe("'AI: agents'")
    expect(scalar("O'Brien")).toBe("O'Brien")
    expect(scalar('- dash')).toBe("'- dash'")
    expect(scalar('true')).toBe("'true'")
    expect(scalar('a # b')).toBe("'a # b'")
    expect(scalar('[[Link]]')).toBe("'[[Link]]'")
    expect(scalar(5)).toBe('5')
    expect(scalar('')).toBe('')
    expect(scalar(null)).toBe('')
    expect(scalar('two\nlines')).toBe('two lines')
  })
})

describe('sections', () => {
  it('readList reads dash items of a section', () => {
    expect(readList(load('sections.md'), '## Outreach log')).toEqual([
      '2026-11-01, out · email: hello'
    ])
    expect(readList(load('sections.md'), '## Missing')).toEqual([])
  })
  it('appends to the end of an existing section', () => {
    const t = load('sections.md')
    const out = appendToSection(t, '## Outreach log', '2026-11-24, out · email: hi')
    expect(readList(out, '## Outreach log')).toEqual([
      '2026-11-01, out · email: hello',
      '2026-11-24, out · email: hi'
    ])
    expect(diffLines(t, out)).toEqual({ removed: [], added: ['- 2026-11-24, out · email: hi'] })
  })
  it('creates a missing section before a given heading', () => {
    const t = load('block-lists.md')
    const out = appendToSection(t, '## Outreach log', '- 2026-11-24, out · email: hi', {
      before: '## Notes'
    })
    const lines = out.split('\n')
    expect(lines.indexOf('## Outreach log')).toBeLessThan(lines.indexOf('## Notes'))
    expect(readList(out, '## Outreach log')).toEqual(['2026-11-24, out · email: hi'])
    expect(readList(out, '## Notes')).toEqual(['first'])
  })
  it('creates a missing section at the end without a before heading', () => {
    const out = appendToSection(load('block-lists.md'), '## Log', 'a')
    expect(out.trimEnd().endsWith('## Log\n\n- a')).toBe(true)
  })
  it('keeps CRLF', () => {
    const out = appendToSection(load('crlf.md'), '## Notes', 'more')
    expect(out).not.toMatch(/(?<!\r)\n/)
    expect(readList(out, '## Notes')).toEqual(['hi', 'more'])
  })
})

describe('newNote', () => {
  it('builds frontmatter plus body and round-trips', () => {
    const t = newNote({ type: 'person', name: 'AI: x', tags: ['a', 'b'] }, '# Hi\n')
    expect(t).toBe("---\ntype: person\nname: 'AI: x'\ntags: [a, b]\n---\n# Hi\n")
    expect(parseNote(t).fm).toEqual({ type: 'person', name: 'AI: x', tags: ['a', 'b'] })
  })
})
