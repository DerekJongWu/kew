import { toasts, useToast } from '../lib/toast'
import { Kbd } from './Chip'

/**
 * The app's one toast, bottom centre. Undo runs the same undo as ⌘Z. Hovering or focusing the
 * toast holds it; Escape (with focus inside) dismisses it. Rendered at the app root, outside the
 * record layout container, so its fixed position is against the window.
 */
export function ToastHost({ onUndo }: { onUndo(): Promise<void> }): React.JSX.Element {
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
          <button
            type="button"
            className="toast-undo"
            onClick={() => {
              toasts.dismiss()
              void onUndo()
            }}
          >
            Undo <Kbd>⌘Z</Kbd>
          </button>
        </div>
      )}
    </div>
  )
}
