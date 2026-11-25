// Dropping files on the window does nothing. Text drags inside the editor still work, so
// CodeMirror can move a selection; file drops never reach it (it would paste the file's bytes
// as text). The main process also blocks navigation, in case a drop gets past this.

type DragLike = Pick<DragEvent, 'target' | 'dataTransfer' | 'preventDefault' | 'stopPropagation'>

const inEditor = (t: EventTarget | null): boolean =>
  typeof Element !== 'undefined' && t instanceof Element && t.closest('.cm-editor') !== null

export function guardDrag(e: DragLike): void {
  const files = Array.from(e.dataTransfer?.types ?? []).includes('Files')
  if (!files && inEditor(e.target)) return
  e.preventDefault()
  if (files) e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
}

/** Installs the guard in the capture phase, ahead of any element's own drop handling. */
export function installDropGuard(target: Pick<EventTarget, 'addEventListener'>): void {
  const listener = guardDrag as unknown as EventListener
  target.addEventListener('dragover', listener, true)
  target.addEventListener('drop', listener, true)
}
