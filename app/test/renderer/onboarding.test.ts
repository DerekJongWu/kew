import { describe, it, expect } from 'vitest'
import {
  isFolderNotEmpty,
  notEmptyFolder,
  isFolderMissing,
  folderName,
  planSummary,
  prettyPath
} from '../../src/renderer/src/lib/onboarding'

const named = (name: string, message = 'x'): Error => Object.assign(new Error(message), { name })

describe('error kinds', () => {
  it('recognises FolderNotEmptyError by name and reads its path', () => {
    const e = Object.assign(named('FolderNotEmptyError'), { path: '/a/Kew' })
    expect(isFolderNotEmpty(e)).toBe(true)
    expect(notEmptyFolder(e)).toBe('/a/Kew')
    expect(isFolderNotEmpty(named('Error'))).toBe(false)
    expect(isFolderNotEmpty('nope')).toBe(false)
    expect(notEmptyFolder(named('Error'))).toBeNull()
  })
  it('recognises FolderMissingError by name', () => {
    expect(isFolderMissing(named('FolderMissingError'))).toBe(true)
    expect(isFolderMissing(named('Error', 'ENOENT'))).toBe(false)
  })
})

describe('paths', () => {
  it('names a folder by its last segment', () => {
    expect(folderName('/Users/a/Documents/Kew/')).toBe('Kew')
    expect(folderName('/')).toBe('/')
  })
  it('shortens the home folder to ~', () => {
    expect(prettyPath('/Users/a/Documents/Kew')).toBe('~/Documents/Kew')
    expect(prettyPath('/Volumes/x')).toBe('/Volumes/x')
  })
})

describe('planSummary', () => {
  it('counts notes and lists folders and files separately', () => {
    const s = planSummary({
      root: '/r',
      willCreate: ['Companies/', 'People/', 'Templates/Company.md', '.kew/schema.yaml'],
      existingNotes: 1
    })
    expect(s.notes).toBe('1 note already here, left untouched')
    expect(s.folders).toEqual(['Companies/', 'People/'])
    expect(s.files).toEqual(['Templates/Company.md', '.kew/schema.yaml'])
  })
  it('says so when nothing needs creating', () => {
    const s = planSummary({ root: '/r', willCreate: [], existingNotes: 12 })
    expect(s.notes).toBe('12 notes already here, left untouched')
    expect(s.nothing).toBe(true)
  })
  it('handles an empty folder', () => {
    expect(planSummary({ root: '/r', willCreate: ['a/'], existingNotes: 0 }).notes).toBe(
      'No notes here yet'
    )
  })
})
