import type { Route } from '../router'
import type { RecordType } from '../../../shared/api'

export interface Destination {
  key: string
  label: string
  route: Route
  shortcut: string // ⌘ + this digit
}

export const DESTINATIONS: Destination[] = [
  { key: 'today', label: 'Today', route: { name: 'today' }, shortcut: '1' },
  { key: 'pipeline', label: 'Pipeline', route: { name: 'pipeline' }, shortcut: '2' },
  { key: 'company', label: 'Companies', route: { name: 'list', type: 'company' }, shortcut: '3' },
  { key: 'person', label: 'People', route: { name: 'list', type: 'person' }, shortcut: '4' },
  { key: 'meeting', label: 'Meetings', route: { name: 'list', type: 'meeting' }, shortcut: '5' },
  { key: 'theme', label: 'Themes', route: { name: 'list', type: 'theme' }, shortcut: '6' },
  { key: 'research', label: 'Research', route: { name: 'list', type: 'research' }, shortcut: '7' }
]

export const SETTINGS: Destination = {
  key: 'settings',
  label: 'Settings',
  route: { name: 'settings', tab: 'fields' },
  shortcut: ','
}

/** Which sidebar item a route belongs to (records and search highlight nothing). */
export function destinationKey(r: Route): string | null {
  if (r.name === 'list') return r.type
  if (r.name === 'today' || r.name === 'pipeline' || r.name === 'settings') return r.name
  return null
}

export const TYPE_LABEL: Record<RecordType, string> = {
  company: 'Company',
  person: 'Person',
  meeting: 'Meeting',
  theme: 'Theme',
  research: 'Research'
}
