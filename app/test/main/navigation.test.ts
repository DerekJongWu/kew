import { describe, it, expect, vi } from 'vitest'
import { lockNavigation, type NavigationSource } from '../../src/main/navigation'

describe('lockNavigation', () => {
  it('cancels every navigation and redirect of the window', () => {
    const listeners = new Map<string, (e: { preventDefault(): void }) => void>()
    const wc: NavigationSource = { on: (event, listener) => listeners.set(event, listener) }
    lockNavigation(wc)
    expect([...listeners.keys()].sort()).toEqual(['will-navigate', 'will-redirect'])
    for (const listener of listeners.values()) {
      const e = { preventDefault: vi.fn() }
      listener(e)
      expect(e.preventDefault).toHaveBeenCalledOnce()
    }
  })
})
