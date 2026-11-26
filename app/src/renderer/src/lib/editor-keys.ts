// The note editor's key bindings: CodeMirror's defaults and history, minus ⌘[ / ⌘] (outdent /
// indent there, but back / forward everywhere in Kew), plus Escape to leave the editor.
import type { KeyBinding } from '@codemirror/view'
import { defaultKeymap, historyKeymap } from '@codemirror/commands'

const RESERVED = new Set(['Mod-[', 'Mod-]'])

export function editorKeymap(): KeyBinding[] {
  const escape: KeyBinding = {
    key: 'Escape',
    run: (view) => {
      view.contentDOM.blur()
      return true
    }
  }
  return [escape, ...defaultKeymap, ...historyKeymap].filter(
    (b) => !RESERVED.has(b.key ?? '') && !RESERVED.has(b.mac ?? '')
  )
}
