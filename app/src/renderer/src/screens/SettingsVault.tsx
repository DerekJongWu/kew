// Settings › Vault and history: where the vault is, switching, rebuilding the index, and every change.
import { useState } from 'react'
import { kew, useQuery } from '../api'
import { plainError, status } from '../lib/actions'
import { timeAgo } from '../lib/dates'
import { prettyPath } from '../lib/onboarding'
import { KIND_LABEL, notUndoableReason } from '../lib/settings-fields'
import { router } from '../router'
import type { HistoryEntry } from '../../../shared/api'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { Section } from '../components/Section'
import { SettingsHeader } from '../components/SettingsTabs'

export function SettingsVault(): React.JSX.Element {
  const { data: state } = useQuery(() => kew.getState(), [])
  const { data: history, error: loadError } = useQuery(() => kew.history(200), [])
  const [error, setError] = useState<string | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const vault = state?.vault

  const act = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setError(null)
    try {
      await status.run(fn)
      return true
    } catch (e) {
      setError(plainError(e))
      return false
    }
  }
  const rebuild = async (): Promise<void> => {
    setRebuilding(true)
    setDone(null)
    if (await act(() => kew.rebuildIndex())) setDone('Index rebuilt from your notes.')
    setRebuilding(false)
  }

  return (
    <div className="screen settings">
      <SettingsHeader tab="vault" title="Vault and history" />
      {(error || loadError) && (
        <p className="row-error settings-error" role="alert">
          {error ?? plainError(loadError)}
        </p>
      )}
      <Section title="Vault">
        <div className="vault-card">
          <div className="vault-where">
            <p className="vault-name">{vault?.name ?? ''}</p>
            <p className="form-hint vault-path">{vault ? prettyPath(vault.root) : ''}</p>
          </div>
          <div className="vault-actions">
            <Button onClick={() => void act(() => kew.revealVault())}>Reveal in Finder</Button>
            <Button onClick={() => router.navigate({ name: 'onboarding' })}>Switch vault…</Button>
            <Button onClick={() => void rebuild()} disabled={rebuilding}>
              {rebuilding ? 'Rebuilding…' : 'Rebuild index'}
            </Button>
          </div>
          <p className="form-hint" role="status">
            {done ??
              'Rebuild the index if search or lists look out of date after editing files elsewhere.'}
          </p>
        </div>
      </Section>
      <Section title="History" count={history?.length}>
        {history && history.length === 0 && (
          <p className="history-empty">No changes yet. Actions you take in Kew show up here.</p>
        )}
        <ol className="history-full">
          {history?.map((e) => (
            <HistoryRow key={e.id} entry={e} onUndo={() => void act(() => kew.undo(e.id))} />
          ))}
        </ol>
      </Section>
    </div>
  )
}

function HistoryRow({
  entry: e,
  onUndo
}: {
  entry: HistoryEntry
  onUndo(): void
}): React.JSX.Element {
  const reason = notUndoableReason(e)
  return (
    <li className="history-full-row">
      <span className="history-message">{e.message}</span>
      <Chip tone={e.kind === 'action' ? 'neutral' : 'accent'}>{KIND_LABEL[e.kind]}</Chip>
      <span className="history-meta">{timeAgo(e.time)}</span>
      {e.undoable ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onUndo}>
          Undo
          <span className="visually-hidden">: {e.message}</span>
        </button>
      ) : (
        <span className="history-meta history-reason">{reason}</span>
      )}
    </li>
  )
}
