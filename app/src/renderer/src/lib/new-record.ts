// Pure logic for the new-record dialog: which fields each type asks for, the meeting name, validation.
import type { FieldValue, RecordType } from '../../../shared/api'
import { meetingName, nameProblem } from '../../../shared/names'

export interface NewRecordForm {
  name: string
  website: string
  company: string[] // [[Name]] values
  attendees: string[]
  about: string[]
  met: boolean
  date: string
  meetingType: string
}

export const emptyForm = (today: string): NewRecordForm => ({
  name: '',
  website: '',
  company: [],
  attendees: [],
  about: [],
  met: false,
  date: today,
  meetingType: ''
})

const plain = (v: string): string => v.replace(/^\[\[(.*?)(\|.*)?\]\]$/, '$1')
export const wrapLink = (name: string): string => `[[${name}]]`

/** `YYYY-MM-DD <Company or first attendee> <type>`; the type is left out when none is chosen. */
export function autoMeetingName(f: NewRecordForm, typeLabel?: string): string {
  const subject = plain(f.company[0] ?? f.attendees[0] ?? '')
  return subject ? meetingName(f.date, subject, typeLabel) : ''
}

/** The fields to send to createRecord. Empty values are left out. */
export function fieldsFor(type: RecordType, f: NewRecordForm): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {}
  const set = (k: string, v: FieldValue): void => {
    if (v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)) out[k] = v
  }
  if (type === 'company') set('website', f.website.trim())
  if (type === 'person') {
    set('company', f.company[0] ?? '')
    if (f.met) out.met = true
  }
  if (type === 'meeting') {
    set('date', f.date)
    set('company', f.company[0] ?? '')
    set('attendees', f.attendees)
    set('meeting_type', f.meetingType)
  }
  if (type === 'research') set('about', f.about)
  return out
}

export type FormErrors = Partial<Record<'name' | 'date' | 'company', string>>

/** Problems the dialog can spot before asking the vault; core repeats these checks. */
export function validate(type: RecordType, f: NewRecordForm): FormErrors {
  const errors: FormErrors = {}
  const name = nameProblem(f.name)
  if (name) errors.name = name
  if (type === 'meeting') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.date = 'Pick a date.'
    if (!f.company.length && !f.attendees.length) {
      errors.company = 'Pick a company or an attendee.'
      if (!f.name.trim()) delete errors.name // the name is built from the subject
    }
  }
  return errors
}

/** Server messages that belong under the name field rather than above the buttons. */
export const isNameError = (message: string): boolean => /^A name /.test(message)
