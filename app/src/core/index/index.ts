import { openDb, type Db } from './db'
import * as q from './queries'
import { indexFile, rebuild, removeFile } from './indexer'
import type {
  DuplicateHit, FieldValue, ListQuery, RecordDetail, RecordSummary, RecordType, SearchHit, TodayData
} from '../../shared/api'
import type { Schema } from '../schema/types'

// Derived SQLite index over the vault. Safe to delete: rebuild() recreates it.
// Remembers the schema from the last indexFile/rebuild for stage-category lookups.
export class Index {
  private schema: Schema | null = null
  constructor(private db: Db) {}

  private s(): Schema {
    if (!this.schema) throw new Error('Index has no schema yet; call rebuild or indexFile first')
    return this.schema
  }

  indexFile(rel: string, text: string, schema: Schema): void {
    this.schema = schema
    indexFile(this.db, rel, text, schema)
  }
  removeFile(rel: string): void { removeFile(this.db, rel) }
  async rebuild(root: string, schema: Schema): Promise<void> {
    this.schema = schema
    await rebuild(this.db, root, schema)
  }
  resolveName(name: string): RecordSummary | null { return q.resolveName(this.db, name) }
  byId(id: string): RecordSummary | null { return q.byId(this.db, id) }
  byPath(rel: string): RecordSummary | null { return q.byPath(this.db, rel) }
  list(type: RecordType, query?: ListQuery): RecordSummary[] { return q.list(this.db, type, query) }
  detail(id: string, root: string, today: string): RecordDetail | null { return q.detail(this.db, this.s(), id, root, today) }
  backlinks(id: string): RecordSummary[] { return q.backlinks(this.db, id) }
  today(date: string): TodayData { return q.today(this.db, this.s(), date) }
  search(text: string, limit = 20): SearchHit[] { return q.search(this.db, text, limit) }
  findDuplicates(type: RecordType, name: string, fields: Record<string, FieldValue>): DuplicateHit[] {
    return q.findDuplicates(this.db, type, name, fields)
  }
  allNames(): Set<string> { return q.allNames(this.db) }
  close(): void { this.db.close() }
}

export const openIndex = (file: string): Index => new Index(openDb(file))
