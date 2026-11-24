import type { RecordType, StageCategory } from '../../shared/api'

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multi-select'
  | 'stage'
  | 'relation'
  | 'url'
  | 'checkbox'

export interface OptionDef {
  value: string
  label: string
  category?: StageCategory
  renamedFrom?: string
}

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  tier: 'system' | 'starter' | 'custom'
  options?: OptionDef[]
  target?: RecordType | 'any'
  multiple?: boolean
}

export interface TypeDef {
  folder: string
  template: string
  fields: FieldDef[]
}

export interface Schema {
  version: number
  types: Record<RecordType, TypeDef>
}

export type SchemaChange =
  | { kind: 'add-field'; type: RecordType; field: FieldDef }
  | { kind: 'update-field'; type: RecordType; key: string; label?: string; options?: OptionDef[] }
  | { kind: 'rename-field'; type: RecordType; from: string; to: string }
  | { kind: 'delete-field'; type: RecordType; key: string }
