import type { FieldDef, OptionDef, Schema } from './types'
import type { StageCategory } from '../../shared/api'

const titleCase = (v: string): string =>
  v.split('-').map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')

const opts = (values: string[], labels: Record<string, string> = {}): OptionDef[] =>
  values.map((value) => ({ value, label: labels[value] ?? titleCase(value) }))

const stageOpts = (rows: [string, StageCategory][]): OptionDef[] =>
  rows.map(([value, category]) => ({ value, label: titleCase(value), category }))

const f = (
  tier: FieldDef['tier'],
  key: string,
  label: string,
  type: FieldDef['type'],
  extra: Partial<FieldDef> = {}
): FieldDef => ({ key, label, type, tier, ...extra })

export const DEFAULT_SCHEMA: Schema = {
  version: 1,
  types: {
    company: {
      folder: 'Companies',
      template: 'Templates/Company.md',
      fields: [
        f('system', 'id', 'ID', 'text'),
        f('system', 'type', 'Type', 'text'),
        f('system', 'name', 'Name', 'text'),
        f('system', 'aliases', 'Aliases', 'multi-select', { options: [] }),
        f('system', 'website', 'Website', 'url'),
        f('system', 'pipeline_status', 'Pipeline status', 'stage', {
          options: stageOpts([
            ['new', 'new'],
            ['pursuing', 'in-progress'],
            ['reached-out', 'in-progress'],
            ['no-reply', 'in-progress'],
            ['active', 'active'],
            ['revisit', 'closed'],
            ['passed', 'closed'],
            ['archived', 'closed']
          ])
        }),
        f('starter', 'source', 'Source', 'select', {
          options: opts(['intro', 'email', 'event', 'linkedin', 'inbound-form', 'other'], {
            linkedin: 'LinkedIn',
            'inbound-form': 'Inbound form'
          })
        }),
        f('starter', 'stage', 'Stage', 'select', {
          options: opts(['pre-seed', 'seed', 'series-a', 'series-b', 'growth'], {
            'series-a': 'Series A',
            'series-b': 'Series B'
          })
        }),
        f('starter', 'themes', 'Themes', 'relation', { target: 'theme', multiple: true }),
        f('starter', 'round_status', 'Round status', 'select', { options: opts(['tracking', 'raising']) }),
        f('starter', 'raise', 'Raise', 'text'),
        f('starter', 'valuation', 'Valuation', 'text'),
        f('starter', 'lead', 'Lead', 'text'),
        f('starter', 'referred_by', 'Referred by', 'relation', { target: 'person' }),
        f('starter', 'first_seen', 'First seen', 'date'),
        f('starter', 'reach_out_on', 'Reach out on', 'date'),
        f('starter', 'conviction', 'Conviction', 'select', { options: opts(['high', 'medium', 'low']) }),
        f('starter', 'pass_reason', 'Pass reason', 'text'),
        f('starter', 'deal_sheet', 'Deal sheet', 'select', { options: opts(['yes', 'sent']) })
      ]
    },
    person: {
      folder: 'People',
      template: 'Templates/Person.md',
      fields: [
        f('system', 'id', 'ID', 'text'),
        f('system', 'type', 'Type', 'text'),
        f('system', 'name', 'Name', 'text'),
        f('system', 'met', 'Met', 'checkbox'),
        f('system', 'company', 'Company', 'relation', { target: 'company' }),
        f('system', 'linkedin', 'LinkedIn', 'url'),
        f('system', 'email', 'Email', 'text'),
        f('starter', 'role', 'Role', 'text'),
        f('starter', 'category', 'Category', 'select', {
          options: opts(['founder', 'vc', 'operator', 'lp', 'other'], { vc: 'VC', lp: 'LP' })
        }),
        f('starter', 'channel', 'Channel', 'select', {
          options: opts(['linkedin', 'email'], { linkedin: 'LinkedIn' })
        }),
        f('starter', 'cadence_days', 'Cadence (days)', 'number'),
        f('starter', 'next_follow_up', 'Next follow-up', 'date')
      ]
    },
    meeting: {
      folder: 'Meetings',
      template: 'Templates/Meeting.md',
      fields: [
        f('system', 'id', 'ID', 'text'),
        f('system', 'type', 'Type', 'text'),
        f('system', 'date', 'Date', 'date'),
        f('system', 'company', 'Company', 'relation', { target: 'company' }),
        f('system', 'attendees', 'Attendees', 'relation', { target: 'person', multiple: true }),
        f('starter', 'meeting_type', 'Meeting type', 'select', {
          options: opts(['intro', 'follow-up', 'diligence', 'reference', 'other'])
        }),
        f('starter', 'transcript', 'Transcript', 'text')
      ]
    },
    theme: {
      folder: 'Themes',
      template: 'Templates/Theme.md',
      fields: [
        f('system', 'id', 'ID', 'text'),
        f('system', 'type', 'Type', 'text'),
        f('system', 'name', 'Name', 'text'),
        f('system', 'slug', 'Slug', 'text'),
        f('starter', 'living_topic', 'Living topic', 'checkbox')
      ]
    },
    research: {
      folder: 'Research',
      template: 'Templates/Research.md',
      fields: [
        f('system', 'id', 'ID', 'text'),
        f('system', 'type', 'Type', 'text'),
        f('system', 'name', 'Name', 'text'),
        f('system', 'about', 'About', 'relation', { target: 'any', multiple: true }),
        f('system', 'topic', 'Topic', 'select', {
          options: opts(['team', 'market', 'financials', 'product', 'references'])
        }),
        f('system', 'created', 'Created', 'date'),
        f('starter', 'kind', 'Kind', 'select', { options: opts(['note', 'screen']) }),
        f('starter', 'sources', 'Sources', 'multi-select', { options: [] })
      ]
    }
  }
}
