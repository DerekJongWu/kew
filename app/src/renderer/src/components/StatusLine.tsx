import { useStatus } from '../lib/actions'
import { Icon } from './Icon'

/** Save state. Every write is local and immediate, so the normal state says so plainly. */
export function StatusLine(): React.JSX.Element {
  const { pending, error } = useStatus()
  const state = pending > 0 ? 'saving' : error ? 'error' : 'saved'
  return (
    <p
      className={`status status-${state}`}
      role="status"
      aria-live="polite"
      title={error ?? undefined}
    >
      <Icon name={state === 'error' ? 'alert' : state === 'saving' ? 'dot' : 'check'} size={14} />
      <span>
        {state === 'saving'
          ? 'Saving…'
          : state === 'error'
            ? error
            : 'All changes saved on this Mac'}
      </span>
    </p>
  )
}
