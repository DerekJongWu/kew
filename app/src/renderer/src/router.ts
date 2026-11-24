// In-memory navigation: a stack of routes with a cursor, like a browser's back/forward.
import { useSyncExternalStore } from 'react'
import type { RecordType } from '../../shared/api'

export type Route =
  | { name: 'today' }
  | { name: 'pipeline'; viewId?: string }
  | { name: 'list'; type: RecordType }
  | { name: 'record'; id: string }
  | { name: 'search'; q: string }
  | { name: 'settings'; tab: 'fields' | 'vault' }

export interface Nav {
  stack: Route[]
  index: number
}

export const initialNav = (): Nav => ({ stack: [{ name: 'today' }], index: 0 })

export function sameRoute(a: Route, b: Route): boolean {
  const ka = Object.keys(a) as (keyof Route)[]
  return (
    ka.length === Object.keys(b).length &&
    ka.every((k) => a[k] === (b as Record<string, unknown>)[k])
  )
}

export function push(n: Nav, r: Route): Nav {
  if (sameRoute(n.stack[n.index], r)) return n
  return { stack: [...n.stack.slice(0, n.index + 1), r], index: n.index + 1 }
}

export const back = (n: Nav): Nav => (n.index > 0 ? { ...n, index: n.index - 1 } : n)
export const forward = (n: Nav): Nav =>
  n.index < n.stack.length - 1 ? { ...n, index: n.index + 1 } : n

export interface Router {
  current(): Route
  navigate(r: Route): void
  back(): void
  forward(): void
  canBack(): boolean
  canForward(): boolean
  subscribe(fn: () => void): () => void
}

export function createRouter(): Router {
  let nav = initialNav()
  const subs = new Set<() => void>()
  const set = (next: Nav): void => {
    if (next === nav) return
    nav = next
    subs.forEach((fn) => fn())
  }
  return {
    current: () => nav.stack[nav.index],
    navigate: (r) => set(push(nav, r)),
    back: () => set(back(nav)),
    forward: () => set(forward(nav)),
    canBack: () => nav.index > 0,
    canForward: () => nav.index < nav.stack.length - 1,
    subscribe: (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    }
  }
}

export const router = createRouter()

export function useRoute(): [Route, (r: Route) => void] {
  const route = useSyncExternalStore(router.subscribe, router.current)
  return [route, router.navigate]
}
