import { useCallback, useEffect, useState } from 'react'
import { kew, useQuery } from './api'
import { router, useRoute } from './router'
import { latestUndoable, status } from './lib/actions'
import { DESTINATIONS, SETTINGS } from './lib/destinations'
import { Sidebar } from './components/Sidebar'
import { CommandBar } from './components/CommandBar'
import { Icon } from './components/Icon'
import { Today } from './screens/Today'
import { Placeholder } from './screens/Placeholder'
import { NoVault } from './screens/NoVault'

const isEditable = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/** ⌘Z: undo the newest action. Failures land in the status line in plain words. */
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
  const { data: state } = useQuery(() => kew.getState(), [])
  const [route] = useRoute()
  const [commandOpen, setCommandOpen] = useState(false)

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return
      const key = e.key.toLowerCase()
      const nav = [...DESTINATIONS, SETTINGS].find((d) => d.shortcut === key)
      if (key === 'k') setCommandOpen((o) => !o)
      else if (key === '[') router.back()
      else if (key === ']') router.forward()
      else if (key === 'z' && !e.shiftKey && !isEditable(e.target) && !commandOpen) void undoLast()
      else if (nav && !commandOpen) router.navigate(nav.route)
      else return
      e.preventDefault()
    },
    [commandOpen]
  )
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  if (!state) return <div className="app-loading drag" />
  if (!state.vault) return <NoVault />

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
          ) : (
            <Placeholder key={JSON.stringify(route)} route={route} />
          )}
        </div>
      </main>
      {commandOpen && <CommandBar onClose={() => setCommandOpen(false)} onUndoLast={undoLast} />}
    </div>
  )
}

export default App
