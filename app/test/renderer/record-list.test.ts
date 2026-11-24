import { describe, it, expect } from 'vitest'
import {
  defaultPrefs,
  listableFields,
  loadPrefs,
  savePrefs,
  toggleColumn,
  visibleColumns
} from '../../src/renderer/src/lib/record-list'
import type { FieldDef } from '../../src/shared/api'

const f = (key: string): FieldDef => ({ key, label: key, type: 'text', tier: 'starter' })
const fields = ['id', 'type', 'name', 'company', '_last_touch', 'role'].map(f)

describe('record list columns', () => {
  it('drops calculated and bookkeeping fields', () => {
    expect(listableFields(fields).map((x) => x.key)).toEqual(['name', 'company', 'role'])
  })
  it('puts name first and keeps only chosen fields that exist', () => {
    expect(visibleColumns(fields, ['role', 'gone', 'company']).map((x) => x.key)).toEqual([
      'name',
      'company',
      'role'
    ])
    expect(visibleColumns(fields, []).map((x) => x.key)).toEqual(['name'])
  })
  it('toggles a column', () => {
    expect(toggleColumn(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleColumn(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('prefs', () => {
  const mem = (): Storage => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v)
    } as Storage
  }
  it('round-trips and falls back to defaults', () => {
    const s = mem()
    expect(loadPrefs('person', s)).toEqual(defaultPrefs('person'))
    savePrefs(
      'person',
      { columns: ['role'], sort: { field: 'role', dir: 'desc' }, filters: { category: ['vc'] } },
      s
    )
    expect(loadPrefs('person', s).columns).toEqual(['role'])
    expect(loadPrefs('company', s)).toEqual(defaultPrefs('company'))
  })
  it('survives corrupt or throwing storage', () => {
    const bad = { getItem: () => '{nope' } as unknown as Storage
    expect(loadPrefs('theme', bad)).toEqual(defaultPrefs('theme'))
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      }
    } as unknown as Storage
    expect(loadPrefs('theme', throwing)).toEqual(defaultPrefs('theme'))
    expect(() => savePrefs('theme', defaultPrefs('theme'), throwing)).not.toThrow()
  })
})
