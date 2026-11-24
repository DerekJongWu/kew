import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEMA } from '../../src/core/schema/defaults'
import { loadSchema, serializeSchema } from '../../src/core/schema/load'
import { ValidationError, coerceValue, validateFields } from '../../src/core/schema/validate'
import type { FieldDef } from '../../src/core/schema/types'

const field = (type: string, key: string) =>
  DEFAULT_SCHEMA.types[type as 'company'].fields.find((f) => f.key === key) as FieldDef

describe('schema load', () => {
  it('round-trips the default schema unchanged', () => {
    const { schema, error } = loadSchema(serializeSchema(DEFAULT_SCHEMA), null)
    expect(error).toBeNull()
    expect(schema).toEqual(DEFAULT_SCHEMA)
  })
  it('falls back to lastValid on broken YAML', () => {
    const last = structuredClone(DEFAULT_SCHEMA)
    const r = loadSchema('version: [unclosed', last)
    expect(r.error).toBeTruthy()
    expect(r.schema).toBe(last)
    expect(loadSchema('::: nope', null).schema).toBe(DEFAULT_SCHEMA)
  })
  it('reports a deleted system field', () => {
    const s = structuredClone(DEFAULT_SCHEMA)
    s.types.company.fields = s.types.company.fields.filter((f) => f.key !== 'pipeline_status')
    const r = loadSchema(serializeSchema(s), null)
    expect(r.error).toContain('company.pipeline_status')
  })
  it('allows deleting a starter field', () => {
    const s = structuredClone(DEFAULT_SCHEMA)
    s.types.company.fields = s.types.company.fields.filter((f) => f.key !== 'raise')
    expect(loadSchema(serializeSchema(s), null).error).toBeNull()
  })
  it('rejects a stage option without a category', () => {
    const s = structuredClone(DEFAULT_SCHEMA)
    delete s.types.company.fields.find((f) => f.key === 'pipeline_status')!.options![0].category
    expect(loadSchema(serializeSchema(s), null).error).toContain('category')
  })
})

describe('validateFields', () => {
  it('flags a bad select value and ignores unknown keys', () => {
    expect(validateFields(DEFAULT_SCHEMA, 'company', { stage: 'seed-ish', mystery: 'x' })).toEqual([
      "stage: 'seed-ish' is not an option"
    ])
    expect(validateFields(DEFAULT_SCHEMA, 'company', { stage: 'seed', mystery: 'x' })).toEqual([])
  })
})

describe('coerceValue', () => {
  it('rejects bad dates and checkboxes', () => {
    expect(() => coerceValue(field('company', 'first_seen'), '2026-13-01')).toThrow(ValidationError)
    expect(() => coerceValue(field('company', 'first_seen'), '2026-02-30')).toThrow(ValidationError)
    expect(coerceValue(field('company', 'first_seen'), '2026-02-28')).toBe('2026-02-28')
    expect(() => coerceValue(field('person', 'met'), 'maybe')).toThrow(ValidationError)
    expect(coerceValue(field('person', 'met'), 'true')).toBe(true)
    expect(coerceValue(field('person', 'met'), false)).toBe(false)
  })
  it('normalises relations to bracketed links', () => {
    expect(coerceValue(field('company', 'themes'), ['AI Agent Security', '[[Infra]]'])).toEqual([
      '[[AI Agent Security]]',
      '[[Infra]]'
    ])
    expect(coerceValue(field('company', 'referred_by'), 'Sam')).toBe('[[Sam]]')
  })
  it('handles numbers, clearing and free multi-selects', () => {
    expect(coerceValue(field('person', 'cadence_days'), '14')).toBe(14)
    expect(() => coerceValue(field('person', 'cadence_days'), 'soon')).toThrow(ValidationError)
    expect(coerceValue(field('company', 'stage'), '')).toBeNull()
    expect(coerceValue(field('company', 'stage'), null)).toBeNull()
    expect(coerceValue(field('company', 'aliases'), ['Quill', 'Quill Inc'])).toEqual(['Quill', 'Quill Inc'])
  })
})
