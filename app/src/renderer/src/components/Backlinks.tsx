import type { RecordSummary } from '../../../shared/api'
import { router } from '../router'
import { TYPE_LABEL } from '../lib/destinations'
import { EmptyState } from './EmptyState'
import { Section } from './Section'

/** A list of records that open on click: "Mentioned in", a theme's companies. */
export function RecordLinks({
  title,
  records,
  empty
}: {
  title: string
  records: RecordSummary[]
  empty: string
}): React.JSX.Element {
  return (
    <Section title={title} count={records.length}>
      {records.length ? (
        <ul className="rows">
          {records.map((r) => (
            <li key={r.id} className="row row-compact">
              <button
                type="button"
                className="row-name"
                onClick={() => router.navigate({ name: 'record', id: r.id })}
              >
                {r.name}
              </button>
              <span className="row-sub">{TYPE_LABEL[r.type]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={empty} />
      )}
    </Section>
  )
}

/** Notes that link here. */
export function Backlinks({ records }: { records: RecordSummary[] }): React.JSX.Element {
  return <RecordLinks title="Mentioned in" records={records} empty="No other note links here yet" />
}
