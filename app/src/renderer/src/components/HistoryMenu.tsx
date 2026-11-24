import { useState } from 'react'
import { kew, useQuery } from '../api'
import { plainError, status } from '../lib/actions'
import { timeAgo } from '../lib/dates'
import type { HistoryEntry } from '../../../shared/api'
import { Popover } from './Popover'
import { Icon } from './Icon'
import { Kbd } from './Chip'

function HistoryList(): React.JSX.Element {
  const { data, error: loadError } = useQuery(() => kew.history(20), [])
  const [error, setError] = useState<string | null>(null)
  const undo = async (e: HistoryEntry): Promise<void> => {
    setError(null)
    try {
      await status.run(() => kew.undo(e.id))
    } catch (err) {
      setError(plainError(err))
    }
  }
  return (
    <div className="history">
      <header className="history-head">
        <h2 className="history-title">History</h2>
        <span className="history-hint">
          <Kbd>⌘Z</Kbd> undoes the latest change
        </span>
      </header>
      {(error || loadError) && (
        <p className="row-error" role="alert">
          {error ?? plainError(loadError)}
        </p>
      )}
      {data && data.length === 0 && (
        <p className="history-empty">No changes yet. Actions you take in Kew show up here.</p>
      )}
      <ol className="history-list">
        {data?.map((e) => (
          <li key={e.id} className="history-item">
            <div className="history-text">
              <span className="history-message">{e.message}</span>
              <span className="history-meta">
                {timeAgo(e.time)}
                {e.kind === 'external' && ', edited outside Kew'}
                {e.kind === 'undo' && ', undo'}
              </span>
            </div>
            {e.undoable && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void undo(e)}>
                Undo
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function HistoryMenu(): React.JSX.Element {
  return (
    <Popover
      placement="above"
      panelLabel="History"
      buttonClass="nav-item history-button"
      label={
        <>
          <Icon name="history" size={14} />
          <span>History</span>
        </>
      }
    >
      {() => <HistoryList />}
    </Popover>
  )
}
