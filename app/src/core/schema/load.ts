import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { DEFAULT_SCHEMA } from './defaults'
import type { Schema } from './types'
import type { RecordType } from '../../shared/api'

const RECORD_TYPES: RecordType[] = ['company', 'person', 'meeting', 'theme', 'research']
const CATEGORIES = ['new', 'in-progress', 'active', 'closed'] as const

const optionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(CATEGORIES).optional(),
  renamedFrom: z.string().optional()
})

const fieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/, 'must be snake_case'),
    label: z.string().min(1),
    type: z.enum(['text', 'number', 'date', 'select', 'multi-select', 'stage', 'relation', 'url', 'checkbox']),
    tier: z.enum(['system', 'starter', 'custom']),
    options: z.array(optionSchema).optional(),
    target: z.enum(['company', 'person', 'meeting', 'theme', 'research', 'any']).optional(),
    multiple: z.boolean().optional()
  })
  .superRefine((fld, ctx) => {
    if (fld.type === 'relation' && !fld.target) {
      ctx.addIssue({ code: 'custom', message: `relation field '${fld.key}' needs a target` })
    }
    if (fld.type === 'stage' && (fld.options ?? []).some((o) => !o.category)) {
      ctx.addIssue({ code: 'custom', message: `stage field '${fld.key}' needs a category on every option` })
    }
    const values = (fld.options ?? []).map((o) => o.value)
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: 'custom', message: `field '${fld.key}' has duplicate option values` })
    }
  })

const typeSchema = z
  .object({ folder: z.string().min(1), template: z.string().min(1), fields: z.array(fieldSchema) })
  .superRefine((t, ctx) => {
    const keys = t.fields.map((x) => x.key)
    const dup = keys.find((k, i) => keys.indexOf(k) !== i)
    if (dup) ctx.addIssue({ code: 'custom', message: `duplicate field key '${dup}'` })
  })

const schemaSchema = z.object({
  version: z.number().int().positive(),
  types: z.object(
    Object.fromEntries(RECORD_TYPES.map((t) => [t, typeSchema])) as Record<RecordType, typeof typeSchema>
  )
})

const formatIssues = (e: z.ZodError): string =>
  e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')

export function serializeSchema(s: Schema): string {
  return stringify(s)
}

export function loadSchema(text: string, lastValid: Schema | null): { schema: Schema; error: string | null } {
  const fallback = lastValid ?? DEFAULT_SCHEMA
  const fail = (msg: string) => ({ schema: fallback, error: msg })
  let raw: unknown
  try {
    raw = parse(text)
  } catch (e) {
    return fail(`schema.yaml is not valid YAML: ${(e as Error).message}`)
  }
  const result = schemaSchema.safeParse(raw)
  if (!result.success) return fail(`schema.yaml is invalid: ${formatIssues(result.error)}`)
  const schema = result.data as Schema
  const missing: string[] = []
  for (const t of RECORD_TYPES) {
    const have = new Set(schema.types[t].fields.map((x) => x.key))
    for (const fld of DEFAULT_SCHEMA.types[t].fields) {
      if (fld.tier === 'system' && !have.has(fld.key)) missing.push(`${t}.${fld.key}`)
    }
  }
  if (missing.length) return fail(`schema.yaml is missing system fields: ${missing.join(', ')}`)
  return { schema, error: null }
}
