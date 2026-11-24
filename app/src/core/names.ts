import type { RecordType } from '../shared/api'

export const bareDomain = (s: string): string =>
  String(s || '').toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]

export const normName = (s: string): string =>
  String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\b(inc|llc|ltd|corp|co|labs?|ai|hq|technologies|technology)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')

export const linkedinSlug = (s: string): string => {
  const m = String(s || '').match(/linkedin\.com\/in\/([^/?#]+)/i)
  return m ? decodeURIComponent(m[1]).toLowerCase().replace(/\/$/, '') : ''
}

export const safeFilename = (s: string): string =>
  String(s).replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim()

export { meetingName } from '../shared/names'

export function uniqueName(
  name: string,
  type: RecordType,
  taken: (candidate: string) => boolean,
  context?: { company?: string },
): string {
  if (!taken(name)) return name
  const label = type === 'person' && context?.company ? context.company : type
  const base = `${name} (${label})`
  if (!taken(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken(candidate)) return candidate
  }
}
