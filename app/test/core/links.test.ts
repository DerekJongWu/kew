import { describe, it, expect } from 'vitest'
import { extractLinks, rewriteLinks, linkValue, unlink } from '../../src/core/links'

describe('extractLinks', () => {
  it('returns the target of plain, alias, heading and heading+alias links', () => {
    const text = 'See [[Acme]], [[Beta|the beta]], [[Gamma#Pricing]] and [[Delta#Team|team]].'
    expect(extractLinks(text)).toEqual(['Acme', 'Beta', 'Gamma', 'Delta'])
  })

  it('reads targets from quoted frontmatter values and flow lists', () => {
    const text = [
      '---',
      'company: "[[Quill Security]]"',
      "partners: ['[[A]]', '[[B]]']",
      '---',
      'body',
    ].join('\n')
    expect(extractLinks(text)).toEqual(['Quill Security', 'A', 'B'])
  })

  it('treats embeds as links to their target', () => {
    expect(extractLinks('![[Chart]]')).toEqual(['Chart'])
  })

  it('trims targets, de-duplicates in first-seen order and skips empty targets', () => {
    const text = '[[ Acme ]] [[Beta]] [[Acme|again]] [[#Local Heading]] [[ ]]'
    expect(extractLinks(text)).toEqual(['Acme', 'Beta'])
  })

  it('returns an empty list when there are no links', () => {
    expect(extractLinks('plain text, [single brackets]')).toEqual([])
  })
})

describe('rewriteLinks', () => {
  it('rewrites the target in frontmatter lists and in the body', () => {
    const text = [
      '---',
      'company: "[[Orbit]]"',
      "partners: ['[[orbit]]', '[[Other]]']",
      '---',
      'Met [[ORBIT]] today.',
    ].join('\n')
    expect(rewriteLinks(text, 'Orbit', 'Orbit Space')).toBe([
      '---',
      'company: "[[Orbit Space]]"',
      "partners: ['[[Orbit Space]]', '[[Other]]']",
      '---',
      'Met [[Orbit Space]] today.',
    ].join('\n'))
  })

  it('keeps heading, alias and embed marker when rewriting the target', () => {
    expect(rewriteLinks('[[Orbit#Pricing]]', 'Orbit', 'Orbit Space')).toBe('[[Orbit Space#Pricing]]')
    expect(rewriteLinks('[[Orbit|the co]]', 'Orbit', 'Orbit Space')).toBe('[[Orbit Space|the co]]')
    expect(rewriteLinks('[[Orbit#Team|team]]', 'Orbit', 'Orbit Space')).toBe('[[Orbit Space#Team|team]]')
    expect(rewriteLinks('![[Orbit]]', 'Orbit', 'Orbit Space')).toBe('![[Orbit Space]]')
  })

  it('does not change a different target that shares a prefix', () => {
    const text = 'See [[Orbital]] and [[Orbit]].'
    expect(rewriteLinks(text, 'Orbit', 'Orbit Space')).toBe('See [[Orbital]] and [[Orbit Space]].')
  })

  it('leaves text without matching links unchanged', () => {
    const text = 'No links here, [[Other]] only.'
    expect(rewriteLinks(text, 'Orbit', 'X')).toBe(text)
  })
})

describe('linkValue and unlink', () => {
  it('linkValue wraps a name in brackets', () => {
    expect(linkValue('Quill Security')).toBe('[[Quill Security]]')
  })

  it('unlink strips brackets and any alias or heading', () => {
    expect(unlink('[[A]]')).toBe('A')
    expect(unlink('A')).toBe('A')
    expect(unlink('[[A|x]]')).toBe('A')
    expect(unlink('[[A#Heading]]')).toBe('A')
  })

  it('unlink inverts linkValue', () => {
    expect(unlink(linkValue('Quill Security'))).toBe('Quill Security')
  })
})
