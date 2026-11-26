// The CodeMirror 6 editor behind MarkdownEditor: markdown styling, [[ completion, ⌘-click links,
// autosave and reconciling with changes on disk. Kept outside React so the editor's own state
// (timers, the body being saved) lives in one plain object.
import { Annotation, EditorState, Transaction } from '@codemirror/state'
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
import { history, redo, undo } from '@codemirror/commands'
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
import { BodySync } from './body-sync'
import { editorKeymap } from './editor-keys'
import { linkAt, linkQuery, matchesName } from './wikilinks'
import { TYPE_LABEL } from './destinations'

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
  return runInEditor(el, undo)
}

/** Edit > Redo in the focused note editor; false when focus isn't in one. */
export function redoInEditor(el: Element | null): boolean {
  return runInEditor(el, redo)
}

function runInEditor(el: Element | null, command: (view: EditorView) => boolean): boolean {
  const host = el?.closest('.cm-editor')
  const view = host instanceof HTMLElement ? EditorView.findFromDOM(host) : null
  if (!view) return false
  command(view)
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

/** Owns one EditorView for one record; BodySync decides when to save and what to do with disk changes. */
export class NoteEditor {
  readonly view: EditorView
  private sync: BodySync

  constructor(
    parent: HTMLElement,
    recordId: string,
    body: string,
    label: string,
    private events: NoteEditorEvents
  ) {
    this.sync = new BodySync(body, {
      doc: () => this.view.state.doc.toString(),
      replace: (text, undoable) =>
        this.view.dispatch({
          changes: { from: 0, to: this.view.state.doc.length, insert: text },
          // Automatic reloads stay out of undo, so ⌘Z can't quietly revert an outside edit.
          annotations: [
            FromDisk.of(true),
            ...(undoable ? [] : [Transaction.addToHistory.of(false)])
          ]
        }),
      write: (text) => status.run(() => kew.setBody(recordId, text)).then(() => undefined),
      onConflict: (c) => this.events.onConflict(c),
      onError: (e) => this.events.onError(e === null ? null : plainError(e)),
      delay: 800
    })
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: this.sync.initial,
        extensions: [
          history(),
          keymap.of(editorKeymap()),
          markdown(),
          syntaxHighlighting(highlight),
          wikiLinks,
          autocompletion({ override: [completeLinks], icons: false }),
          EditorView.lineWrapping,
          placeholder('Write anything. Type [[ to link a record.'),
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(FromDisk)))
              this.sync.edited()
          }),
          EditorView.domEventHandlers({
            blur: () => void this.sync.save(),
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

  incoming(body: string): void {
    this.sync.incoming(body)
  }
  takeDisk(): void {
    this.sync.takeDisk()
  }
  keepMine(): void {
    void this.sync.keepMine()
  }
  /** Save now (window closing, leaving the page); never drops local text. */
  flush(): Promise<void> {
    return this.sync.flush()
  }
  /**
   * ⌘E: focus with the caret at the end of the note, scrolled into view. When the editor already
   * has focus, the caret stays where it is.
   */
  focus(): void {
    if (this.view.hasFocus) return
    const end = this.view.state.doc.length
    this.view.dispatch({ selection: { anchor: end }, scrollIntoView: true })
    this.view.focus()
  }

  /** Leaving the page: save what was typed (even with a conflict open), then tear down. */
  destroy(): Promise<void> {
    const saved = this.sync.flush()
    this.sync.dispose()
    this.view.destroy()
    return saved
  }
}
