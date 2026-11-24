// The only module that imports node:sqlite. Small wrapper with a statement cache and nestable transactions.
import { DatabaseSync, type StatementSync, type SQLInputValue } from 'node:sqlite'

export type Row = Record<string, unknown>
export type Param = SQLInputValue

export class Db {
  private raw: DatabaseSync
  private cache = new Map<string, StatementSync>()
  private depth = 0

  constructor(file: string) {
    this.raw = new DatabaseSync(file)
  }

  exec(sql: string): void {
    this.raw.exec(sql)
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql)
    if (!s) {
      s = this.raw.prepare(sql)
      this.cache.set(sql, s)
    }
    return s
  }

  run(sql: string, ...params: Param[]): void {
    this.stmt(sql).run(...params)
  }

  all<T extends Row = Row>(sql: string, ...params: Param[]): T[] {
    return this.stmt(sql).all(...params) as T[]
  }

  get<T extends Row = Row>(sql: string, ...params: Param[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined
  }

  // Runs fn inside a transaction; nested calls join the outer one.
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn()
    this.raw.exec('BEGIN')
    this.depth++
    try {
      const result = fn()
      this.raw.exec('COMMIT')
      return result
    } catch (e) {
      this.raw.exec('ROLLBACK')
      throw e
    } finally {
      this.depth--
    }
  }

  close(): void {
    this.cache.clear()
    this.raw.close()
  }
}

export function openDb(file: string): Db {
  const db = new Db(file)
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, type TEXT NOT NULL, name TEXT NOT NULL,
      fields TEXT NOT NULL, problems TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_type ON records(type);
    CREATE TABLE IF NOT EXISTS names (key TEXT NOT NULL, id TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS names_key ON names(key);
    CREATE INDEX IF NOT EXISTS names_id ON names(id);
    CREATE TABLE IF NOT EXISTS links (src TEXT NOT NULL, target TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS links_target ON links(target);
    CREATE INDEX IF NOT EXISTS links_src ON links(src);
    CREATE TABLE IF NOT EXISTS events (person_id TEXT NOT NULL, date TEXT NOT NULL, dir TEXT NOT NULL, channel TEXT NOT NULL, text TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_person ON events(person_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(name, aliases, body);
  `)
  return db
}
