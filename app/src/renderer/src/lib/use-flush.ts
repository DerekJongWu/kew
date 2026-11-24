import { useEffect, useRef } from 'react'
import { flushes } from './flush'

/**
 * Saves a pending edit when the component goes away (navigation, ⌘[ / ⌘]) and when main asks
 * for a flush (window close, quit). `save` must be a no-op when nothing is pending.
 */
export function useFlushOnLeave(save: () => void | Promise<void>): void {
  const latest = useRef(save)
  useEffect(() => {
    latest.current = save
  })
  useEffect(() => {
    const off = flushes.register(() => latest.current())
    return () => {
      off()
      void latest.current()
    }
  }, [])
}
