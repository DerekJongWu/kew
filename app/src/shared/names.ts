// Name rules shared by core (which enforces them) and the renderer (which shows them early).

/** Characters that break file names or [[links]]; a record name can't contain them. */
export const BAD_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g

/** Why `name` can't be a record name, or null when it can. Messages match what core throws. */
export function nameProblem(name: string): string | null {
  const n = name.trim()
  if (!n) return 'A name is required.'
  // A dot file is hidden: Kew's rebuild, Finder and Obsidian all skip it.
  if (n.startsWith('.')) return "A name can't start with a dot (the note would be hidden)."
  const bad = [...new Set(n.match(BAD_NAME_CHARS) ?? [])]
  if (bad.length > 0)
    return `A name can't contain ${bad.join(' ')} (they break file names or links).`
  if (/[^\S ]| {2}/.test(n)) return "A name can't contain repeated spaces or line breaks."
  return null
}

export const meetingName = (date: string, subject: string, meetingType?: string): string =>
  [date, subject, meetingType].filter(Boolean).join(' ')
