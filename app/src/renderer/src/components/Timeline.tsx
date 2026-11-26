import type { TimelineItem } from '../../../shared/api'
import { router } from '../router'
import { EMPTY, friendlyDate, isoDate } from '../lib/dates'
import { EmptyState } from './EmptyState'
import { Section } from './Section'

const KIND: Record<TimelineItem['kind'], string> = {
  outreach: 'Outreach',
  meeting: 'Meeting',
  created: 'Added',
  status: 'Status'
}

/** Activity on a record, newest first (meetings, outreach, when it was first seen). */
export function Timeline({ items }: { items: TimelineItem[] }): React.JSX.Element {
  const today = isoDate()
  return (
    <Section title="Timeline" count={items.length}>
      {items.length ? (
        <ol className="rows timeline">
          {items.map((t, i) => (
            <li key={i} className="row row-compact timeline-item">
              <span className="timeline-date">{t.date ? friendlyDate(t.date, today) : EMPTY}</span>
              <span className="timeline-kind">{KIND[t.kind]}</span>
              {t.recordId ? (
                <button
                  type="button"
                  className="row-name timeline-text"
                  onClick={() => router.navigate({ name: 'record', id: t.recordId! })}
                >
                  {t.text}
                </button>
              ) : (
                <span className="timeline-text">{t.text}</span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="Nothing yet">
          Meetings and outreach show up here as they happen.
        </EmptyState>
      )}
    </Section>
  )
}
