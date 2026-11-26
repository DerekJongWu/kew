// Obsidian-style wikilinks: [[Target]], [[Target|alias]], [[Target#Heading]], [[Target#Heading|alias]].
// Embeds (![[Target]]) count as links to their target. Pure string work; no I/O.

const LINK_RE = /!?\[\[([^\]|#]*)[^\]]*\]\]/g
const TARGET_RE = /(!?\[\[)([^\]|#]*)(?=[\]#|])/g

const same = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

export function extractLinks(text: string): string[] {
  const seen = new Set<string>()
  for (const m of text.matchAll(LINK_RE)) {
    const target = m[1].trim()
    if (target) seen.add(target)
  }
  return [...seen]
}

export function rewriteLinks(text: string, from: string, to: string): string {
  return text.replace(TARGET_RE, (match, open: string, target: string) => {
    if (!same(target, from)) return match
    const lead = target.match(/^\s*/)?.[0] ?? ''
    const trail = target.match(/\s*$/)?.[0] ?? ''
    return open + lead + to + trail
  })
}

export const linkValue = (name: string): string => `[[${name}]]`

export function unlink(v: string): string {
  const s = v.trim()
  const m = s.match(/^!?\[\[([^\]|#]*)[^\]]*\]\]$/)
  return m ? m[1].trim() : s
}
