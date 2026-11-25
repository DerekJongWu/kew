// Search screen logic: snippet markers and arrow-key movement.

export const SEARCH_LIMIT = 50

export interface SnippetPart {
  text: string
  hit: boolean
}

/**
 * Split a core snippet into plain and highlighted parts. The core wraps matches in the private-use characters U+E000 and U+E001, which a note body
 * will not contain (unlike « and »);
 * the screen renders hits as <mark> elements, so snippet text is never treated as HTML.
 */
export function splitSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let hit = false
  for (const text of snippet.split(/[\uE000\uE001]/)) {
    // Alternate plain / hit; markers are paired, so the first piece is always plain.
    if (text) parts.push({ text, hit })
    hit = !hit
  }
  return parts
}

/** Next highlighted index for an arrow key, wrapping at both ends. */
export function moveActive(index: number, delta: 1 | -1, count: number): number {
  if (count === 0) return 0
  return (index + delta + count) % count
}
