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

export interface BodySyncDeps {
  /** What the editor holds now. */
  doc(): string
  /** Put text from disk into the editor; `undoable` false keeps it out of the editor's undo history. */
  replace(text: string, undoable: boolean): void
  /** Save the body to the vault. */
  write(text: string): Promise<void>
  onConflict(diskBody: string | null): void
  onError(e: unknown): void
  delay?: number
}

/**
 * Keeps an editor's text and the note on disk in step: autosave after a pause, reload outside
 * changes, and hold a conflict until the user picks a side. `flush` (leaving the page, closing the
 * window) never drops local text: with a conflict open it keeps the user's version, and the
 * outside version is already in history.
 */
export class BodySync {
  private baseline: string
  private pending: string | null = null
  private inflight: Promise<void> | null = null
  private conflict: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    body: string,
    private d: BodySyncDeps
  ) {
    this.baseline = normalizeBody(body)
  }

  get initial(): string {
    return this.baseline
  }

  /** The user typed. */
  edited(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.save(), this.d.delay ?? 800)
  }

  /** Write the editor's text if it differs from disk. Paused while a conflict is open. */
  save(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.conflict !== null) return Promise.resolve()
    if (this.inflight) return this.inflight.then(() => this.save())
    const text = this.d.doc()
    if (text === this.baseline) return Promise.resolve()
    this.pending = text
    this.d.onError(null)
    let ok = false
    this.inflight = this.d
      .write(text)
      .then(
        () => {
          this.baseline = text
          ok = true
        },
        (e) => this.d.onError(e)
      )
      .finally(() => {
        this.pending = null
        this.inflight = null
        if (ok && this.d.doc() !== this.baseline && !this.timer) this.edited()
      })
    return this.inflight
  }

  /** Save now, whatever happens next; an open conflict resolves as "Keep mine". */
  flush(): Promise<void> {
    if (this.conflict !== null) this.keepMine()
    return this.save()
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
      doc: this.d.doc(),
      incoming
    })
    if (r === 'saved') this.baseline = incoming
    else if (r === 'reload') {
      this.baseline = incoming
      this.d.replace(incoming, false)
    } else if (r === 'conflict') this.setConflict(incoming)
  }

  /** Conflict bar: show the version on disk (undoable, since the user chose it). */
  takeDisk(): void {
    if (this.conflict === null) return
    const disk = this.conflict
    this.baseline = disk
    this.setConflict(null)
    this.d.replace(disk, true)
  }

  /** Conflict bar: save the editor's text over the outside version (history keeps that one). */
  keepMine(): Promise<void> {
    if (this.conflict === null) return Promise.resolve()
    this.baseline = this.conflict
    this.setConflict(null)
    return this.save()
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private setConflict(c: string | null): void {
    this.conflict = c
    this.d.onConflict(c)
  }
}
