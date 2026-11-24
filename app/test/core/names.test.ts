import { describe, it, expect } from 'vitest'
import { newId } from '../../src/core/ids'
import { normName, bareDomain, linkedinSlug, safeFilename, meetingName, uniqueName } from '../../src/core/names'

describe('names', () => {
  it('normName strips suffixes and punctuation', () => {
    expect(normName('Acme Labs, Inc.')).toBe(normName('acme'))
  })
  it('bareDomain', () => {
    expect(bareDomain('https://www.acme.io/about')).toBe('acme.io')
  })
  it('linkedinSlug', () => {
    expect(linkedinSlug('https://linkedin.com/in/jane-doe/?x=1')).toBe('jane-doe')
  })
  it('safeFilename', () => {
    expect(safeFilename('Acme / Labs: AI')).toBe('Acme - Labs- AI')
  })
  it('meetingName', () => {
    expect(meetingName('2026-11-18', 'Quill Security intro')).toBe('2026-11-18 Quill Security intro')
    expect(meetingName('2026-11-18', 'Quill', 'intro')).toBe('2026-11-18 Quill intro')
  })
  it('uniqueName disambiguates', () => {
    expect(uniqueName('Orbit', 'person', n => n === 'Orbit', { company: 'Orbit Data' })).toBe('Orbit (Orbit Data)')
    expect(uniqueName('Orbit', 'theme', n => n === 'Orbit')).toBe('Orbit (theme)')
  })
  it('uniqueName numbers when still taken', () => {
    const taken = new Set(['Orbit', 'Orbit (theme)', 'Orbit (theme) 2'])
    expect(uniqueName('Orbit', 'theme', n => taken.has(n))).toBe('Orbit (theme) 3')
    expect(uniqueName('Free', 'theme', () => false)).toBe('Free')
  })
  it('newId is a ULID', () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})
