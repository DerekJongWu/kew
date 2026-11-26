// One record: title, properties, the note body, and what links here. Companies add their team,
// status and pass flow; people add the outreach card and log; themes list their companies.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { kew, useQuery } from '../api'
import { router } from '../router'
import { plainError, status } from '../lib/actions'
import { DESTINATIONS, TYPE_LABEL } from '../lib/destinations'
import { splitProblems } from '../lib/properties'
import { useFlushOnLeave } from '../lib/use-flush'
import { unwrap } from '../lib/pipeline'
import { nameProblem } from '../../../shared/names'
import type { FieldDef, FieldValue, RecordDetail, RecordType } from '../../../shared/api'
import { Button } from '../components/Button'
import { Chip, Kbd } from '../components/Chip'
import { EmptyState } from '../components/EmptyState'
import { Section } from '../components/Section'
import { PropertyPanel } from '../components/PropertyPanel'
import { MarkdownEditor, type EditorHandle } from '../components/MarkdownEditor'
import { resolveLink } from '../lib/note-editor'
import { Backlinks, RecordLinks } from '../components/Backlinks'
import { Timeline } from '../components/Timeline'
import { OutreachCard, OutreachLog } from '../components/OutreachCard'
import { PassDialog } from '../components/PassDialog'
import { NewRecordDialog } from '../components/NewRecordDialog'

const open = (id: string): void => router.navigate({ name: 'record', id })
const CREATE_TYPES: RecordType[] = ['company', 'person', 'theme', 'research']

/** The name as an editable heading. Saves on Return or blur; Escape puts it back. */
function Title({ record }: { record: RecordDetail }): React.JSX.Element {
  const [draft, setDraft] = useState(record.name)
  const [error, setError] = useState<string | null>(null)
  const editing = useRef(false)
  const area = useRef<HTMLTextAreaElement>(null)
  // Grow to fit the wrapped name, on every edit and whenever the width changes.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    const fit = (): void => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px` // + the 1px border top and bottom
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [draft])
  const sent = useRef<string | null>(null) // the name last sent, so leaving after a blur doesn't resend
  useEffect(() => {
    sent.current = null
    if (!editing.current) setDraft(record.name)
  }, [record.name])
  // Returns the rename, so a flush (window close, quit) waits for it to finish.
  const save = async (): Promise<void> => {
    const next = draft.trim()
    if (next === record.name) return setError(null)
    if (next === sent.current) return
    const problem = nameProblem(next)
    if (problem) return setError(problem)
    setError(null)
    sent.current = next
    return status
      .run(() => kew.rename(record.id, next))
      .then(
        (res) => {
          // A note added by hand gets its id on this write; follow it so the page doesn't lose it.
          const nextId = res.changedIds.includes(record.id) ? record.id : res.changedIds[0]
          const here = router.current()
          if (nextId && nextId !== record.id && here.name === 'record' && here.id === record.id)
            router.navigate({ name: 'record', id: nextId })
        },
        (e) => {
          sent.current = null
          setError(plainError(e))
        }
      )
  }
  useFlushOnLeave(save)
  return (
    <div className="record-title-wrap">
      <textarea
        ref={area}
        className="screen-title record-title"
        aria-label="Name"
        rows={1}
        value={draft}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'record-title-err' : undefined}
        onFocus={() => (editing.current = true)}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
        onBlur={() => {
          editing.current = false
          void save()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          } else if (e.key === 'Escape') {
            setDraft(record.name)
            setError(null)
            e.currentTarget.blur()
          }
        }}
      />
      {error && (
        <p className="form-error" id="record-title-err" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Company status in the header: the same stage options as the property, passing asks why. */
function StatusSelect({
  field,
  value,
  onCommit
}: {
  field: FieldDef
  value: FieldValue | undefined
  onCommit(v: FieldValue): void
}): React.JSX.Element {
  return (
    <label className="record-status">
      <span className="visually-hidden">{field.label}</span>
      <select
        className="field field-select"
        value={String(value ?? '')}
        onChange={(e) => onCommit(e.target.value || null)}
      >
        <option value="">No status</option>
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** People at a company with their role, whether you've met, and where outreach stands. */
function Team({ people }: { people: RecordDetail['people'] }): React.JSX.Element {
  const list = people ?? []
  const { data } = useQuery(
    () => Promise.all(list.map((p) => kew.get(p.id))),
    [list.map((p) => p.id).join(',')]
  )
  const state = new Map((data ?? []).filter(Boolean).map((d) => [d!.id, d!.outreach?.state]))
  return (
    <Section title="Team" count={list.length}>
      {list.length ? (
        <ul className="rows">
          {list.map((p) => {
            const s = state.get(p.id)
            const due = s?.state === 'reply-owed' || s?.state === 'follow-up-due'
            return (
              <li key={p.id} className="row">
                <div className="row-main">
                  <div className="row-line">
                    <button type="button" className="row-name" onClick={() => open(p.id)}>
                      {p.name}
                    </button>
                    {p.fields.role && <span className="row-sub">{String(p.fields.role)}</span>}
                    <span className="row-chips">
                      <Chip>{p.fields.met === true ? 'Met' : 'Not met'}</Chip>
                    </span>
                  </div>
                  {s && s.state !== 'none' && (
                    <p className={`row-meta${due ? ' is-due' : ''}`}>{s.reason}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState title="No people yet">
          Add a person and set their company to this one.
        </EmptyState>
      )}
    </Section>
  )
}

/** Companies whose themes include this theme. */
function ThemeCompanies({ name }: { name: string }): React.JSX.Element {
  const { data, error } = useQuery(
    () => kew.list('company', { filters: { themes: [name] } }),
    [name]
  )
  if (error)
    return (
      <p className="row-error" role="alert">
        Couldn’t load companies: {plainError(error)}
      </p>
    )
  return (
    <RecordLinks title="Companies" records={data ?? []} empty="No company has this theme yet" />
  )
}

export function RecordPage({ id }: { id: string }): React.JSX.Element {
  const { data: record, error } = useQuery(() => kew.get(id), [id])
  const { data: schema } = useQuery(() => kew.schema(), [])
  const editor = useRef<EditorHandle | null>(null)
  const [passing, setPassing] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [missingLink, setMissingLink] = useState<string | null>(null)
  const [creating, setCreating] = useState<RecordType | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        editor.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (error && record === undefined)
    return (
      <div className="screen">
        <p className="row-error" role="alert">
          Couldn’t load this record: {plainError(error)}
        </p>
      </div>
    )
  if (record === null)
    return (
      <div className="screen">
        <EmptyState title="This record was deleted or moved">
          It may have been renamed or removed outside Kew.{' '}
          <button
            type="button"
            className="link"
            onClick={() => (router.canBack() ? router.back() : router.navigate({ name: 'today' }))}
          >
            Go back
          </button>
        </EmptyState>
      </div>
    )
  if (!record || !schema) return <div className="screen" />

  const fields = schema.types[record.type].fields
  const { byKey, unmatched } = splitProblems(
    record.problems,
    Object.keys(record.fields).concat(fields.map((f) => f.key))
  )
  const statusField = fields.find((f) => f.key === 'pipeline_status')

  const commit = async (key: string, value: FieldValue): Promise<void> => {
    if (record.type === 'company' && key === 'pipeline_status' && value === 'passed') {
      setPassing(true)
      return
    }
    await status.run(() => kew.setFields(record.id, { [key]: value }))
  }
  const run = (fn: () => Promise<unknown>): void => {
    setPageError(null)
    fn().catch((e) => setPageError(plainError(e)))
  }
  const openLink = (name: string): void =>
    run(async () => {
      const target = await resolveLink(name)
      if (target) open(target)
      else setMissingLink(name)
    })

  const listLabel = DESTINATIONS.find((d) => d.key === record.type)?.label ?? ''
  const company = record.type === 'person' ? unwrap(String(record.fields.company ?? '')) : ''

  const properties = (wide: boolean): React.JSX.Element => (
    <PropertyPanel record={record} fields={fields} byKey={byKey} onCommit={commit} wide={wide} />
  )
  const notes = (
    <Section
      title="Notes"
      action={
        <span className="section-hint">
          <Kbd>⌘E</Kbd> to write, <Kbd>⌘</Kbd>-click a link to open it
        </span>
      }
    >
      <MarkdownEditor
        recordId={record.id}
        body={record.body}
        label={`Notes on ${record.name}`}
        ref={editor}
        onOpenLink={openLink}
      />
      {missingLink && (
        <div className="editor-missing" role="status">
          <span>
            No record is called <strong>{missingLink}</strong>. Create it as
          </span>
          {CREATE_TYPES.map((t) => (
            <Button key={t} className="btn-sm" onClick={() => setCreating(t)}>
              {TYPE_LABEL[t]}
            </Button>
          ))}
          <Button className="btn-sm" variant="ghost" onClick={() => setMissingLink(null)}>
            Dismiss
          </Button>
        </div>
      )}
    </Section>
  )
  const backlinks = <Backlinks records={record.backlinks} />

  return (
    <div className="screen record">
      <header className="record-head">
        <p className="screen-kicker">
          <button
            type="button"
            className="link record-crumb"
            onClick={() => router.navigate({ name: 'list', type: record.type })}
          >
            {listLabel}
          </button>
        </p>
        <div className="record-head-row">
          <div className="record-head-main">
            <Title record={record} />
            {record.type === 'person' && (company || record.fields.role) && (
              <p className="record-sub">
                {[record.fields.role, company && `at ${company}`].filter(Boolean).join(' ')}
              </p>
            )}
          </div>
          <div className="row-actions">
            {record.type === 'company' && statusField && (
              <>
                <StatusSelect
                  field={statusField}
                  value={record.fields.pipeline_status}
                  onCommit={(v) => run(() => commit('pipeline_status', v))}
                />
                <Button onClick={() => setPassing(true)}>Pass…</Button>
              </>
            )}
            <Button variant="ghost" onClick={() => run(() => kew.openInFinder(record.id))}>
              Reveal in Finder
            </Button>
          </div>
        </div>
      </header>
      {(unmatched.length > 0 || pageError) && (
        <div className="record-banner" role="alert">
          {pageError && <p>{pageError}</p>}
          {unmatched.length > 0 && (
            <>
              <p>Kew found a problem in this note’s file:</p>
              <ul>
                {unmatched.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {record.type === 'company' ? (
        <>
          {properties(true)}
          <div className="record-grid">
            <div className="record-main">
              <Team people={record.people} />
              {notes}
            </div>
            <aside className="record-side">
              <Timeline items={record.timeline} />
              {backlinks}
            </aside>
          </div>
        </>
      ) : record.type === 'person' ? (
        <div className="record-grid record-grid-props">
          <div className="record-main">
            <OutreachCard person={record} />
            <OutreachLog events={record.outreach?.events ?? []} />
            {notes}
          </div>
          <div className="record-props">{properties(false)}</div>
          <aside className="record-side">{backlinks}</aside>
        </div>
      ) : (
        <div className="record-grid record-grid-props">
          <div className="record-main">{notes}</div>
          <div className="record-props">{properties(false)}</div>
          <aside className="record-side">
            {record.type === 'theme' && <ThemeCompanies name={record.name} />}
            {backlinks}
          </aside>
        </div>
      )}

      {passing && (
        <PassDialog
          name={record.name}
          onSubmit={(reason) => {
            setPassing(false)
            run(() => status.run(() => kew.passCompany(record.id, reason)))
          }}
          onCancel={() => setPassing(false)}
        />
      )}
      {creating && missingLink && (
        <NewRecordDialog
          key={creating}
          type={creating}
          initialName={missingLink}
          onClose={() => {
            setCreating(null)
            setMissingLink(null)
          }}
        />
      )}
    </div>
  )
}
