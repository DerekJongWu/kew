import { kew } from '../api'
import { plainError, status } from '../lib/actions'
import { flushes } from '../lib/flush'
import { toastUndo, toasts, useToast, type Toast } from '../lib/toast'
import { Kbd } from './Chip'

/**
 * Undo for exactly the toasted action. Pending edits (a note being typed) are saved first, so the
 * history read is settled; if anything landed after the action, the toast says it can't undo.
 */
async function undoToasted(t: Toast & { entryId: string }): Promise<void> {
  try {
    await flushes.flushAll()
    const decision = toastUndo(await kew.history(20), t.entryId)
    if ('reason' in decision) return toasts.settle(t.id, decision.reason)
    toasts.dismiss()
    await status.run(() => kew.undo(decision.undo))
  } catch (e) {
    toasts.settle(t.id, `Can’t undo: ${plainError(e)}`)
  }
}

/**
 * The app's one toast, bottom centre. Undo reverts the toasted action only (⌘Z undoes the newest
 * change). Hovering or focusing the toast holds it; Escape (with focus inside) dismisses it.
 * Rendered at the app root, outside the record layout container, so its fixed position is
 * against the window.
 */
export function ToastHost(): React.JSX.Element {
  const toast = useToast()
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toast && (
        <div
          key={toast.id}
          className="toast"
          onMouseEnter={toasts.pause}
          onMouseLeave={toasts.resume}
          onFocus={toasts.pause}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) toasts.resume()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              toasts.dismiss()
            }
          }}
        >
          <span className="toast-text">{toast.message}</span>
          {toast.entryId && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => void undoToasted({ ...toast, entryId: toast.entryId! })}
            >
              Undo <Kbd>⌘Z</Kbd>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
