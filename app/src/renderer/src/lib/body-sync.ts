// What the editor does when a note's body arrives from the vault while the user may be typing.

export const normalizeBody = (s: string): string => s.replace(/\r\n?/g, '\n')

export type Reconcile = 'same' | 'saved' | 'reload' | 'conflict'

/**
 * `baseline`: the body last known to be on disk; `pending`: the body being saved (or null);
 * `doc`: what the editor holds; `incoming`: the body just read from the vault.
 * - same: nothing changed. - saved: our own save landed. - reload: an outside change and no local
 * edits, so show it. - conflict: an outside change while the user has unsaved edits.
 */
export function reconcile(s: {
  baseline: string
  pending: string | null
  doc: string
  incoming: string
}): Reconcile {
  if (s.incoming === s.baseline) return 'same'
  if (s.pending !== null && s.incoming === s.pending) return 'saved'
  if (s.pending === null && s.doc === s.baseline) return 'reload'
  return 'conflict'
}
