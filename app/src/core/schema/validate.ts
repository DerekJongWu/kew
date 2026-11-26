import type { FieldDef } from './types'
import type { FieldValue, RecordType, Schema } from '../../shared/api'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// Option rule: a select, stage or multi-select with an empty options list accepts any string.
// (`aliases` and `sources` rely on this for free-form values.)

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

export const isRealDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

const asString = (v: FieldValue): string => {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  throw new ValidationError(`expected a single value, got ${JSON.stringify(v)}`)
}

const checkOption = (field: FieldDef, s: string): string => {
  const options = field.options ?? []
  if (options.length > 0 && !options.some((o) => o.value === s)) {
    throw new ValidationError(`'${s}' is not an option`)
  }
  return s
}

const toLink = (v: string): string => {
  const s = v.trim()
  if (!s) throw new ValidationError('empty relation value')
  return /^\[\[.+\]\]$/.test(s) ? s : `[[${s}]]`
}

export function coerceValue(field: FieldDef, v: FieldValue): FieldValue {
  if (isEmpty(v)) return null
  switch (field.type) {
    case 'text':
    case 'url':
      return asString(v)
    case 'select':
    case 'stage':
      return checkOption(field, asString(v))
    case 'multi-select': {
      const list = Array.isArray(v) ? v : [v]
      return list.map((x) => checkOption(field, asString(x)))
    }
    case 'relation': {
      if (field.multiple) return (Array.isArray(v) ? v : [v]).map((x) => toLink(asString(x)))
      if (Array.isArray(v)) throw new ValidationError('expected a single value')
      return toLink(asString(v))
    }
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
      if (!Number.isFinite(n)) throw new ValidationError(`'${String(v)}' is not a number`)
      return n
    }
    case 'date': {
      const s = asString(v)
      if (!isRealDate(s)) throw new ValidationError(`'${s}' is not a valid date (YYYY-MM-DD)`)
      return s
    }
    case 'checkbox': {
      if (typeof v === 'boolean') return v
      if (v === 'true') return true
      if (v === 'false') return false
      throw new ValidationError(`'${String(v)}' is not true or false`)
    }
  }
}

export function validateFields(schema: Schema, type: RecordType, fm: Record<string, FieldValue>): string[] {
  const problems: string[] = []
  for (const field of schema.types[type].fields) {
    if (!(field.key in fm)) continue
    try {
      coerceValue(field, fm[field.key])
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e
      problems.push(`${field.key}: ${e.message}`)
    }
  }
  return problems
}
