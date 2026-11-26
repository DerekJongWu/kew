/** Whether focus is in a text field, where ⌘Z should undo typing rather than a vault change. */
export function isEditable(
  el: { tagName?: string; isContentEditable?: boolean } | null | undefined
): boolean {
  if (!el) return false
  return el.isContentEditable === true || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
}
