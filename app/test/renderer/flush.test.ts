import { describe, it, expect, vi } from 'vitest'
import { createFlushRegistry } from '../../src/renderer/src/lib/flush'
import { saveDraft } from '../../src/renderer/src/lib/properties'
import { BodySync } from '../../src/renderer/src/lib/body-sync'

describe('flush registry', () => {
  it('runs every registered saver and waits for all of them, even if one fails', async () => {
    const reg = createFlushRegistry()
    const order: string[] = []
    reg.register(async () => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('slow')
    })
    reg.register(() => {
      throw new Error('boom')
    })
    reg.register(() => void order.push('sync'))
    await reg.flushAll()
    expect(order.sort()).toEqual(['slow', 'sync'])
  })
  it('forgets a saver once unregistered', async () => {
    const reg = createFlushRegistry()
    const fn = vi.fn()
    const off = reg.register(fn)
    off()
    await reg.flushAll()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('flush modes', () => {
  // A note editor's saver, wired as MarkdownEditor does: flush on close/quit, save otherwise.
  const editor = (): { sync: BodySync; writes: string[]; type(t: string): void } => {
    let doc = 'base'
    const writes: string[] = []
    const sync = new BodySync('base', {
      doc: () => doc,
      replace: (t) => void (doc = t),
      write: async (t) => void writes.push(t),
      onConflict: () => undefined,
      onError: () => undefined,
      delay: 800
    })
    return { sync, writes, type: (t) => void ((doc = t), sync.edited()) }
  }

  it('passes resolveConflicts through; closing defaults to resolving them', async () => {
    const reg = createFlushRegistry()
    const seen: boolean[] = []
    reg.register((o) => void seen.push(o.resolveConflicts))
    await reg.flushAll()
    await reg.flushAll({ resolveConflicts: false })
    expect(seen).toEqual([true, false])
  })

  it('an in-app save leaves an open conflict for the user; closing keeps their text', async () => {
    const reg = createFlushRegistry()
    const ed = editor()
    reg.register((o) => (o.resolveConflicts ? ed.sync.flush() : ed.sync.save()))
    ed.type('mine')
    ed.sync.incoming('theirs') // changed on disk while "mine" is unsaved: conflict
    await reg.flushAll({ resolveConflicts: false })
    expect(ed.writes).toEqual([]) // the conflict bar still decides
    await reg.flushAll()
    expect(ed.writes).toEqual(['mine']) // quit: "Keep mine", nothing typed is lost
    ed.sync.dispose()
  })

  it('an in-app save still writes pending text when there is no conflict', async () => {
    const reg = createFlushRegistry()
    const ed = editor()
    reg.register((o) => (o.resolveConflicts ? ed.sync.flush() : ed.sync.save()))
    ed.type('more')
    await reg.flushAll({ resolveConflicts: false })
    expect(ed.writes).toEqual(['more'])
    ed.sync.dispose()
  })
})

describe('saveDraft with flushAll', () => {
  it('flushAll resolves only after a slow field commit finishes', async () => {
    const reg = createFlushRegistry()
    const sent = { current: null as string | null }
    let finished = false
    const commit = (): Promise<boolean> =>
      new Promise((r) =>
        setTimeout(() => {
          finished = true
          r(true)
        }, 30)
      )
    reg.register(() => saveDraft(' $9M ', '', sent, commit))
    await reg.flushAll()
    expect(finished).toBe(true)
    expect(sent.current).toBe('$9M')
  })
  it('sends nothing when the draft matches, and clears `sent` when a commit fails so it can be retried', async () => {
    const sent = { current: null as string | null }
    let calls = 0
    const ok = async (): Promise<boolean> => (calls++, true)
    await saveDraft('a', 'a', sent, ok)
    expect(calls).toBe(0)
    await saveDraft('b', 'a', sent, async () => false)
    expect(sent.current).toBeNull()
    await saveDraft('b', 'a', sent, ok)
    await saveDraft('b', 'a', sent, ok) // already sent: not resent
    expect(calls).toBe(1)
  })
})
