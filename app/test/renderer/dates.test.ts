import { describe, it, expect } from 'vitest'
import { addDays, friendlyDate, isoDate, timeAgo } from '../../src/renderer/src/lib/dates'

const T = '2026-11-24' // a Tuesday

describe('friendlyDate', () => {
  it('names nearby days', () => {
    expect(friendlyDate(T, T)).toBe('today')
    expect(friendlyDate('2026-11-23', T)).toBe('yesterday')
    expect(friendlyDate('2026-11-25', T)).toBe('tomorrow')
  })
  it('counts days within two weeks', () => {
    expect(friendlyDate('2026-11-21', T)).toBe('3 days ago')
    expect(friendlyDate('2026-11-14', T)).toBe('10 days ago')
    expect(friendlyDate('2026-11-28', T)).toBe('in 4 days')
  })
  it('falls back to a short weekday date, with the year only when it differs', () => {
    expect(friendlyDate('2026-11-01', T)).toBe('Sun 1 Nov')
    expect(friendlyDate('2026-12-24', T)).toBe('Thu 24 Dec')
    expect(friendlyDate('2025-08-20', T)).toBe('20 Aug 2025')
  })
})

describe('date helpers', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('formats a local date', () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
  it('describes elapsed time for history entries', () => {
    const now = new Date('2026-11-24T12:00:00Z')
    expect(timeAgo('2026-11-24T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-11-24T11:45:00Z', now)).toBe('15 min ago')
    expect(timeAgo('2026-11-24T09:00:00Z', now)).toBe('3 h ago')
    expect(timeAgo('2026-11-20T09:00:00Z', now)).toBe('4 days ago')
  })
})
