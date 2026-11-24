export function EmptyState({
  title,
  children
}: {
  title: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
    </div>
  )
}
