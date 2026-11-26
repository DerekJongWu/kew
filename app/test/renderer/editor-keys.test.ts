import { describe, it, expect } from 'vitest'
import { defaultKeymap } from '@codemirror/commands'
import { editorKeymap } from '../../src/renderer/src/lib/editor-keys'

describe('editorKeymap', () => {
  it("drops ⌘[ and ⌘] (they're back/forward in Kew), keeps the rest", () => {
    const keys = editorKeymap().map((b) => b.key)
    expect(defaultKeymap.some((b) => b.key === 'Mod-[')).toBe(true) // what we're removing exists
    expect(keys).not.toContain('Mod-[')
    expect(keys).not.toContain('Mod-]')
    expect(keys).toContain('Mod-z') // history
    expect(keys).toContain('Escape')
  })
})
