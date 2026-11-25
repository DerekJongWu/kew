import { useCallback, useEffect, useState } from 'react'
import { kew, useQuery } from './api'
import { router, useRoute } from './router'
import { latestUndoable, plainError, status } from './lib/actions'
import { isEditable } from './lib/editable'
import { undoInEditor } from './lib/note-editor'
import { flushes } from './lib/flush'
import { Button } from './components/Button'
import { DESTINATIONS, SETTINGS } from './lib/destinations'
import { Sidebar } from './components/Sidebar'
import { CommandBar } from './components/CommandBar'
import { Icon } from './components/Icon'
import { Today } from './screens/Today'
import { Pipeline } from './screens/Pipeline'
import { RecordList } from './screens/RecordList'
import { RecordPage } from './screens/RecordPage'
import { NewRecordDialog } from './components/NewRecordDialog'
import type { RecordType } from '../../shared/api'
import { Placeholder } from './screens/Placeholder'
import { Onboarding } from './screens/Onboarding'
import { SettingsFields } from './screens/SettingsFields'
import { SettingsVault } from './screens/SettingsVault'

/** ⌘Z (Edit > Undo in the app menu): undo the newest action. Failures land in the status line in plain words. */
async function undoLast(): Promise<void> {
  await status
    .run(async () => {
      const entry = latestUndoable(await kew.history(20))
      if (!entry) throw new Error('Nothing to undo.')
      await kew.undo(entry.id)
    })
    .catch(() => undefined)
}

function App(): React.JSX.Element {
  const { data: state, error: stateError, reload } = useQuery(() => kew.getState(), [])
  const [route] = useRoute()
  const [commandOpen, setCommandOpen] = useState(false)
  const [newType, setNewType] = useState<RecordType | null>(null)

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      // A focused control that handled the key (an editor, a picker) wins.
      if (e.defaultPrevented || !e.metaKey || e.altKey || e.ctrlKey) return
      const key = e.key.toLowerCase()
      const nav = [...DESTINATIONS, SETTINGS].find((d) => d.shortcut === key)
      if (key === 'k') {
        // Don't open the bar over a modal dialog (closing it is always fine).
        if (!commandOpen && document.querySelector('[role="dialog"][aria-modal="true"]')) return
        setCommandOpen((o) => !o)
      } else if (key === '[') router.back()
      else if (key === ']') router.forward()
      else if (nav && !commandOpen) router.navigate(nav.route)
      else return
      e.preventDefault()
    },
    [commandOpen]
  )
  // Edit > Undo: undo typing in a text field, otherwise the latest vault change.
  useEffect(
    () =>
      kew.onMenuUndo(() => {
        if (undoInEditor(document.activeElement)) return
        if (isEditable(document.activeElement as HTMLElement | null)) document.execCommand('undo')
        else void undoLast()
      }),
    []
  )
  // Window close / quit: main waits for pending edits to be saved.
  useEffect(() => kew.onFlush(() => flushes.flushAll()), [])
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  if (!state && stateError)
    return (
      <div className="no-vault drag">
        <div className="empty" role="alert">
          <p className="empty-title">Kew couldn’t load your vault</p>
          <p className="empty-text">{plainError(stateError)}</p>
          <Button className="empty-action" onClick={reload}>
            Try again
          </Button>
        </div>
      </div>
    )
  if (!state) return <div className="app-loading drag" />
  if (!state.vault || route.name === 'onboarding')
    return (
      <Onboarding
        onOpened={() => {
          router.navigate({ name: 'today' })
          reload()
        }}
        onCancel={state.vault ? router.back : undefined}
      />
    )

  return (
    <div className="app">
      <Sidebar vault={state.vault} onOpenCommand={() => setCommandOpen(true)} />
      <main className="main">
        <div className="topbar drag">
          <button
            type="button"
            className="icon-btn"
            aria-label="Back"
            title="Back  ⌘["
            disabled={!router.canBack()}
            onClick={router.back}
          >
            <Icon name="back" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Forward"
            title="Forward  ⌘]"
            disabled={!router.canForward()}
            onClick={router.forward}
          >
            <Icon name="forward" />
          </button>
        </div>
        <div className="main-scroll">
          {route.name === 'today' ? (
            <Today />
          ) : route.name === 'pipeline' ? (
            <Pipeline />
          ) : route.name === 'list' ? (
            <RecordList key={route.type} type={route.type} />
          ) : route.name === 'record' ? (
            <RecordPage key={route.id} id={route.id} />
          ) : route.name === 'settings' ? (
            route.tab === 'vault' ? (
              <SettingsVault />
            ) : (
              <SettingsFields />
            )
          ) : (
            <Placeholder key={JSON.stringify(route)} route={route} />
          )}
        </div>
      </main>
      {commandOpen && (
        <CommandBar
          onClose={() => setCommandOpen(false)}
          onUndoLast={undoLast}
          onNew={setNewType}
        />
      )}
      {newType && <NewRecordDialog key={newType} type={newType} onClose={() => setNewType(null)} />}
    </div>
  )
}

export default App
