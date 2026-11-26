// Which ⌘K item is highlighted. Record hits arrive after typing, so the highlight follows
// the current query and hits rather than staying on whatever was first when the list opened.

export interface SelectionInput {
  creating: boolean
  dupes: { record: { id: string } }[] | null
  hits: { record: { id: string } }[]
  commands: { id: string }[]
  q: string
}

/**
 * The id of the "Search notes for …" item, pinned as the first row whenever the query is non-empty.
 * It is only the default when no record or command matches: Return opens the best record.
 */
export const SEARCH_ITEM = 'search-notes'

/** The item Return should act on when the user hasn't moved the highlight. */
export function defaultSelection(s: SelectionInput): string {
  if (s.creating) {
    if (s.dupes?.length) return `dup-${s.dupes[0].record.id}`
    return s.q.trim() ? 'create' : ''
  }
  if (s.hits.length) return `rec-${s.hits[0].record.id}`
  // Records win, then a matching command; with neither, Return runs the full-text search.
  return s.commands[0]?.id ?? (s.q.trim() ? SEARCH_ITEM : '')
}

/** Changes whenever the item list changes; a user's pick only holds for the list it was made on. */
export function selectionKey(s: SelectionInput): string {
  return JSON.stringify([
    s.creating,
    s.q,
    s.dupes?.map((d) => d.record.id) ?? null,
    s.hits.map((h) => h.record.id),
    s.commands.map((c) => c.id)
  ])
}

/** Keys that move cmdk's highlight (arrows, Home/End, and its ctrl-n/p/j/k bindings). */
export function isNavigationKey(e: { key: string; ctrlKey: boolean }): boolean {
  if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return true
  return e.ctrlKey && ['n', 'p', 'j', 'k'].includes(e.key.toLowerCase())
}

/**
 * Whether a highlight change counts as the user's pick. cmdk also moves the highlight on its own
 * (to the first row, the pinned "Search notes for …", after every keystroke); only a change that
 * follows an arrow key or the pointer is a pick. Typing clears it again.
 */
export function createPickIntent(): { typed(): void; navigated(): void; accepts(): boolean } {
  let user = false
  return {
    typed: () => void (user = false),
    navigated: () => void (user = true),
    accepts: () => user
  }
}
