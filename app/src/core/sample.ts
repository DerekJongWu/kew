// The sample vault: fictional companies, people, meetings, themes and research,
// dated relative to `today` so every Today section has something in it.
// Writes directly (before any Vault exists); see the note in setup.ts.
import { createOnly, setupVault } from './setup'
import { newNote } from './note'
import { newId } from './ids'
import { meetingName } from './names'
import { DEFAULT_SCHEMA } from './schema/defaults'
import type { FieldValue, RecordType } from '../shared/api'

const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const link = (name: string): string => `[[${name}]]`

interface Company {
  name: string; status: string; seen: number; source: string; stage: string; theme?: string
  what: string; team?: string; why?: string; risks?: string; notes?: string
  extra?: Record<string, FieldValue>; reachOut?: number
}

const COMPANIES: Company[] = [
  { name: 'Fernwick Robotics', status: 'new', seen: -1, source: 'inbound-form', stage: 'seed', theme: 'Supply Chain Data',
    what: 'Retrofit kits that let older warehouse forklifts drive themselves on fixed routes.',
    extra: { round_status: 'raising', raise: '$3M' } },
  { name: 'Saltmarsh Health', status: 'new', seen: 0, source: 'intro', stage: 'pre-seed', theme: 'Clinical Back Office',
    what: 'Fills prior-authorization paperwork for small specialty clinics straight from the chart.',
    extra: { referred_by: link('Lena Hartmann') } },
  { name: 'Tallowby Energy', status: 'new', seen: -2, source: 'event', stage: 'seed', theme: 'Grid Edge Software',
    what: 'Shifts commercial building HVAC load away from grid peaks without tenants noticing.' },
  { name: 'Quillfeather Labs', status: 'pursuing', seen: -9, source: 'linkedin', stage: 'seed', theme: 'Clinical Back Office',
    what: 'Coding audit tool that flags under-billed visits for rural hospitals.', reachOut: 0,
    extra: { conviction: 'medium' } },
  { name: 'Marrowgate Energy', status: 'pursuing', seen: -14, source: 'email', stage: 'series-a', theme: 'Grid Edge Software',
    what: 'Virtual power plant software for municipal utilities.', reachOut: -3,
    extra: { conviction: 'high', round_status: 'tracking' } },
  { name: 'Lanternfish Data', status: 'reached-out', seen: -20, source: 'linkedin', stage: 'seed', theme: 'Supply Chain Data',
    what: 'Live customs and port-delay data for mid-size importers.', team: '[[Mara Quintero]], CEO. Ran a customs brokerage for eight years.' },
  { name: 'Bramblewick Health', status: 'reached-out', seen: -25, source: 'intro', stage: 'series-a', theme: 'Clinical Back Office',
    what: 'Staffing marketplace for per-diem nurses, priced by shift.', team: '[[Jonah Pell]], CEO.',
    extra: { round_status: 'raising', raise: '$12M' } },
  { name: 'Driftwood Ledger', status: 'reached-out', seen: -12, source: 'event', stage: 'pre-seed', theme: 'Supply Chain Data',
    what: 'Freight invoice reconciliation for small shippers.', team: '[[Rosalind Varga]], co-founder.' },
  { name: 'Nettlebrook Systems', status: 'no-reply', seen: -35, source: 'linkedin', stage: 'seed', theme: 'Grid Edge Software',
    what: 'Fault detection for rooftop solar inverters, sold through installers.', team: '[[Felix Amundsen]], CEO.' },
  { name: 'Orchard Signal', status: 'active', seen: -50, source: 'intro', stage: 'seed', theme: 'Supply Chain Data',
    what: 'Demand forecasting for regional grocery distributors.', team: '[[Callum Reyes]], CEO. Former buyer at a regional grocer.',
    why: 'Distributors still forecast in spreadsheets; three paying pilots after one quarter.',
    risks: 'Long sales cycles; the top customer is 40% of revenue.',
    extra: { conviction: 'high', round_status: 'raising', raise: '$5M', valuation: '$22M post', deal_sheet: 'yes' } },
  { name: 'Pinemoth Analytics', status: 'active', seen: -30, source: 'inbound-form', stage: 'series-a', theme: 'Clinical Back Office',
    what: 'Denial-management analytics for hospital billing teams.', team: '[[Ada Brennan]], CTO.',
    why: 'Billing teams can see which denials are worth appealing before they work them.',
    risks: 'Depends on access to each hospital\'s claims system.',
    extra: { conviction: 'medium', round_status: 'raising', raise: '$15M' } },
  { name: 'Gravelly Freight', status: 'passed', seen: -60, source: 'email', stage: 'seed', theme: 'Supply Chain Data',
    what: 'Load-matching app for owner-operator truckers.', team: '[[Hana Whitlock]], founder.',
    extra: { pass_reason: 'Too early for the round size; revisit after a first fleet contract.' } },
  { name: 'Kettleworth Foods', status: 'revisit', seen: -95, source: 'inbound-form', stage: 'seed',
    what: 'Shelf-stable meal kits for corporate cafeterias.', team: '[[Sofia Marchetti]], CEO.',
    notes: 'Check back once they have two quarters of repeat orders.' },
  { name: 'Ashgrove Mobility', status: 'archived', seen: -120, source: 'event', stage: 'pre-seed', theme: 'Grid Edge Software',
    what: 'Charging scheduler for school bus depots.', team: '[[Tomas Ruel]], CEO.' }
]

type Log = [days: number, dir: 'out' | 'in' | 'note', channel: string, text: string]
interface Person {
  name: string; company?: string; role: string; category: string; channel: string
  met: boolean; cadence?: number; log: Log[]; notes: string
}

const PEOPLE: Person[] = [
  { name: 'Mara Quintero', company: 'Lanternfish Data', role: 'CEO', category: 'founder', channel: 'linkedin', met: false, cadence: 7,
    log: [[-10, 'out', 'linkedin', 'Intro note after seeing their port-delay demo']], notes: 'Former customs broker.' },
  { name: 'Jonah Pell', company: 'Bramblewick Health', role: 'CEO', category: 'founder', channel: 'email', met: false, cadence: 7,
    log: [[-8, 'out', 'email', 'Asked how they recruit the nurse supply side'], [-1, 'in', 'email', 'Shared the deck and asked for a call next week']],
    notes: 'Warm intro through a former portfolio founder.' },
  { name: 'Rosalind Varga', company: 'Driftwood Ledger', role: 'Co-founder', category: 'founder', channel: 'email', met: false, cadence: 7,
    log: [[-4, 'out', 'email', 'Followed up from the logistics meetup']], notes: 'Met briefly at a logistics meetup.' },
  { name: 'Felix Amundsen', company: 'Nettlebrook Systems', role: 'CEO', category: 'founder', channel: 'linkedin', met: false, cadence: 14,
    log: [[-30, 'out', 'linkedin', 'Intro note'], [-16, 'out', 'linkedin', 'Asked about installer margins']], notes: 'Hardware background.' },
  { name: 'Hana Whitlock', company: 'Gravelly Freight', role: 'Founder', category: 'founder', channel: 'email', met: false, cadence: 14,
    log: [[-62, 'out', 'email', 'Asked for the round details'], [-60, 'in', 'email', 'Sent the deck'], [-58, 'out', 'email', 'Passed for now and explained why']],
    notes: 'Open to hearing from her again after a fleet contract.' },
  { name: 'Callum Reyes', company: 'Orchard Signal', role: 'CEO', category: 'founder', channel: 'email', met: true, cadence: 30,
    log: [[-40, 'out', 'email', 'Asked for a first meeting'], [-38, 'in', 'email', 'Booked an intro call'], [-33, 'out', 'email', 'Sent follow-up questions after the intro']],
    notes: 'Sharp on unit economics.' },
  { name: 'Ada Brennan', company: 'Pinemoth Analytics', role: 'CTO', category: 'founder', channel: 'email', met: true, cadence: 21,
    log: [[-20, 'out', 'email', 'Asked for an intro call'], [-2, 'in', 'email', 'Sent the updated deck after diligence']],
    notes: 'Built the claims pipeline herself.' },
  { name: 'Sofia Marchetti', company: 'Kettleworth Foods', role: 'CEO', category: 'founder', channel: 'email', met: true, cadence: 90,
    log: [[-92, 'in', 'email', 'Inbound pitch through the website form'], [-88, 'out', 'email', 'Set up an intro call']],
    notes: 'Check in each quarter.' },
  { name: 'Nadia Ferreira', role: 'Partner', category: 'vc', channel: 'email', met: true, cadence: 30,
    log: [[-31, 'note', 'in-person', 'Caught up at a climate investor dinner; she is leading grid deals']],
    notes: 'Possible co-investor on grid software.' },
  { name: 'Lena Hartmann', role: 'Former VP Operations', category: 'operator', channel: 'email', met: true,
    log: [[-1, 'in', 'email', 'Introduced the Saltmarsh Health founders']], notes: 'Great source of clinical operations intros.' },
  { name: 'Tomas Ruel', company: 'Ashgrove Mobility', role: 'CEO', category: 'founder', channel: 'email', met: true,
    log: [[-125, 'in', 'email', 'Asked for an intro call'], [-124, 'out', 'email', 'Booked a call']], notes: 'Company wound down.' }
]

interface Meeting { days: number; company: string; type: string; attendees: string[]; summary: string; actions: string }
const MEETINGS: Meeting[] = [
  { days: -35, company: 'Orchard Signal', type: 'intro', attendees: ['Callum Reyes'],
    summary: 'Walked through the forecasting product and the three distributor pilots.', actions: 'Send follow-up questions on churn.' },
  { days: -12, company: 'Pinemoth Analytics', type: 'intro', attendees: ['Ada Brennan'],
    summary: 'Demo of the denial dashboard; strong technical depth.', actions: 'Set up a diligence call.' },
  { days: -6, company: 'Pinemoth Analytics', type: 'diligence', attendees: ['Ada Brennan'],
    summary: 'Reviewed claims data access and the hospital rollout plan.', actions: 'Wait for the updated deck.' },
  { days: -85, company: 'Kettleworth Foods', type: 'intro', attendees: ['Sofia Marchetti'],
    summary: 'Early revenue from two cafeteria operators.', actions: 'Revisit after two quarters of repeat orders.' }
]

const THEMES: { name: string; slug: string; living: boolean; landscape: string; thesis: string; signal: string }[] = [
  { name: 'Grid Edge Software', slug: 'grid-edge-software', living: true,
    landscape: '[[Marrowgate Energy]], [[Tallowby Energy]], [[Nettlebrook Systems]].',
    thesis: 'Utilities need software to manage load they no longer control.', signal: 'Two municipal utilities issued flexible-load RFPs this quarter.' },
  { name: 'Clinical Back Office', slug: 'clinical-back-office', living: true,
    landscape: '[[Pinemoth Analytics]], [[Quillfeather Labs]], [[Bramblewick Health]], [[Saltmarsh Health]].',
    thesis: 'Billing and paperwork are where small providers lose the most time.', signal: 'Prior-authorization rules tightened again this year.' },
  { name: 'Supply Chain Data', slug: 'supply-chain-data', living: false,
    landscape: '[[Orchard Signal]], [[Lanternfish Data]], [[Driftwood Ledger]], [[Fernwick Robotics]].',
    thesis: 'Mid-size shippers buy data they can act on the same day.', signal: 'Port delays are back in customer calls.' }
]

const RESEARCH: { name: string; about: string[]; topic: string; days: number; kind: string; sources: string[]; notes: string }[] = [
  { name: 'Pinemoth Analytics reference calls', about: ['Pinemoth Analytics'], topic: 'references', days: -4, kind: 'note',
    sources: ['Call with a billing director', 'Call with a former colleague of the CTO'],
    notes: 'Both references said the product paid for itself within two quarters.' },
  { name: 'Grid Edge market map', about: ['Grid Edge Software', 'Marrowgate Energy', 'Nettlebrook Systems'], topic: 'market', days: -10, kind: 'screen',
    sources: ['Utility RFP filings', 'Conference notes'],
    notes: 'Most companies sell to utilities; few sell to building owners.' }
]

const sections = (pairs: [string, string | undefined][]): string =>
  '\n' + pairs.map(([h, t]) => (t ? `## ${h}\n\n${t}\n` : `## ${h}\n`)).join('\n')

export async function generateSample(root: string, today: string): Promise<void> {
  await setupVault(root)
  const on = (n: number): string => addDays(today, n)
  const files: [RecordType, string, Record<string, FieldValue>, string][] = []
  const add = (type: RecordType, name: string, fields: Record<string, FieldValue>, body: string): void => {
    files.push([type, name, { id: newId(), type, name, ...fields }, body])
  }

  for (const c of COMPANIES) {
    const domain = c.name.toLowerCase().replace(/[^a-z]+/g, '') + '.example'
    add('company', c.name, {
      website: domain, pipeline_status: c.status, source: c.source, stage: c.stage,
      ...(c.theme ? { themes: [link(c.theme)] } : {}),
      first_seen: on(c.seen),
      ...(c.reachOut !== undefined ? { reach_out_on: on(c.reachOut) } : {}),
      ...c.extra
    }, sections([['What it is', c.what], ['Team', c.team], ['Why it could work', c.why], ['Risks', c.risks], ['Notes', c.notes]]))
  }
  for (const p of PEOPLE) {
    const slug = p.name.toLowerCase().replace(/ /g, '-')
    const log = p.log.map(([d, dir, ch, text]) => `- ${on(d)}, ${dir} · ${ch}: ${text}`).join('\n')
    add('person', p.name, {
      met: p.met,
      ...(p.company ? { company: link(p.company) } : {}),
      linkedin: `https://linkedin.example/in/${slug}`,
      email: `${slug.split('-')[0]}@${(p.company ?? 'mail').toLowerCase().replace(/[^a-z]+/g, '')}.example`,
      role: p.role, category: p.category, channel: p.channel,
      ...(p.cadence ? { cadence_days: p.cadence } : {})
    }, sections([['Outreach log', log], ['Notes', p.notes]]))
  }
  for (const m of MEETINGS) {
    const name = meetingName(on(m.days), m.company, m.type)
    add('meeting', name, {
      date: on(m.days), company: link(m.company), attendees: m.attendees.map(link), meeting_type: m.type
    }, sections([['Summary', m.summary], ['Notes', undefined], ['Action items', `- ${m.actions}`]]))
  }
  for (const t of THEMES) {
    add('theme', t.name, { slug: t.slug, living_topic: t.living },
      sections([['Landscape', t.landscape], ['Thesis', t.thesis], ['Signal log', `- ${on(-7)}: ${t.signal}`]]))
  }
  for (const r of RESEARCH) {
    add('research', r.name, {
      about: r.about.map(link), topic: r.topic, created: on(r.days), kind: r.kind, sources: r.sources
    }, sections([['Notes', r.notes], ['Sources', r.sources.map((s) => `- ${s}`).join('\n')]]))
  }

  for (const [type, name, fm, body] of files) {
    const rel = `${DEFAULT_SCHEMA.types[type].folder}/${name}.md`
    if (!(await createOnly(root, rel, newNote(fm, body)))) throw new Error(`${rel} already exists.`)
  }
  await createOnly(root, '.kew/sample', 'This vault was generated by Kew as a sample. Its data is fictional.\n')
}
