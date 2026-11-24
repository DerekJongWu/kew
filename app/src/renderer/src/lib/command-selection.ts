// Which ⌘K item is highlighted. Record hits arrive after typing, so the highlight follows
// the current query and hits rather than staying on whatever was first when the list opened.

export interface SelectionInput {
  creating: boolean
  dupes: { record: { id: string } }[] | null
  hits: { record: { id: string } }[]
  commands: { id: string }[]
  q: string
}

/** The item Return should act on when the user hasn't moved the highlight. */
export function defaultSelection(s: SelectionInput): string {
  if (s.creating) {
    if (s.dupes?.length) return `dup-${s.dupes[0].record.id}`
    return s.q.trim() ? 'create' : ''
  }
  if (s.hits.length) return `rec-${s.hits[0].record.id}`
  return s.commands[0]?.id ?? ''
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
