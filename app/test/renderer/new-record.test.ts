import { describe, it, expect } from 'vitest'
import {
  autoMeetingName,
  emptyForm,
  fieldsFor,
  isNameError,
  validate
} from '../../src/renderer/src/lib/new-record'
import { nameProblem } from '../../src/shared/names'

const form = (over: Partial<ReturnType<typeof emptyForm>> = {}): ReturnType<typeof emptyForm> => ({
  ...emptyForm('2026-11-24'),
  ...over
})

describe('autoMeetingName', () => {
  it('uses date, company and type', () => {
    expect(autoMeetingName(form({ company: ['[[Quill Security]]'] }), 'Intro')).toBe(
      '2026-11-24 Quill Security Intro'
    )
  })
  it('falls back to the first attendee, and skips a missing type', () => {
    expect(autoMeetingName(form({ attendees: ['[[Ada Lovelace]]', '[[B]]'] }))).toBe(
      '2026-11-24 Ada Lovelace'
    )
  })
  it('is empty without a subject', () => expect(autoMeetingName(form())).toBe(''))
})

describe('fieldsFor', () => {
  it('company sends a trimmed website only when given', () => {
    expect(fieldsFor('company', form({ website: ' https://a.com ' }))).toEqual({
      website: 'https://a.com'
    })
    expect(fieldsFor('company', form())).toEqual({})
  })
  it('person sends company link and met', () => {
    expect(fieldsFor('person', form({ company: ['[[Acme]]'], met: true }))).toEqual({
      company: '[[Acme]]',
      met: true
    })
    expect(fieldsFor('person', form())).toEqual({})
  })
  it('meeting sends date, company, attendees and type', () => {
    expect(
      fieldsFor(
        'meeting',
        form({ company: ['[[Acme]]'], meetingType: 'intro', attendees: ['[[A]]'] })
      )
    ).toEqual({
      date: '2026-11-24',
      company: '[[Acme]]',
      attendees: ['[[A]]'],
      meeting_type: 'intro'
    })
  })
  it('research sends about; theme sends nothing', () => {
    expect(fieldsFor('research', form({ about: ['[[A]]', '[[B]]'] }))).toEqual({
      about: ['[[A]]', '[[B]]']
    })
    expect(fieldsFor('theme', form({ website: 'x' }))).toEqual({})
  })
})

describe('validate', () => {
  it('requires a name and rejects bad characters with core wording', () => {
    expect(validate('theme', form()).name).toBe('A name is required.')
    expect(validate('theme', form({ name: 'a/b' })).name).toBe(
      "A name can't contain / (they break file names or links)."
    )
    expect(validate('theme', form({ name: 'Fine name' }))).toEqual({})
  })
  it('meetings need a subject', () => {
    expect(validate('meeting', form({ name: 'x' })).company).toBeTruthy()
    expect(validate('meeting', form())).toEqual({ company: 'Pick a company or an attendee.' })
    expect(validate('meeting', form({ name: 'x', company: ['[[A]]'] }))).toEqual({})
  })
  it('flags repeated spaces', () => {
    expect(nameProblem('a  b')).toMatch(/repeated spaces/)
    expect(isNameError(nameProblem('a  b')!)).toBe(true)
  })
})
