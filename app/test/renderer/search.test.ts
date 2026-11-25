import { describe, it, expect } from 'vitest'
import { splitSnippet, moveActive } from '../../src/renderer/src/lib/search'

describe('splitSnippet', () => {
  it('alternates plain and highlighted parts', () => {
    expect(splitSnippet('…a «deck» for «the» team')).toEqual([
      { text: '…a ', hit: false },
      { text: 'deck', hit: true },
      { text: ' for ', hit: false },
      { text: 'the', hit: true },
      { text: ' team', hit: false }
    ])
  })
  it('handles a snippet that starts or ends with a hit, and no hits', () => {
    expect(splitSnippet('«Orchard» Signal')).toEqual([
      { text: 'Orchard', hit: true },
      { text: ' Signal', hit: false }
    ])
    expect(splitSnippet('plain')).toEqual([{ text: 'plain', hit: false }])
    expect(splitSnippet('')).toEqual([])
  })
  it('leaves markup as text', () => {
    expect(splitSnippet('<b>x</b> «y»')[0].text).toBe('<b>x</b> ')
  })
})

describe('moveActive', () => {
  it('wraps around', () => {
    expect(moveActive(0, -1, 3)).toBe(2)
    expect(moveActive(2, 1, 3)).toBe(0)
    expect(moveActive(1, 1, 3)).toBe(2)
    expect(moveActive(0, 1, 0)).toBe(0)
  })
})
