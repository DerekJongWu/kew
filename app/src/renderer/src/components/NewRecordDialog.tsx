import { useEffect, useId, useRef, useState } from 'react'
import { kew, useQuery } from '../api'
import { router } from '../router'
import { plainError, status } from '../lib/actions'
import { TYPE_LABEL } from '../lib/destinations'
import { isoDate } from '../lib/dates'
import {
  autoMeetingName,
  emptyForm,
  fieldsFor,
  isNameError,
  validate,
  type FormErrors,
  type NewRecordForm
} from '../lib/new-record'
import type { DuplicateHit, RecordType } from '../../../shared/api'
import { Button } from './Button'
import { RelationPicker } from './RelationPicker'

const REASON: Record<DuplicateHit['reason'], string> = {
  name: 'same name',
  alias: 'matches an alias',
  domain: 'same website',
  linkedin: 'same LinkedIn'
}
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]'

/**
 * The one way to create a record (list screens and ⌘K both open it). Asks for the name plus the
 * required fields of the type, offers likely duplicates before creating, then opens the new record.
 */
export function NewRecordDialog({
  type,
  initialName = '',
  onClose
}: {
  type: RecordType
  /** Prefills the name, e.g. "Create <name>" from an unresolved [[link]]. */
  initialName?: string
  onClose(): void
}): React.JSX.Element {
  const noun = TYPE_LABEL[type].toLowerCase()
  const uid = useId()
  const box = useRef<HTMLDivElement>(null)
  const [restore] = useState(() => document.activeElement)
  const { data: schema } = useQuery(() => kew.schema(), [])
  const [form, setForm] = useState<NewRecordForm>(() => ({
    ...emptyForm(isoDate()),
    name: initialName
  }))
  const [nameTouched, setNameTouched] = useState(initialName !== '')
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [dupes, setDupes] = useState<DuplicateHit[] | null>(null)
  const [busy, setBusy] = useState(false)

  const typeOptions =
    schema?.types.meeting.fields.find((f) => f.key === 'meeting_type')?.options ?? []

  const close = (): void => {
    onClose()
    if (restore instanceof HTMLElement) restore.focus()
  }
  const set = (patch: Partial<NewRecordForm>): void => {
    const next = { ...form, ...patch }
    // A meeting's name follows its date, company and type until the user edits it.
    if (type === 'meeting' && !nameTouched)
      next.name = autoMeetingName(
        next,
        typeOptions.find((o) => o.value === next.meetingType)?.label
      )
    setForm(next)
    setErrors({})
    setFormError(null)
    setDupes(null)
  }

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input:not([type=checkbox]), select')?.focus()
  }, [])

  const submit = async (force: boolean): Promise<void> => {
    const found = validate(type, form)
    if (Object.keys(found).length) return setErrors(found)
    setBusy(true)
    setFormError(null)
    try {
      const res = await status.run(() =>
        kew.createRecord(type, form.name.trim(), fieldsFor(type, form), force)
      )
      if ('duplicates' in res) return setDupes(res.duplicates)
      const id = res.changedIds[0]
      onClose()
      if (id) router.navigate({ name: 'record', id })
      else if (restore instanceof HTMLElement) restore.focus()
    } catch (e) {
      const m = plainError(e)
      if (isNameError(m)) setErrors({ name: m })
      else setFormError(m)
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const titleId = `${uid}-title`
  const nameId = `${uid}-name`
  const field = (
    label: string,
    id: string,
    control: React.ReactNode,
    error?: string,
    hint?: string
  ): React.JSX.Element => (
    <div className="form-row">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint && !error && <p className="form-hint">{hint}</p>}
      {error && (
        <p className="form-error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  )

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="dialog dialog-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={box}
        onKeyDown={onKeyDown}
      >
        <p className="dialog-title" id={titleId}>
          New {noun}
        </p>
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!dupes && !busy) void submit(false)
          }}
        >
          {type === 'meeting' && (
            <>
              {field(
                'Date',
                `${uid}-date`,
                <input
                  id={`${uid}-date`}
                  type="date"
                  className="field"
                  value={form.date}
                  aria-describedby={errors.date ? `${uid}-date-err` : undefined}
                  onChange={(e) => set({ date: e.target.value })}
                />,
                errors.date
              )}
              <RelationPicker
                label="Company"
                target="company"
                value={form.company}
                onChange={(company) => set({ company })}
                error={errors.company}
              />
              <RelationPicker
                label="Attendees"
                target="person"
                multiple
                value={form.attendees}
                onChange={(attendees) => set({ attendees })}
              />
              {field(
                'Meeting type',
                `${uid}-mt`,
                <select
                  id={`${uid}-mt`}
                  className="field field-select"
                  value={form.meetingType}
                  onChange={(e) => set({ meetingType: e.target.value })}
                >
                  <option value="">None</option>
                  {typeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {field(
            'Name',
            nameId,
            <input
              id={nameId}
              className="field"
              value={form.name}
              required
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-err` : undefined}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setNameTouched(true)
                set({ name: e.target.value })
              }}
            />,
            errors.name,
            type === 'meeting' && !nameTouched
              ? 'Built from the date, company and type. Edit it if you like.'
              : undefined
          )}
          {type === 'company' &&
            field(
              'Website',
              `${uid}-site`,
              <input
                id={`${uid}-site`}
                className="field"
                value={form.website}
                placeholder="example.com"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => set({ website: e.target.value })}
              />,
              undefined,
              'Optional. Kew uses it to spot a company you already have.'
            )}
          {type === 'person' && (
            <>
              <RelationPicker
                label="Company"
                target="company"
                value={form.company}
                onChange={(company) => set({ company })}
                hint="Optional."
              />
              <label className="form-check">
                <input
                  type="checkbox"
                  checked={form.met}
                  onChange={(e) => set({ met: e.target.checked })}
                />
                <span>We’ve met</span>
              </label>
            </>
          )}
          {type === 'research' && (
            <RelationPicker
              label="About"
              target="any"
              multiple
              value={form.about}
              onChange={(about) => set({ about })}
              hint="Optional. Companies, people, themes or meetings this note covers."
            />
          )}

          {formError && (
            <p className="row-error" role="alert">
              {formError}
            </p>
          )}
          {dupes && (
            <section className="dupes" aria-label="Possible duplicates">
              <p className="dupes-title">Did you mean one of these?</p>
              <ul className="dupes-list">
                {dupes.map((d) => (
                  <li key={d.record.id} className="dupes-row">
                    <span className="dupes-name">{d.record.name}</span>
                    <span className="dupes-why">{REASON[d.reason]}</span>
                    <Button
                      variant="secondary"
                      className="btn-sm"
                      aria-label={`Open ${d.record.name}`}
                      onClick={() => {
                        onClose()
                        router.navigate({ name: 'record', id: d.record.id })
                      }}
                    >
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="form-actions">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {dupes ? (
              <Button variant="primary" disabled={busy} onClick={() => void submit(true)}>
                Create anyway
              </Button>
            ) : (
              <Button variant="primary" type="submit" disabled={busy}>
                Create {noun}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
