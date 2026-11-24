import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * A button that opens a small panel. Closes on Escape (focus returns to the button)
 * or a click outside. `children` gets a `close` function.
 */
export function Popover({
  label,
  buttonClass = 'btn btn-ghost',
  placement = 'below',
  panelLabel,
  children
}: {
  label: ReactNode
  buttonClass?: string
  placement?: 'below' | 'above'
  panelLabel: string
  children: (close: () => void) => ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const buttonId = useId()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    const panel = root.current?.querySelector<HTMLElement>('.popover')
    ;(panel?.querySelector<HTMLElement>('button, input, select') ?? panel)?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const close = (): void => {
    setOpen(false)
    document.getElementById(buttonId)?.focus()
  }

  return (
    <div
      className="popover-root"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          close()
        }
      }}
    >
      <button
        id={buttonId}
        type="button"
        className={buttonClass}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div
          className={`popover popover-${placement}`}
          role="dialog"
          aria-label={panelLabel}
          tabIndex={-1}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
