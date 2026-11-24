import { useId, type ReactNode } from 'react'

/** A titled list on a screen. `count` is shown beside the title; `due` marks it as needing action. */
export function Section({
  title,
  count,
  due = false,
  action,
  children
}: {
  title: string
  count?: number
  due?: boolean
  action?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const id = useId()
  return (
    <section className="section" aria-labelledby={id}>
      <header className="section-head">
        <h2 id={id} className="section-title">
          {title}
          {count !== undefined && (
            <span className={`section-count${due && count > 0 ? ' is-due' : ''}`}>
              <span className="visually-hidden">: </span>
              {count}
            </span>
          )}
        </h2>
        {action}
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}
