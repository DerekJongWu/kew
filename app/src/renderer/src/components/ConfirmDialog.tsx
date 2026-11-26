import { useEffect, useId, useRef } from 'react'
import { Button } from './Button'

/** A modal yes/no. Focus starts on Cancel; Escape cancels; Tab stays inside. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel
}: {
  title: string
  children: React.ReactNode
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onConfirm(): void
  onCancel(): void
}): React.JSX.Element {
  const uid = useId()
  const box = useRef<HTMLDivElement>(null)
  const restore = useRef(document.activeElement)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus()
    const back = restore.current
    return () => {
      if (back instanceof HTMLElement) back.focus()
    }
  }, [restore])
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    } else if (e.key === 'Tab') {
      const items = [
        ...(box.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])
      ]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }
  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-t`}
        ref={box}
        onKeyDown={onKeyDown}
      >
        <p className="dialog-title" id={`${uid}-t`}>
          {title}
        </p>
        <p className="form-hint confirm-text">{children}</p>
        {error && (
          <p className="row-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
