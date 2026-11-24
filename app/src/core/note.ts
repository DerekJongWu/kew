// Reading and surgically editing Obsidian notes.
// Edits touch only the lines they change, so a note's other formatting,
// comments and key order survive. Original line endings (LF or CRLF) are kept.
import { parse as parseYaml } from 'yaml'
import type { FieldValue } from '../shared/api'

export class NoteParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoteParseError'
  }
}

export interface ParsedNote {
  fm: Record<string, FieldValue>
  body: string
  ok: boolean
  error?: string
  eol: '\n' | '\r\n'
}

function detectEol(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

// Run an LF-based edit on text, writing the result back with the original EOL.
function withLf(text: string, fn: (lf: string) => string): string {
  const eol = detectEol(text)
  if (eol === '\n') return fn(text)
  return fn(text.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n')
}

function splitFrontmatter(text: string): { lines: string[]; fmEnd: number } {
  const lines = text.split('\n')
  if (lines[0] !== '---') return { lines, fmEnd: -1 }
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') return { lines, fmEnd: i }
  return { lines, fmEnd: -1 }
}

function toFieldValue(v: unknown): FieldValue {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v))
    return v.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x)))
  return JSON.stringify(v)
}

export function parseNote(text: string): ParsedNote {
  const eol = detectEol(text)
  const lf = eol === '\n' ? text : text.replace(/\r\n/g, '\n')
  const { lines, fmEnd } = splitFrontmatter(lf)
  if (fmEnd < 0) return { fm: {}, body: text, ok: false, error: 'note has no frontmatter', eol }
  const body = lines.slice(fmEnd + 1).join(eol)
  try {
    const raw = parseYaml(lines.slice(1, fmEnd).join('\n'), { schema: 'core' }) ?? {}
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return { fm: {}, body, ok: false, error: 'frontmatter is not a mapping', eol }
    }
    const fm: Record<string, FieldValue> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) fm[k] = toFieldValue(v)
    return { fm, body, ok: true, eol }
  } catch (e) {
    return { fm: {}, body, ok: false, error: (e as Error).message, eol }
  }
}

function plainScalar(v: string | number | boolean | null | undefined, inFlow: boolean): string {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'number') return String(v)
  const s = String(v)
    .replace(/\s*\n\s*/g, ' ')
    .trim()
  if (s === '') return ''
  const needs =
    /: |\s#/.test(s) ||
    /:$/.test(s) ||
    /^[[\]{}"'*&!%@|>\-?`#,]/.test(s) ||
    /^(true|false|null|~)$/i.test(s) ||
    (inFlow && /[,[\]{}]/.test(s))
  return needs ? `'${s.replace(/'/g, "''")}'` : s
}

// YAML scalar per the vault's quoting rule ("Quote free-text values").
export function scalar(v: FieldValue): string {
  if (Array.isArray(v)) return `[${v.map((x) => plainScalar(x, true)).join(', ')}]`
  return plainScalar(v, false)
}

function requireFrontmatter(lf: string): { lines: string[]; fmEnd: number } {
  const p = parseNote(lf)
  if (!p.ok) throw new NoteParseError(p.error ?? 'cannot parse note')
  return splitFrontmatter(lf)
}

// Set top-level keys. Existing lines are replaced in place; missing keys go
// just before `tags:` (or before the closing ---). undefined removes the key.
export function setKeys(text: string, changes: Record<string, FieldValue | undefined>): string {
  return withLf(text, (lf) => {
    const { lines, fmEnd } = requireFrontmatter(lf)
    let end = fmEnd
    for (const [key, value] of Object.entries(changes)) {
      let idx = -1
      for (let i = 1; i < end; i++) {
        if (lines[i].startsWith(key + ':')) {
          idx = i
          break
        }
      }
      let j = idx + 1
      if (idx >= 0) while (j < end && /^\s+\S/.test(lines[j])) j++ // indented block value
      if (value === undefined) {
        if (idx >= 0) {
          lines.splice(idx, j - idx)
          end -= j - idx
        }
        continue
      }
      const v = scalar(value)
      const line = `${key}:${v === '' ? '' : ' ' + v}`
      if (idx >= 0) {
        lines.splice(idx, j - idx, line)
        end -= j - idx - 1
      } else {
        let at = end
        for (let i = 1; i < end; i++) {
          if (lines[i].startsWith('tags:')) {
            at = i
            break
          }
        }
        lines.splice(at, 0, line)
        end += 1
      }
    }
    return lines.join('\n')
  })
}

// Replace everything after the frontmatter.
export function setBody(text: string, body: string): string {
  return withLf(text, (lf) => {
    const { lines, fmEnd } = requireFrontmatter(lf)
    const b = body.replace(/\r\n/g, '\n')
    return lines.slice(0, fmEnd + 1).join('\n') + '\n' + b
  })
}

// Find a markdown section by exact heading text ("## Touches").
function sectionRange(lines: string[], heading: string): { start: number; end: number } | null {
  const level = heading.match(/^#+/)![0].length
  const start = lines.findIndex((l) => l.trim() === heading)
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/)
    if ((m && m[1].length <= level) || /^---\s*$/.test(lines[i]) || /^%%/.test(lines[i])) {
      end = i
      break
    }
  }
  return { start, end }
}

export function readList(text: string, heading: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const r = sectionRange(lines, heading)
  if (!r) return []
  return lines
    .slice(r.start + 1, r.end)
    .filter((l) => /^- /.test(l))
    .map((l) => l.slice(2))
}

// Append a list line to a section. A missing section is created before
// `opts.before` when given, otherwise at the end of the note. `item` may
// include its leading "- " or not.
export function appendToSection(
  text: string,
  heading: string,
  item: string,
  opts: { before?: string } = {}
): string {
  return withLf(text, (lf) => {
    const lines = lf.split('\n')
    const line = item.startsWith('- ') ? item : '- ' + item
    const r = sectionRange(lines, heading)
    if (r) {
      let at = r.start + 1
      for (let i = r.start + 1; i < r.end; i++) {
        if (/^\s*- /.test(lines[i]) || /^\s{2,}\S/.test(lines[i])) at = i + 1
      }
      if (at === r.start + 1 && lines[at] === '') at += 1 // keep a blank line under the heading
      lines.splice(at, 0, line)
      // a list line directly above "---" or a heading needs a blank line after it
      if (at + 1 < lines.length && /^(---\s*$|#)/.test(lines[at + 1])) lines.splice(at + 1, 0, '')
      return lines.join('\n')
    }
    const block = [heading, '', line, '']
    if (opts.before) {
      const b = lines.findIndex((l) => l.trim() === opts.before)
      if (b >= 0) {
        lines.splice(b, 0, ...block)
        return lines.join('\n')
      }
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop()
    lines.push('', ...block)
    return lines.join('\n')
  })
}

export function newNote(fm: Record<string, FieldValue>, body: string): string {
  const lines = ['---']
  for (const [k, v] of Object.entries(fm)) {
    const s = scalar(v)
    lines.push(`${k}:${s === '' ? '' : ' ' + s}`)
  }
  lines.push('---')
  return lines.join('\n') + '\n' + body
}
