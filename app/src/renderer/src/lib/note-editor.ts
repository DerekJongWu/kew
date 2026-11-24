// The CodeMirror 6 editor behind MarkdownEditor: markdown styling, [[ completion, ⌘-click links,
// autosave and reconciling with changes on disk. Kept outside React so the editor's own state
// (timers, the body being saved) lives in one plain object.
import { Annotation, EditorState } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { tags } from '@lezer/highlight'
import { kew } from '../api'
import { plainError, status } from './actions'
import { normalizeBody, reconcile } from './body-sync'
import { linkAt, linkQuery, matchesName } from './wikilinks'
import { TYPE_LABEL } from './destinations'

export const SAVE_DELAY = 800
/** Marks transactions that load text from disk, so they don't count as the user's edits. */
const FromDisk = Annotation.define<boolean>()

const highlight = HighlightStyle.define([
  { tag: tags.heading1, class: 'md-h md-h1' },
  { tag: tags.heading2, class: 'md-h md-h2' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], class: 'md-h md-h3' },
  { tag: tags.strong, class: 'md-strong' },
  { tag: tags.emphasis, class: 'md-em' },
  { tag: tags.link, class: 'md-link' },
  { tag: tags.url, class: 'md-url' },
  { tag: tags.monospace, class: 'md-code' },
  { tag: tags.list, class: 'md-list' },
  { tag: tags.quote, class: 'md-quote' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], class: 'md-mark' }
])

const wikiLinks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    matcher = new MatchDecorator({
      regexp: /\[\[[^\][\n|]+(\|[^\][\n]*)?\]\]/g,
      decoration: Decoration.mark({
        class: 'md-wikilink',
        attributes: { title: '⌘-click to open' }
      })
    })
    constructor(view: EditorView) {
      this.decorations = this.matcher.createDeco(view)
    }
    update(u: ViewUpdate): void {
      this.decorations = this.matcher.updateDeco(u, this.decorations)
    }
  },
  { decorations: (v) => v.decorations }
)

/** `[[` completion: records whose name or alias contains what's typed, from the vault's search. */
async function completeLinks(ctx: CompletionContext): Promise<CompletionResult | null> {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const q = linkQuery(line.text.slice(0, ctx.pos - line.from))
  if (!q || !q.text.trim()) return null
  const from = line.from + q.from
  const text = q.text.trim().toLowerCase()
  const hits = await kew.search(q.text, 30)
  const seen = new Set<string>()
  const options: Completion[] = []
  for (const { record } of hits) {
    const aliases = Array.isArray(record.fields.aliases) ? record.fields.aliases.map(String) : []
    if (seen.has(record.name)) continue
    if (![record.name, ...aliases].some((n) => n.toLowerCase().includes(text))) continue
    seen.add(record.name)
    options.push({
      label: record.name,
      detail: TYPE_LABEL[record.type],
      apply: (view, _c, _from, to) => {
        const after = view.state.sliceDoc(to, to + 2) === ']]' ? 2 : 0
        const insert = `[[${record.name}]]`
        view.dispatch({
          changes: { from, to: to + after, insert },
          selection: { anchor: from + insert.length }
        })
      }
    })
  }
  const starts = (c: Completion): number => (c.label.toLowerCase().startsWith(text) ? 0 : 1)
  options.sort((a, b) => starts(a) - starts(b))
  return { from, options: options.slice(0, 10), filter: false }
}

/**
 * Edit > Undo while a note editor has focus: undo in the editor's own history (the browser's
 * native undo doesn't reach CodeMirror). Returns false when focus isn't in an editor.
 */
export function undoInEditor(el: Element | null): boolean {
  const host = el?.closest('.cm-editor')
  const view = host instanceof HTMLElement ? EditorView.findFromDOM(host) : null
  if (!view) return false
  undo(view)
  return true
}

/** The id of the record a link names (by name or alias), or null when none exists. */
export async function resolveLink(name: string): Promise<string | null> {
  const types = ['company', 'person', 'meeting', 'theme', 'research'] as const
  const lists = await Promise.all(types.map((t) => kew.list(t, { text: name })))
  return lists.flat().find((r) => matchesName(r, name))?.id ?? null
}

export interface NoteEditorEvents {
  onConflict(diskBody: string | null): void
  onError(message: string | null): void
  onOpenLink(name: string): void
}

/**
 * Owns one EditorView for one record. `baseline` is the body last known to be on disk, `pending`
 * the body being saved. Saving pauses while a conflict with an outside edit is unresolved.
 */
export class NoteEditor {
  readonly view: EditorView
  private baseline: string
  private pending: string | null = null
  private conflict: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    parent: HTMLElement,
    private recordId: string,
    body: string,
    label: string,
    private events: NoteEditorEvents
  ) {
    this.baseline = normalizeBody(body)
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: this.baseline,
        extensions: [
          history(),
          keymap.of([
            {
              key: 'Escape',
              run: (v) => {
                v.contentDOM.blur()
                return true
              }
            },
            ...defaultKeymap,
            ...historyKeymap
          ]),
          markdown(),
          syntaxHighlighting(highlight),
          wikiLinks,
          autocompletion({ override: [completeLinks] }),
          EditorView.lineWrapping,
          placeholder('Write anything. Type [[ to link a record.'),
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(FromDisk))) this.schedule()
          }),
          EditorView.domEventHandlers({
            blur: () => this.save(),
            mousedown: (e, v) => {
              if (!e.metaKey) return false
              const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
              if (pos === null) return false
              const line = v.state.doc.lineAt(pos)
              const link = linkAt(line.text, pos - line.from)
              if (!link) return false
              e.preventDefault()
              this.events.onOpenLink(link.name)
              return true
            }
          })
        ]
      })
    })
  }

  setEvents(events: NoteEditorEvents): void {
    this.events = events
  }

  private doc(): string {
    return this.view.state.doc.toString()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.save(), SAVE_DELAY)
  }

  /** Write the editor's text if it differs from disk. */
  save(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const text = this.doc()
    if (this.conflict !== null || this.pending !== null || text === this.baseline) return
    this.pending = text
    this.events.onError(null)
    status
      .run(() => kew.setBody(this.recordId, text))
      .then(
        () => {
          this.baseline = text
          this.pending = null
          if (this.doc() !== text) this.schedule()
        },
        (e) => {
          this.pending = null
          this.events.onError(plainError(e))
        }
      )
  }

  private replace(text: string): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      annotations: FromDisk.of(true)
    })
  }

  private setConflict(c: string | null): void {
    this.conflict = c
    this.events.onConflict(c)
  }

  /** A body read from the vault: our own save, an outside change, or a conflict with local edits. */
  incoming(body: string): void {
    const incoming = normalizeBody(body)
    if (this.conflict !== null) {
      if (incoming !== this.baseline) this.setConflict(incoming)
      return
    }
    const r = reconcile({
      baseline: this.baseline,
      pending: this.pending,
      doc: this.doc(),
      incoming
    })
    if (r === 'saved') this.baseline = incoming
    else if (r === 'reload') {
      this.baseline = incoming
      this.replace(incoming)
    } else if (r === 'conflict') this.setConflict(incoming)
  }

  /** Conflict bar: show the version on disk. */
  takeDisk(): void {
    if (this.conflict === null) return
    const disk = this.conflict
    this.baseline = disk
    this.setConflict(null)
    this.replace(disk)
  }

  /** Conflict bar: save what's in the editor over it (history keeps the outside version). */
  keepMine(): void {
    if (this.conflict === null) return
    this.baseline = this.conflict
    this.setConflict(null)
    this.save()
  }

  focus(): void {
    this.view.focus()
  }

  /** Leaving the page: save what was typed, then tear down. */
  destroy(): void {
    this.save()
    if (this.timer) clearTimeout(this.timer)
    this.view.destroy()
  }
}
