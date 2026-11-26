import { useState } from 'react'
import { kew, useQuery } from '../api'
import { router } from '../router'
import { plainError, status } from '../lib/actions'
import { addDays, friendlyDate, isoDate, longDate } from '../lib/dates'
import { entryIdOf, toastText, toasts } from '../lib/toast'
import type { RecordDetail, RecordSummary, Schema, TodayPerson } from '../../../shared/api'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { EmptyState } from '../components/EmptyState'
import { Section } from '../components/Section'
import { LogForm, PassForm, SnoozeMenu } from '../components/RowActions'

type Mode = null | 'send' | 'reply' | 'pass'

/** Per-row state: which inline form is open and the last error. Every write goes through here. */
function useRow(): {
  mode: Mode
  setMode(m: Mode): void
  error: string | null
  busy: boolean
  /** Runs a write; on success closes the form and shows `done` as a toast. */
  run(fn: () => Promise<unknown>, done?: string): void
} {
  const [mode, setMode] = useState<Mode>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = (fn: () => Promise<unknown>, done?: string): void => {
    setError(null)
    setBusy(true)
    status.run(fn).then(
      (res) => {
        setBusy(false)
        setMode(null)
        if (done) toasts.show(done, entryIdOf(res))
      },
      (e) => (setBusy(false), setError(plainError(e)))
    )
  }
  return { mode, setMode, error, busy, run }
}

const open = (id: string): void => router.navigate({ name: 'record', id })

function Name({ record }: { record: RecordSummary }): React.JSX.Element {
  return (
    <button type="button" className="row-name" onClick={() => open(record.id)}>
      {record.name}
    </button>
  )
}

function RowError({ error }: { error: string | null }): React.JSX.Element | null {
  return error ? (
    <p className="row-error" role="alert">
      {error}
    </p>
  ) : null
}

/** First paragraph under a "## <heading>" in a note body. */
function sectionText(body: string | undefined, heading: string): string {
  const m = new RegExp(`^## ${heading}\\s*\\n+([^#\\n][^\\n]*)`, 'm').exec(body ?? '')
  return m?.[1].trim() ?? ''
}

function optionLabel(schema: Schema | undefined, key: string, value: unknown): string {
  const f = schema?.types.company.fields.find((x) => x.key === key)
  return f?.options?.find((o) => o.value === value)?.label ?? String(value ?? '')
}

function PersonRow({
  item,
  today,
  owed,
  lastWords
}: {
  item: TodayPerson
  today: string
  owed: boolean
  lastWords?: string
}): React.JSX.Element {
  const row = useRow()
  const { person, company, state } = item
  const log = (dir: 'out' | 'in') => (channel: string, text: string) =>
    row.run(
      () => kew.logOutreach(person.id, { dir, channel, text }),
      toastText.logged(dir, person.name)
    )
  return (
    <li className="row" aria-busy={row.busy}>
      <div className="row-main">
        <div className="row-line">
          <Name record={person} />
          {company && <span className="row-sub">{company.name}</span>}
        </div>
        <p className="row-meta">
          {state.reason}
          {owed && lastWords && (
            <>
              : <q className="row-quote">{lastWords}</q>
            </>
          )}
        </p>
      </div>
      {row.mode === null && (
        <div className="row-actions">
          <Button variant="primary" onClick={() => row.setMode('send')}>
            Log send
          </Button>
          {!owed && <Button onClick={() => row.setMode('reply')}>Log reply</Button>}
          <SnoozeMenu
            today={today}
            onSnooze={(d) =>
              row.run(() => kew.snooze(person.id, d), toastText.snoozed(person.name, d, today))
            }
          />
        </div>
      )}
      {(row.mode === 'send' || row.mode === 'reply') && (
        <LogForm
          dir={row.mode === 'send' ? 'out' : 'in'}
          defaultChannel={String(person.fields.channel ?? '')}
          onSubmit={log(row.mode === 'send' ? 'out' : 'in')}
          onCancel={() => row.setMode(null)}
        />
      )}
      <RowError error={row.error} />
    </li>
  )
}

function ReachOutRow({
  company,
  today,
  schema
}: {
  company: RecordSummary
  today: string
  schema?: Schema
}): React.JSX.Element {
  const row = useRow()
  const on = String(company.fields.reach_out_on ?? '')
  const stage = optionLabel(schema, 'pipeline_status', company.fields.pipeline_status)
  return (
    <li className="row" aria-busy={row.busy}>
      <div className="row-main">
        <div className="row-line">
          <Name record={company} />
          {stage && <span className="row-sub">{stage}</span>}
        </div>
        <p className="row-meta">
          {on === today
            ? 'You planned to reach out today'
            : `You planned to reach out ${friendlyDate(on, today)}`}
        </p>
      </div>
      <div className="row-actions">
        <Button
          onClick={() =>
            row.run(
              () => kew.snooze(company.id, addDays(today, 7)),
              toastText.snoozed(company.name, addDays(today, 7), today)
            )
          }
        >
          Push a week
        </Button>
      </div>
      <RowError error={row.error} />
    </li>
  )
}

function InboundRow({
  company,
  today,
  schema,
  what
}: {
  company: RecordSummary
  today: string
  schema?: Schema
  what?: string
}): React.JSX.Element {
  const row = useRow()
  const seen = String(company.fields.first_seen ?? '')
  const source = company.fields.source ? optionLabel(schema, 'source', company.fields.source) : ''
  const stage = company.fields.stage ? optionLabel(schema, 'stage', company.fields.stage) : ''
  return (
    <li className="row" aria-busy={row.busy}>
      <div className="row-main">
        <div className="row-line">
          <Name record={company} />
          <span className="row-chips">
            {source && <Chip>{source}</Chip>}
            {stage && <Chip>{stage}</Chip>}
          </span>
          {seen && <span className="row-sub">Seen {friendlyDate(seen, today)}</span>}
        </div>
        <p className="row-meta">{what || 'No description yet'}</p>
      </div>
      {row.mode === null && (
        <div className="row-actions">
          <Button
            variant="primary"
            onClick={() =>
              row.run(
                () => kew.setFields(company.id, { pipeline_status: 'pursuing' }),
                toastText.moved(company.name, optionLabel(schema, 'pipeline_status', 'pursuing'))
              )
            }
          >
            Pursue
          </Button>
          <Button onClick={() => row.setMode('pass')}>Pass</Button>
        </div>
      )}
      {row.mode === 'pass' && (
        <PassForm
          onSubmit={(reason) =>
            row.run(() => kew.passCompany(company.id, reason), toastText.passed(company.name))
          }
          onCancel={() => row.setMode(null)}
        />
      )}
      <RowError error={row.error} />
    </li>
  )
}

/** Loads full records for a few rows (inbound descriptions, the words of a reply you owe). */
function useDetails(ids: string[]): Map<string, RecordDetail> {
  const { data } = useQuery(() => Promise.all(ids.map((id) => kew.get(id))), [ids.join(',')])
  return new Map((data ?? []).filter((d): d is RecordDetail => d !== null).map((d) => [d.id, d]))
}

export function Today(): React.JSX.Element {
  const today = isoDate()
  const { data, error } = useQuery(() => kew.today(), [])
  const { data: schema } = useQuery(() => kew.schema(), [])
  const details = useDetails([
    ...(data?.repliesOwed ?? []).map((p) => p.person.id),
    ...(data?.newInbound ?? []).map((c) => c.id)
  ])
  const lastIn = (id: string): string | undefined =>
    details
      .get(id)
      ?.outreach?.events.filter((e) => e.dir === 'in')
      .pop()?.text

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <p className="screen-kicker">{longDate(today)}</p>
          <h1 className="screen-title">Today</h1>
        </div>
      </header>
      {error && (
        <p className="row-error" role="alert">
          Couldn’t load Today: {plainError(error)}
        </p>
      )}
      {data && (
        <div className="today-grid">
          <Section title="Follow-ups due" count={data.followUps.length} due>
            {data.followUps.length ? (
              <ul className="rows">
                {data.followUps.map((p) => (
                  <PersonRow key={p.person.id} item={p} today={today} owed={false} />
                ))}
              </ul>
            ) : (
              <EmptyState title="No follow-ups due">
                People you’ve messaged come back here when their cadence is up.
              </EmptyState>
            )}
          </Section>
          <Section title="Replies you owe" count={data.repliesOwed.length} due>
            {data.repliesOwed.length ? (
              <ul className="rows">
                {data.repliesOwed.map((p) => (
                  <PersonRow
                    key={p.person.id}
                    item={p}
                    today={today}
                    owed
                    lastWords={lastIn(p.person.id)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState title="You’re all caught up">
                When someone replies, log it on their row and they’ll wait here for your answer.
              </EmptyState>
            )}
          </Section>
          <Section title="Reach out today" count={data.reachOut.length} due>
            {data.reachOut.length ? (
              <ul className="rows">
                {data.reachOut.map((c) => (
                  <ReachOutRow key={c.id} company={c} today={today} schema={schema} />
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing planned for today">
                Set “Reach out on” on a company to have it show up here on that day.
              </EmptyState>
            )}
          </Section>
          <Section
            title="New inbound to triage"
            count={data.newInbound.length}
            action={
              <button
                type="button"
                className="link"
                onClick={() => router.navigate({ name: 'pipeline' })}
              >
                Open pipeline
              </button>
            }
          >
            {data.newInbound.length ? (
              <ul className="rows">
                {data.newInbound.map((c) => (
                  <InboundRow
                    key={c.id}
                    company={c}
                    today={today}
                    schema={schema}
                    what={sectionText(details.get(c.id)?.body, 'What it is')}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState title="Inbox zero">
                New companies land here until you pursue or pass on them.
              </EmptyState>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}
