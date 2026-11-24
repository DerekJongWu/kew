// The note body. Autosaves 800 ms after typing stops and on blur; `[[` completes record names;
// ⌘-click a link to open it. Outside edits reload the note when there are no local edits, and
// otherwise ask before anything is replaced. The editor itself lives in lib/note-editor.ts.
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { NoteEditor } from '../lib/note-editor'
import { flushes } from '../lib/flush'
import { Button } from './Button'

export interface EditorHandle {
  focus(): void
}

export function MarkdownEditor({
  recordId,
  body,
  label,
  ref,
  onOpenLink
}: {
  recordId: string
  body: string // the note body as last read from the vault
  label: string
  ref?: React.Ref<EditorHandle>
  onOpenLink(name: string): void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<NoteEditor | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({ focus: () => editor.current?.focus() }), [])

  // One editor per record (the page is keyed by id). Its first body is the one we mount with.
  useEffect(() => {
    const ed = new NoteEditor(host.current!, recordId, body, label, {
      onConflict: setConflict,
      onError: setError,
      onOpenLink
    })
    editor.current = ed
    const off = flushes.register(() => ed.flush())
    return () => {
      off()
      void ed.destroy()
      editor.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  useEffect(() => {
    editor.current?.setEvents({ onConflict: setConflict, onError: setError, onOpenLink })
  }, [onOpenLink])

  useEffect(() => {
    editor.current?.incoming(body)
  }, [body])

  return (
    <div className="editor-wrap">
      {conflict !== null && (
        <div className="editor-conflict" role="alert">
          <span>This note changed on disk while you were editing.</span>
          <Button className="btn-sm" onClick={() => editor.current?.takeDisk()}>
            Reload
          </Button>
          <Button className="btn-sm" variant="primary" onClick={() => editor.current?.keepMine()}>
            Keep mine
          </Button>
        </div>
      )}
      <div className="editor" ref={host} />
      {error && (
        <p className="row-error" role="alert">
          Couldn’t save the note: {error}
        </p>
      )}
    </div>
  )
}
