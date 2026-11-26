import { describe, it, expect, vi, type Mock } from 'vitest'
import { guardDrag, installDropGuard } from '../../src/renderer/src/lib/drop-guard'

interface FakeDrag {
  target: null
  dataTransfer: DataTransfer
  preventDefault: Mock<() => void>
  stopPropagation: Mock<() => void>
}

const drag = (types: string[]): FakeDrag => {
  const dataTransfer = { types, dropEffect: 'copy' } as unknown as DataTransfer
  return { target: null, dataTransfer, preventDefault: vi.fn(), stopPropagation: vi.fn() }
}

describe('drop guard', () => {
  it('cancels file drops and keeps them from reaching the editor', () => {
    const e = drag(['Files'])
    guardDrag(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(e.dataTransfer.dropEffect).toBe('none')
  })

  it('cancels text drops outside the editor', () => {
    const e = drag(['text/plain'])
    guardDrag(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).not.toHaveBeenCalled()
  })

  it('listens to dragover and drop in the capture phase', () => {
    const addEventListener = vi.fn()
    installDropGuard({ addEventListener })
    expect(addEventListener.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ['dragover', true],
      ['drop', true]
    ])
  })
})
