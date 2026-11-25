import { describe, it, expect } from 'vitest'
import { unwrap, wrapBridge } from '../../src/renderer/src/lib/bridge'
import { KEW_METHODS, type KewBridge } from '../../src/shared/methods'

describe('unwrap', () => {
  it('returns the value of a value envelope', () => {
    expect(unwrap({ value: 42 })).toBe(42)
  })
  it('throws an Error that keeps its name, and the path when given', () => {
    const run = (): unknown =>
      unwrap({ error: { name: 'FolderNotEmptyError', message: 'nope', path: '/a' } })
    expect(run).toThrow(
      expect.objectContaining({ name: 'FolderNotEmptyError', message: 'nope', path: '/a' })
    )
    try {
      run()
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
    }
  })
})

describe('wrapBridge', () => {
  it('unwraps every method and passes listeners through', async () => {
    const onChanged = (): (() => void) => () => undefined
    const onMenuUndo = (): (() => void) => () => undefined
    const bridge = Object.fromEntries(
      KEW_METHODS.map((m) => [
        m,
        async (...a: unknown[]) =>
          m === 'today'
            ? { error: { name: 'NoVaultError', message: 'No vault is open' } }
            : { value: [m, a] }
      ])
    ) as unknown as KewBridge
    const api = wrapBridge({
      ...bridge,
      onChanged,
      onMenuUndo,
      onMenuRedo: onMenuUndo,
      onFlush: onMenuUndo
    })
    expect(await api.planSetup('/x')).toEqual(['planSetup', ['/x']])
    await expect(api.today()).rejects.toMatchObject({ name: 'NoVaultError' })
    expect(api.onChanged).toBe(onChanged)
    expect(api.onMenuRedo).toBe(onMenuUndo)
  })
})
