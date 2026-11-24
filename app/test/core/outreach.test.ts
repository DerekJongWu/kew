import { describe, it, expect } from 'vitest'
import { parseLog, logProblems, formatLogLine, computeOutreach } from '../../src/core/outreach'
import type { OutreachEvent } from '../../src/shared/api'

const ev = (date: string, dir: OutreachEvent['dir'], channel = 'email'): OutreachEvent => ({ personId: 'p', date, dir, channel, text: 't' })
const base = { met: false, cadenceDays: 14 as number | null, nextFollowUp: null as string | null, companyClosed: false, lastMeeting: null as string | null }
const TODAY = '2026-11-24'

describe('parseLog', () => {
  const note = [
    '---', 'type: person', '---', '', '## Outreach log',
    '- 2026-11-21, out · linkedin: Intro note, Sam suggested',
    'garbage',
    '- 2026-11-24, in · email: Shared round details',
    '- 2026-11-25 out email: nope',
    '',
    '## Other',
    '- 2020-01-01, out · email: ignored',
  ].join('\n')

  it('parses well-formed lines and skips malformed ones', () => {
    expect(parseLog(note, 'p1')).toEqual([
      { personId: 'p1', date: '2026-11-21', dir: 'out', channel: 'linkedin', text: 'Intro note, Sam suggested' },
      { personId: 'p1', date: '2026-11-24', dir: 'in', channel: 'email', text: 'Shared round details' },
    ])
  })
  it('reports one problem per malformed line', () => {
    expect(logProblems(note)).toHaveLength(1)
    expect(logProblems(note)[0]).toContain('2026-11-25 out email: nope')
  })
  it('round-trips formatLogLine', () => {
    const e = { date: '2026-11-21', dir: 'note' as const, channel: 'call', text: 'Talked: briefly' }
    const line = formatLogLine(e)
    expect(line.startsWith('- ')).toBe(true)
    expect(parseLog(`## Outreach log\n${line}\n`, 'x')).toEqual([{ personId: 'x', ...e }])
  })
})

describe('computeOutreach', () => {
  it('rule 1: closed company and not met is none', () => {
    const s = computeOutreach({ ...base, companyClosed: true }, [ev('2026-11-01', 'in')], TODAY)
    expect(s).toMatchObject({ state: 'none', dueDate: null, reason: '' })
  })
  it('rule 1 does not apply when met', () => {
    expect(computeOutreach({ ...base, companyClosed: true, met: true }, [ev(TODAY, 'in')], TODAY).state).toBe('reply-owed')
  })
  it('rule 2: latest in is reply-owed', () => {
    const s = computeOutreach(base, [ev('2026-11-20', 'out'), ev(TODAY, 'in')], TODAY)
    expect(s).toEqual({ state: 'reply-owed', dueDate: TODAY, lastOutbound: '2026-11-20', lastInbound: TODAY, reason: 'They replied by email today' })
  })
  it('rule 2: snoozed reply uses nextFollowUp as dueDate', () => {
    const s = computeOutreach({ ...base, nextFollowUp: '2026-12-01' }, [ev('2026-11-23', 'in', 'linkedin')], TODAY)
    expect(s.dueDate).toBe('2026-12-01')
    expect(s.reason).toBe('They replied by LinkedIn yesterday')
  })
  it('rule 3: out past cadence is follow-up-due', () => {
    const s = computeOutreach(base, [ev('2026-11-10', 'out', 'linkedin')], TODAY)
    expect(s).toMatchObject({ state: 'follow-up-due', dueDate: '2026-11-24', reason: 'You messaged on LinkedIn 14 days ago, no reply' })
  })
  it('rule 3: out within cadence is waiting', () => {
    const s = computeOutreach(base, [ev('2026-11-20', 'out', 'sms')], TODAY)
    expect(s).toMatchObject({ state: 'waiting', dueDate: '2026-12-04', reason: 'You messaged on sms 4 days ago, no reply' })
  })
  it('rule 3: crosses month and year boundaries', () => {
    const s = computeOutreach({ ...base, cadenceDays: 10 }, [ev('2026-12-28', 'out')], '2027-01-02')
    expect(s.dueDate).toBe('2027-01-07')
  })
  it('nextFollowUp earlier than computed wins', () => {
    const s = computeOutreach({ ...base, nextFollowUp: '2026-11-22' }, [ev('2026-11-20', 'out')], TODAY)
    expect(s).toMatchObject({ state: 'follow-up-due', dueDate: '2026-11-22' })
  })
  it('same-day out then in is reply-owed', () => {
    expect(computeOutreach(base, [ev(TODAY, 'out'), ev(TODAY, 'in')], TODAY).state).toBe('reply-owed')
  })
  it('same-day in then out is waiting by cadence', () => {
    const s = computeOutreach(base, [ev(TODAY, 'in'), ev(TODAY, 'out')], TODAY)
    expect(s).toMatchObject({ state: 'waiting', dueDate: '2026-12-08' })
  })
  it('latest out without cadence is none', () => {
    expect(computeOutreach({ ...base, cadenceDays: null }, [ev('2026-01-01', 'out')], TODAY).state).toBe('none')
  })
  it('rule 4: met with last meeting', () => {
    const s = computeOutreach({ ...base, met: true, cadenceDays: 30, lastMeeting: '2026-10-25' }, [], TODAY)
    expect(s).toMatchObject({ state: 'follow-up-due', dueDate: '2026-11-24', reason: 'Met 30 days ago, cadence 30 days' })
  })
  it('rule 4: later note makes it the last touch', () => {
    const s = computeOutreach({ ...base, met: true, cadenceDays: 30, lastMeeting: '2026-10-01' }, [ev('2026-11-14', 'note', 'call')], TODAY)
    expect(s).toMatchObject({ state: 'waiting', dueDate: '2026-12-14', reason: 'Last touch 10 days ago, cadence 30 days' })
  })
  it('rule 4: no touches is none', () => {
    expect(computeOutreach({ ...base, met: true, cadenceDays: 30 }, [], TODAY).state).toBe('none')
  })
  it('rule 5: unmet, no events is none', () => {
    expect(computeOutreach(base, [], TODAY).state).toBe('none')
  })
})
