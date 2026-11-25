import { describe, it, expect } from 'vitest'
import { splitSnippet, moveActive } from '../../src/renderer/src/lib/search'

describe('splitSnippet', () => {
  it('alternates plain and highlighted parts', () => {
    expect(splitSnippet('…a \uE000deck\uE001 for \uE000the\uE001 team')).toEqual([
      { text: '…a ', hit: false },
      { text: 'deck', hit: true },
      { text: ' for ', hit: false },
      { text: 'the', hit: true },
      { text: ' team', hit: false }
    ])
  })
  it('handles a snippet that starts or ends with a hit, and no hits', () => {
    expect(splitSnippet('\uE000Orchard\uE001 Signal')).toEqual([
      { text: 'Orchard', hit: true },
      { text: ' Signal', hit: false }
    ])
    expect(splitSnippet('plain')).toEqual([{ text: 'plain', hit: false }])
    expect(splitSnippet('')).toEqual([])
  })
  it('leaves « and » in a body as plain text', () => {
    expect(splitSnippet('a «b» \uE000c\uE001')).toEqual([
      { text: 'a «b» ', hit: false },
      { text: 'c', hit: true }
    ])
  })
  it('leaves markup as text', () => {
    expect(splitSnippet('<b>x</b> \uE000y\uE001')[0].text).toBe('<b>x</b> ')
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
