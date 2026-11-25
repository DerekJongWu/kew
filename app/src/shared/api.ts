import type { Schema, SchemaChange } from '../core/schema/types'

export type {
  FieldType,
  OptionDef,
  FieldDef,
  TypeDef,
  Schema,
  SchemaChange
} from '../core/schema/types'

export type RecordType = 'company' | 'person' | 'meeting' | 'theme' | 'research'
export type FieldValue = string | number | boolean | string[] | null
export type StageCategory = 'new' | 'in-progress' | 'active' | 'closed'

export interface RecordSummary {
  id: string; type: RecordType; name: string; path: string   // path is vault-relative
  fields: Record<string, FieldValue>; problems: string[]
}
export interface OutreachEvent { personId: string; date: string; dir: 'out' | 'in' | 'note'; channel: string; text: string }
export interface OutreachState {
  state: 'reply-owed' | 'follow-up-due' | 'waiting' | 'none'
  dueDate: string | null; lastOutbound: string | null; lastInbound: string | null; reason: string
}
export interface TimelineItem { date: string; kind: 'outreach' | 'meeting' | 'created' | 'status'; text: string; recordId?: string }
export interface RecordDetail extends RecordSummary {
  body: string; backlinks: RecordSummary[]; timeline: TimelineItem[]
  outreach?: { events: OutreachEvent[]; state: OutreachState }        // people only
  people?: RecordSummary[]                                             // companies only
}
export interface TodayPerson { person: RecordSummary; company: RecordSummary | null; state: OutreachState }
export interface TodayData { followUps: TodayPerson[]; repliesOwed: TodayPerson[]; reachOut: RecordSummary[]; newInbound: RecordSummary[] }
export interface HistoryEntry { id: string; message: string; time: string; kind: 'action' | 'external' | 'undo'; files: string[]; undoable: boolean }
export interface ActionResult { entry: HistoryEntry; changedIds: string[] }
export interface DuplicateHit { record: RecordSummary; reason: 'name' | 'alias' | 'domain' | 'linkedin' }
export interface ViewDef { id: string; name: string; type: RecordType; layout: 'board' | 'table'; groupBy?: string; filters: Record<string, string[]>; columns: string[]; sort?: { field: string; dir: 'asc' | 'desc' } }
export interface SearchHit { record: RecordSummary; snippet: string }
export interface ListQuery { filters?: Record<string, string[]>; sort?: { field: string; dir: 'asc' | 'desc' }; text?: string }
export interface VaultInfo { root: string; name: string; isSample: boolean; schemaError: string | null }
export interface RecentVault { root: string; exists: boolean }
export interface SetupPlan { root: string; willCreate: string[]; existingNotes: number }
// Schema types (FieldDef, TypeDef, Schema, SchemaChange) are re-exported above from core/schema/types.ts.

export interface KewApi {
  // app + vault lifecycle
  getState(): Promise<{ vault: VaultInfo | null; recent: RecentVault[] }>
  planSetup(root: string): Promise<SetupPlan>
  createVault(kind: 'sample' | 'empty', root?: string): Promise<VaultInfo>
  openVault(root: string): Promise<VaultInfo>
  chooseFolder(): Promise<string | null>
  // queries
  today(): Promise<TodayData>
  list(type: RecordType, q?: ListQuery): Promise<RecordSummary[]>
  get(id: string): Promise<RecordDetail | null>
  search(text: string, limit?: number): Promise<SearchHit[]>
  schema(): Promise<Schema>
  views(): Promise<ViewDef[]>
  history(limit?: number): Promise<HistoryEntry[]>
  // commands
  createRecord(type: RecordType, name: string, fields?: Record<string, FieldValue>, force?: boolean): Promise<ActionResult | { duplicates: DuplicateHit[] }>
  setFields(id: string, changes: Record<string, FieldValue>): Promise<ActionResult>
  setBody(id: string, body: string): Promise<ActionResult>
  rename(id: string, name: string): Promise<ActionResult>
  logOutreach(personId: string, e: { dir: 'out' | 'in' | 'note'; channel: string; text: string; date?: string }): Promise<ActionResult>
  weMet(personId: string): Promise<ActionResult>
  passCompany(id: string, reason: string): Promise<ActionResult>
  snooze(id: string, until: string): Promise<ActionResult>          // person: next_follow_up; company: reach_out_on
  changeSchema(change: SchemaChange): Promise<ActionResult>
  affectedCount(change: SchemaChange): Promise<number>               // notes a schema change would rewrite
  saveViews(views: ViewDef[]): Promise<ActionResult>
  undo(entryId: string): Promise<ActionResult>
  rebuildIndex(): Promise<void>
  openInFinder(id: string): Promise<void>
  revealVault(): Promise<void>                                       // show the vault folder in Finder
  // events
  onChanged(cb: (changedIds: string[]) => void): () => void
  onMenuUndo(cb: () => void): () => void                              // Edit > Undo / ⌘Z from the app menu
  onMenuRedo(cb: () => void): () => void                              // Edit > Redo / ⇧⌘Z: redo typing in the focused field
  onFlush(cb: () => Promise<void>): () => void                        // window close / quit: save pending edits, then main proceeds
}
