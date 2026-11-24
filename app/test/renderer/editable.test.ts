import { describe, it, expect } from 'vitest'
import { isEditable } from '../../src/renderer/src/lib/editable'

describe('isEditable', () => {
  it('is true for text inputs, textareas and contenteditable', () => {
    expect(isEditable({ tagName: 'INPUT', isContentEditable: false })).toBe(true)
    expect(isEditable({ tagName: 'TEXTAREA', isContentEditable: false })).toBe(true)
    expect(isEditable({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
  it('is false for buttons, the body, selects and nothing', () => {
    expect(isEditable({ tagName: 'BUTTON', isContentEditable: false })).toBe(false)
    expect(isEditable({ tagName: 'BODY', isContentEditable: false })).toBe(false)
    expect(isEditable({ tagName: 'SELECT', isContentEditable: false })).toBe(false)
    expect(isEditable(null)).toBe(false)
  })
})
