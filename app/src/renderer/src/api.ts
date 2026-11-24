import { useCallback, useEffect, useState } from 'react'
import type { KewApi } from '../../shared/api'
import { wrapBridge } from './lib/bridge'

export const kew: KewApi = wrapBridge(window.kew)

/** Runs `fn` on mount and whenever `deps` change or the vault reports a change. */
export function useQuery<T>(
  fn: () => Promise<T>,
  deps: unknown[]
): { data: T | undefined; error: Error | null; reload(): void } {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => kew.onChanged(reload), [reload])
  useEffect(() => {
    let live = true
    fn().then(
      (d) => live && (setData(d), setError(null)),
      (e: Error) => live && setError(e)
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, error, reload }
}
