// Workflow commands: outreach logging and pipeline moves. Each is exactly one
// applyAction call, so it is one undoable history entry (even across two files).
import { applyAction, type Ctx, type FileEdit } from './apply'
import { coerceAll, record } from './records'
import { appendToSection, parseNote, setKeys } from '../note'
import { formatLogLine, parseLog } from '../outreach'
import { unlink } from '../links'
import { isRealDate, ValidationError } from '../schema/validate'
import type { ActionResult, OutreachEvent, RecordSummary } from '../../shared/api'

const CHANNEL = /^[\w-]+$/

type NewEvent = Omit<OutreachEvent, 'personId' | 'date'> & { date?: string }

function person(ctx: Ctx, id: string): RecordSummary {
  const rec = record(ctx, id)
  if (rec.type !== 'person') throw new ValidationError(`${rec.name} is not a person.`)
  return rec
}

function companyOf(ctx: Ctx, p: RecordSummary): RecordSummary | null {
  const v = p.fields.company
  if (typeof v !== 'string' || v.trim() === '') return null
  const c = ctx.index.resolveName(unlink(v))
  return c?.type === 'company' ? c : null
}

function categoryOf(ctx: Ctx, status: unknown): string | undefined {
  const f = ctx.schema().types.company.fields.find((x) => x.key === 'pipeline_status')
  return f?.options?.find((o) => o.value === status)?.category
}

function current(rec: RecordSummary, text: string | null): string {
  if (text === null) throw new Error(`${rec.path} no longer exists.`)
  return text
}

const companyStatusEdit = (c: RecordSummary, status: string): FileEdit => ({
  path: c.path,
  apply: (text) => setKeys(current(c, text), { pipeline_status: status })
})

export async function logOutreach(ctx: Ctx, personId: string, e: NewEvent): Promise<ActionResult> {
  const p = person(ctx, personId)
  const date = e.date ?? ctx.today()
  if (!isRealDate(date)) throw new ValidationError(`'${date}' is not a valid date (YYYY-MM-DD).`)
  if (!CHANNEL.test(e.channel)) {
    throw new ValidationError('A channel can only use letters, numbers, underscores and hyphens.')
  }
  const line = formatLogLine({
    date,
    dir: e.dir,
    channel: e.channel,
    text: e.text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
  })

  const company = e.dir === 'out' ? companyOf(ctx, p) : null
  // The person's edit runs first (edits plan in order), so the company edit can see its verdict.
  let firstOut = false
  const edits: FileEdit[] = [
    {
      path: p.path,
      apply: (text) => {
        const t = current(p, text)
        firstOut = e.dir === 'out' && !parseLog(t, p.id).some((x) => x.dir === 'out')
        return setKeys(appendToSection(t, '## Outreach log', line, { before: '## Notes' }), {
          next_follow_up: undefined
        })
      }
    }
  ]
  if (company) {
    edits.push({
      path: company.path,
      apply: (text) => {
        const t = current(company, text)
        const status = parseNote(t).fm.pipeline_status
        return firstOut && (status === 'new' || status === 'pursuing')
          ? setKeys(t, { pipeline_status: 'reached-out' })
          : t
      }
    })
  }
  const message =
    e.dir === 'out'
      ? `Logged a send to ${p.name}`
      : e.dir === 'in'
        ? `Logged a reply from ${p.name}`
        : `Added a note on ${p.name}`
  return applyAction(ctx, message, edits)
}

export async function weMet(ctx: Ctx, personId: string): Promise<ActionResult> {
  const p = person(ctx, personId)
  const edits: FileEdit[] = [
    { path: p.path, apply: (text) => setKeys(current(p, text), { met: true }) }
  ]
  const c = companyOf(ctx, p)
  const cat = c ? categoryOf(ctx, c.fields.pipeline_status) : undefined
  if (c && (cat === 'new' || cat === 'in-progress')) edits.push(companyStatusEdit(c, 'active'))
  return applyAction(ctx, `Met ${p.name}`, edits)
}

export async function passCompany(ctx: Ctx, id: string, reason: string): Promise<ActionResult> {
  const rec = record(ctx, id)
  if (rec.type !== 'company') throw new ValidationError(`${rec.name} is not a company.`)
  const why = reason.trim()
  if (!why) throw new ValidationError('A reason is required to pass.')
  const changes = coerceAll(ctx, 'company', { pipeline_status: 'passed', pass_reason: why })
  return applyAction(ctx, `Passed on ${rec.name}`, [
    {
      path: rec.path,
      apply: (text) =>
        setKeys(current(rec, text), {
          pipeline_status: changes.pipeline_status ?? undefined,
          pass_reason: changes.pass_reason ?? undefined
        })
    }
  ])
}

export async function snooze(ctx: Ctx, id: string, until: string): Promise<ActionResult> {
  const rec = record(ctx, id)
  const key =
    rec.type === 'person' ? 'next_follow_up' : rec.type === 'company' ? 'reach_out_on' : null
  if (!key) throw new ValidationError(`${rec.name} can't be snoozed.`)
  if (!isRealDate(until)) throw new ValidationError(`'${until}' is not a valid date (YYYY-MM-DD).`)
  return applyAction(ctx, `Snoozed ${rec.name} until ${until}`, [
    { path: rec.path, apply: (text) => setKeys(current(rec, text), { [key]: until }) }
  ])
}
