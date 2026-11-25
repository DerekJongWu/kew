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

// The file's dominant line ending (CRLF only when it outnumbers bare LF).
function detectEol(text: string): '\n' | '\r\n' {
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/\n/g) ?? []).length - crlf
  return crlf > 0 && crlf >= lf ? '\r\n' : '\n'
}

// Lines are split on \n only, so a CRLF line keeps its trailing \r and every
// untouched line is written back byte-identical. Use bare() to compare.
const bare = (l: string): string => l.replace(/\r$/, '')
const crOf = (eol: string): string => (eol === '\r\n' ? '\r' : '')

function splitFrontmatter(text: string): { lines: string[]; fmEnd: number } {
  const lines = text.split('\n')
  if (bare(lines[0]) !== '---') return { lines, fmEnd: -1 }
  for (let i = 1; i < lines.length; i++) if (bare(lines[i]) === '---') return { lines, fmEnd: i }
  return { lines, fmEnd: -1 }
}

// Lines of a key's block value: indented lines, or column-0 "- item" lines
// when the key has no inline value.
function blockEnd(lines: string[], idx: number, end: number): number {
  let j = idx + 1
  const emptyValue = /^[^:]*:\s*(#.*)?$/.test(bare(lines[idx]))
  while (j < end && (/^\s+\S/.test(lines[j]) || (emptyValue && /^-(\s|$)/.test(lines[j])))) j++
  return j
}

// Edits must never leave frontmatter that no longer parses.
export function checkedAfter(before: string, after: string): string {
  if (parseNote(before).ok && !parseNote(after).ok) {
    throw new NoteParseError('edit would leave unparseable frontmatter: ' + parseNote(after).error)
  }
  return after
}

function toFieldValue(v: unknown): FieldValue {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v))
    return v.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x)))
  return JSON.stringify(v)
}

// The frontmatter as YAML parsed it (throws on bad YAML). Assumes fmEnd >= 0.
const rawYaml = (lines: string[], fmEnd: number): unknown =>
  parseYaml(lines.slice(1, fmEnd).map(bare).join('\n'), { schema: 'core' }) ?? {}

export function parseNote(text: string): ParsedNote {
  const eol = detectEol(text)
  const { lines, fmEnd } = splitFrontmatter(text)
  if (fmEnd < 0) return { fm: {}, body: text, ok: false, error: 'note has no frontmatter', eol }
  const body = lines.slice(fmEnd + 1).join('\n')
  try {
    const raw = rawYaml(lines, fmEnd)
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
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
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

function requireFrontmatter(text: string): { lines: string[]; fmEnd: number } {
  const p = parseNote(text)
  if (!p.ok) throw new NoteParseError(p.error ?? 'cannot parse note')
  return splitFrontmatter(text)
}

// Set top-level keys. Existing lines are replaced in place; missing keys go
// just before `tags:` (or before the closing ---). undefined removes the key.
export function setKeys(text: string, changes: Record<string, FieldValue | undefined>): string {
  {
    const { lines, fmEnd } = requireFrontmatter(text)
    const cr = crOf(detectEol(text))
    let end = fmEnd
    for (const [key, value] of Object.entries(changes)) {
      let idx = -1
      for (let i = 1; i < end; i++) {
        if (lines[i].startsWith(key + ':')) {
          idx = i
          break
        }
      }
      const j = idx >= 0 ? blockEnd(lines, idx, end) : 0
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
        lines.splice(idx, j - idx, line + (lines[idx].endsWith('\r') ? '\r' : ''))
        end -= j - idx - 1
      } else {
        let at = end
        for (let i = 1; i < end; i++) {
          if (lines[i].startsWith('tags:')) {
            at = i
            break
          }
        }
        lines.splice(at, 0, line + cr)
        end += 1
      }
    }
    return checkedAfter(text, lines.join('\n'))
  }
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

// Rewrite top-level string values and string-list items with fn (nested values are left
// alone). A changed key keeps its own lines when rewriting them in place still reads back
// as the rewritten value; otherwise (say, a quote character landed inside a quoted value)
// that key is re-serialized with setKeys. Other keys and the body are untouched.
export function rewriteFrontmatterStrings(text: string, fn: (s: string) => string): string {
  const { lines, fmEnd } = requireFrontmatter(text)
  const raw = rawYaml(lines, fmEnd) as Record<string, unknown>
  let out = text
  for (const [key, v] of Object.entries(raw)) {
    let want: string | string[]
    if (typeof v === 'string') want = fn(v)
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) want = v.map(fn)
    else continue
    if (sameValue(want, v)) continue
    const cur = splitFrontmatter(out)
    const idx = cur.lines.findIndex((l, i) => i > 0 && i < cur.fmEnd && l.startsWith(key + ':'))
    if (idx < 0) continue
    const end = blockEnd(cur.lines, idx, cur.fmEnd)
    const inPlace = [...cur.lines]
    for (let i = idx; i < end; i++) inPlace[i] = fn(inPlace[i])
    const candidate = inPlace.join('\n')
    const back = splitFrontmatter(candidate)
    let ok = false
    try {
      ok = sameValue((rawYaml(back.lines, back.fmEnd) as Record<string, unknown>)[key], want)
    } catch {
      ok = false
    }
    out = ok ? candidate : setKeys(out, { [key]: want })
  }
  return checkedAfter(text, out)
}

// Replace everything after the frontmatter.
export function setBody(text: string, body: string): string {
  const { lines, fmEnd } = requireFrontmatter(text)
  const eol = detectEol(text)
  const b = body.replace(/\r?\n/g, eol)
  return checkedAfter(text, lines.slice(0, fmEnd + 1).join('\n') + '\n' + b)
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
  const lines = text.split('\n').map(bare)
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
  {
    const lines = text.split('\n')
    const cr = crOf(detectEol(text))
    const line = (item.startsWith('- ') ? item : '- ' + item) + cr
    const r = sectionRange(lines, heading)
    if (r) {
      let at = r.start + 1
      for (let i = r.start + 1; i < r.end; i++) {
        if (/^\s*- /.test(lines[i]) || /^\s{2,}\S/.test(lines[i])) at = i + 1
      }
      if (at === r.start + 1 && bare(lines[at] ?? '') === '') at += 1 // keep a blank line under the heading
      lines.splice(at, 0, line)
      // a list line directly above "---" or a heading needs a blank line after it
      if (at + 1 < lines.length && /^(---\s*$|#)/.test(lines[at + 1])) lines.splice(at + 1, 0, cr)
      return checkedAfter(text, lines.join('\n'))
    }
    const block = [heading + cr, cr, line, cr]
    if (opts.before) {
      const b = lines.findIndex((l) => l.trim() === opts.before)
      if (b >= 0) {
        lines.splice(b, 0, ...block)
        return checkedAfter(text, lines.join('\n'))
      }
    }
    while (lines.length && bare(lines[lines.length - 1]) === '') lines.pop()
    lines.push(cr, ...block.slice(0, -1), '') // final '' keeps the file ending in a terminator
    return checkedAfter(text, lines.join('\n'))
  }
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
