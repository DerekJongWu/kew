import { describe, it, expect } from 'vitest'
import {
  initialNav,
  push,
  replace,
  back,
  forward,
  sameRoute,
  createRouter,
  type Route
} from '../../src/renderer/src/router'

const today: Route = { name: 'today' }
const people: Route = { name: 'list', type: 'person' }
const rec: Route = { name: 'record', id: 'A1' }

describe('router history', () => {
  it('starts on Today with nowhere to go', () => {
    const n = initialNav()
    expect(n.stack[n.index]).toEqual(today)
    expect(back(n)).toBe(n)
    expect(forward(n)).toBe(n)
  })

  it('pushes, goes back and forward', () => {
    let n = push(push(initialNav(), people), rec)
    expect(n.stack[n.index]).toEqual(rec)
    n = back(n)
    expect(n.stack[n.index]).toEqual(people)
    n = back(n)
    expect(n.stack[n.index]).toEqual(today)
    n = forward(forward(n))
    expect(n.stack[n.index]).toEqual(rec)
  })

  it('drops forward entries when pushing after going back', () => {
    let n = back(push(push(initialNav(), people), rec))
    n = push(n, { name: 'pipeline' })
    expect(n.stack).toEqual([today, people, { name: 'pipeline' }])
    expect(forward(n)).toBe(n)
  })

  it('ignores a push of the current route', () => {
    const n = push(initialNav(), people)
    expect(push(n, { name: 'list', type: 'person' })).toBe(n)
  })

  it('compares routes by value', () => {
    expect(sameRoute({ name: 'search', q: 'a' }, { name: 'search', q: 'a' })).toBe(true)
    expect(sameRoute({ name: 'search', q: 'a' }, { name: 'search', q: 'b' })).toBe(false)
    expect(sameRoute({ name: 'pipeline' }, { name: 'pipeline', viewId: 'x' })).toBe(false)
  })
})

describe('onboarding route', () => {
  it('is navigable and can be left with back', () => {
    const r = createRouter()
    r.navigate({ name: 'onboarding' })
    expect(r.current()).toEqual({ name: 'onboarding' })
    r.back()
    expect(r.current()).toEqual(today)
  })
})

describe('createRouter store', () => {
  it('notifies subscribers on navigate, back and forward', () => {
    const r = createRouter()
    const seen: Route[] = []
    const off = r.subscribe(() => seen.push(r.current()))
    r.navigate(people)
    r.back()
    r.forward()
    r.forward() // no-op, no notification
    off()
    r.navigate(rec)
    expect(seen).toEqual([people, today, people])
    expect(r.canBack()).toBe(true)
    expect(r.canForward()).toBe(false)
  })
})

describe('replace', () => {
  it('swaps the current entry so back skips the replaced ones', () => {
    const r = createRouter()
    r.navigate({ name: 'search', q: '' })
    r.replace({ name: 'search', q: 'or' })
    r.replace({ name: 'search', q: 'orchard' })
    expect(r.current()).toEqual({ name: 'search', q: 'orchard' })
    r.back()
    expect(r.current()).toEqual(today)
    r.forward()
    expect(r.current()).toEqual({ name: 'search', q: 'orchard' })
  })
  it('keeps forward entries and ignores an identical route', () => {
    const n = back(push(push(initialNav(), people), rec))
    const m = replace(n, { name: 'list', type: 'company' })
    expect(m.stack).toHaveLength(3)
    expect(m.stack[m.index]).toEqual({ name: 'list', type: 'company' })
    expect(replace(n, people)).toBe(n)
  })
})
