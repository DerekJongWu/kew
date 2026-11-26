// A person's outreach: where things stand and what to do next, then the log of every touch.
import { useState } from 'react'
import { kew } from '../api'
import { plainError, status } from '../lib/actions'
import { friendlyDate, isoDate } from '../lib/dates'
import { entryIdOf, toastText, toasts } from '../lib/toast'
import type { OutreachEvent, RecordDetail } from '../../../shared/api'
import { Button } from './Button'
import { Chip } from './Chip'
import { EmptyState } from './EmptyState'
import { LogForm, SnoozeMenu } from './RowActions'
import { Section } from './Section'

function headline(state: string, first: string): string {
  switch (state) {
    case 'reply-owed':
      return `You owe ${first} a reply`
    case 'follow-up-due':
      return `Follow up with ${first}`
    case 'waiting':
      return `Waiting to hear from ${first}`
    default:
      return 'No follow-up planned'
  }
}

export function OutreachCard({ person }: { person: RecordDetail }): React.JSX.Element {
  const today = isoDate()
  const [mode, setMode] = useState<null | 'out' | 'in'>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const st = person.outreach?.state
  const due = st?.state === 'reply-owed' || st?.state === 'follow-up-due'
  const met = person.fields.met === true
  const first = person.name.split(' ')[0]

  const run = (fn: () => Promise<unknown>, done: string): void => {
    setError(null)
    setBusy(true)
    status.run(fn).then(
      (res) => {
        setBusy(false)
        setMode(null)
        toasts.show(done, entryIdOf(res))
      },
      (e) => (setBusy(false), setError(plainError(e)))
    )
  }

  return (
    <section
      className={`outreach-card${due ? ' is-due' : ''}`}
      aria-label="Outreach"
      aria-busy={busy}
    >
      <div className="outreach-head">
        <div>
          <p className="outreach-title">{headline(st?.state ?? 'none', first)}</p>
          {st?.reason && <p className="row-meta">{st.reason}</p>}
        </div>
        {mode === null && (
          <div className="row-actions">
            <Button variant={due ? 'primary' : 'secondary'} onClick={() => setMode('out')}>
              Log send
            </Button>
            <Button onClick={() => setMode('in')}>Log reply</Button>
            <SnoozeMenu
              today={today}
              onSnooze={(d) =>
                run(() => kew.snooze(person.id, d), toastText.snoozed(person.name, d, today))
              }
            />
            {!met && (
              <Button
                variant="ghost"
                onClick={() => run(() => kew.weMet(person.id), toastText.met(person.name))}
              >
                We met
              </Button>
            )}
          </div>
        )}
      </div>
      {mode && (
        <LogForm
          dir={mode}
          defaultChannel={String(person.fields.channel ?? '')}
          onSubmit={(channel, text) =>
            run(
              () => kew.logOutreach(person.id, { dir: mode, channel, text }),
              toastText.logged(mode, person.name)
            )
          }
          onCancel={() => setMode(null)}
        />
      )}
      {error && (
        <p className="row-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

const DIR: Record<OutreachEvent['dir'], string> = { out: 'Sent', in: 'Reply', note: 'Note' }

/** Every logged touch, newest first. The log is append-only; History undoes a mistaken entry. */
export function OutreachLog({ events }: { events: OutreachEvent[] }): React.JSX.Element {
  const today = isoDate()
  const rows = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.i - a.i)
    .map((x) => x.e)
  return (
    <Section title="Outreach log" count={events.length}>
      {rows.length ? (
        <ol className="rows">
          {rows.map((e, i) => (
            <li key={i} className="row row-compact log-item">
              <span className="timeline-date">{friendlyDate(e.date, today)}</span>
              <span className="log-dir">
                <Chip tone={e.dir === 'in' ? 'accent' : 'neutral'}>{DIR[e.dir]}</Chip>
                {e.channel && <span className="row-sub">{e.channel}</span>}
              </span>
              <span className="timeline-text">{e.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="Nothing logged yet">
          Log a send when you message them. Kew works out when to follow up.
        </EmptyState>
      )}
    </Section>
  )
}
