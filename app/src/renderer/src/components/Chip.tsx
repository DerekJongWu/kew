import type { ReactNode } from 'react'

/** A small label for a field value (source, stage). Carries text, never colour alone. */
export function Chip({
  children,
  tone = 'neutral'
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent'
}): React.JSX.Element {
  return <span className={`chip chip-${tone}`}>{children}</span>
}

/** A keyboard shortcut hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return <kbd className="kbd">{children}</kbd>
}
