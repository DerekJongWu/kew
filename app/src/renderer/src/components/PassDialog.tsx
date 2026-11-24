import { PassForm } from './RowActions'

/** Modal that asks why you're passing on a company (Pipeline drops and the record page use it). */
export function PassDialog({
  name,
  onSubmit,
  onCancel
}: {
  name: string
  onSubmit(reason: string): void
  onCancel(): void
}): React.JSX.Element {
  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`Pass on ${name}`}>
        <p className="dialog-title">Pass on {name}</p>
        <PassForm onSubmit={onSubmit} onCancel={onCancel} />
      </div>
    </div>
  )
}
