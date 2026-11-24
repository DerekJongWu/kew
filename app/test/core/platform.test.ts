import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

describe('platform', () => {
  it('node:sqlite supports FTS5', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('create virtual table docs using fts5(body)')
    db.prepare('insert into docs (body) values (?)').run('hello world')
    const rows = db.prepare('select body from docs where docs match ?').all('hello')
    expect(rows).toHaveLength(1)
    db.close()
  })
})
