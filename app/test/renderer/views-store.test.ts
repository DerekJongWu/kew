import { describe, it, expect } from 'vitest'
import { createViewsStore } from '../../src/renderer/src/lib/views-store'
import { toggleFilter, updateView } from '../../src/renderer/src/lib/pipeline'
import type { ViewDef } from '../../src/shared/api'

const v: ViewDef = {
  id: 'a',
  name: 'A',
  type: 'company',
  layout: 'board',
  groupBy: 'pipeline_status',
  filters: {},
  columns: ['name']
}

describe('views store', () => {
  it('keeps both of two rapid edits, saving in order from the latest views', async () => {
    const saved: ViewDef[][] = []
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const store = createViewsStore(async (views) => {
      if (saved.length === 0) await gate // the first save is slow
      saved.push(views)
    })
    store.sync([v])
    const a = store.edit((vs) =>
      updateView(vs, 'a', { filters: toggleFilter(vs[0].filters, 'source', 'intro') })
    )
    const b = store.edit((vs) =>
      updateView(vs, 'a', { filters: toggleFilter(vs[0].filters, 'stage', 'seed') })
    )
    const c = store.edit((vs) => updateView(vs, 'a', { layout: 'table' }))
    expect(store.get()![0]).toMatchObject({
      filters: { source: ['intro'], stage: ['seed'] },
      layout: 'table'
    })
    store.sync([v]) // a stale reload mid-save must not undo the edits
    expect(store.get()![0].layout).toBe('table')
    release()
    await Promise.all([a, b, c])
    expect(saved).toHaveLength(3)
    expect(saved.at(-1)![0]).toMatchObject({
      filters: { source: ['intro'], stage: ['seed'] },
      layout: 'table'
    })
    store.sync([{ ...v, name: 'From disk' }])
    expect(store.get()![0].name).toBe('From disk')
  })

  it('lets a failed save reject, keeps later saves going, and resyncs from disk after', async () => {
    let n = 0
    const store = createViewsStore(async () => {
      if (++n === 1) throw new Error('disk full')
    })
    store.sync([v])
    const a = store.edit((vs) => updateView(vs, 'a', { layout: 'table' }))
    const b = store.edit((vs) => updateView(vs, 'a', { name: 'B' }))
    await expect(a).rejects.toThrow('disk full')
    await b
    store.sync([v])
    expect(store.get()![0].layout).toBe('board')
  })
})
