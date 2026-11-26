# Kew Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A packaged, local-only Mac app that runs the Kew core loop (Today, Pipeline, Company and Person records, outreach, basic Meetings/Themes/Research) on a markdown vault, with a durable data foundation and a polished UI.

**Architecture:** A pure-TypeScript data core (`app/src/core`, no Electron imports) owns the vault: parsing, schema, SQLite index, the single write path, and an isomorphic-git undo history stored outside the vault. Electron's main process wraps it in a `Vault` service and exposes a typed API to a React renderer through the preload script. The renderer never touches the file system.

**Tech Stack:** Electron 45, electron-vite 6, React 19, TypeScript (strict), Vitest, `node:sqlite` (built-in, FTS5), `isomorphic-git`, `yaml`, `zod`, `ulid`, `chokidar`, CodeMirror 6, `cmdk`, `@dnd-kit/core`, electron-builder, Playwright (`_electron`) for the smoke test.

**Spec:** `docs/superpowers/specs/2026-11-24-kew-core-loop-design.md` (read it before any task). Product context: `SPEC.md`. Screen layouts: `design/wireframes/*.dc.html`. Prototype to port from: `https://github.com/DerekJongWu/brain-desk` (`lib/note.js`, `lib/vault.js`, `test/run.js`).

## Global Constraints

- macOS only (Apple Silicon and Intel). No Windows/Linux work.
- No network calls anywhere in the app. No Claude, no telemetry, no update checks.
- Nothing in `app/src/core` imports `electron`. Core runs under plain Node for tests.
- The renderer has `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; all vault access goes through `window.kew` (preload).
- Only the write path (`app/src/core/write/`) writes inside the vault. Writes are atomic (temp file in the same directory + rename).
- No `.git` folder inside the vault. History gitdir: `<userData>/vaults/<vaultKey>/history.git`. Index: `<userData>/vaults/<vaultKey>/index.sqlite`. `vaultKey` = first 16 hex chars of sha256 of the vault's absolute real path.
- Notes stay Obsidian-compatible: `<Folder>/<name>.md`, YAML frontmatter, relations stored as `"[[Name]]"` strings.
- Edits never change bytes outside the lines they target; unknown frontmatter keys are preserved exactly.
- Dates are `YYYY-MM-DD` strings in local time. Every core function that needs "today" takes it as a parameter; nothing in core calls `new Date()` for business logic.
- Folder per type: company → `Companies`, person → `People`, meeting → `Meetings`, theme → `Themes`, research → `Research`. Templates in `Templates/<Type>.md`. Schema at `.kew/schema.yaml`, views at `.kew/views.yaml`.
- Text contrast ≥ 4.5:1 in both themes; real `<button>`/`<input>` elements; visible focus states.
- Commit format for this repo: `[code] <summary>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Hand-edited notes with odd YAML** (comments, block lists, CRLF line endings, missing frontmatter, a `---` inside the body): the app reads them and edits only target lines. Test in Task 2.
2. **A file edited in Obsidian between the app reading it and writing it:** the app re-applies its change on the new content or refuses; the hand edit is never lost and is in history first. Test in Task 9.
3. **Names with characters illegal in file names or duplicate names across types** (`Acme / Labs`, a person and company both called "Orbit"): the file is created with a safe, unique name and links resolve. Test in Tasks 3 and 9.
4. **A broken `.kew/schema.yaml` after a hand edit:** the app keeps working on the last valid schema, shows the error, and never overwrites the user's file. Test in Task 4.
5. **Opening a large or messy existing folder** (non-note files, notes of unknown type, 2,000 notes): setup lists what it will add, ignores other files, and indexing stays under 5 seconds for 2,000 notes. Test in Tasks 7 and 12.

---

## File structure

```
app/
  package.json  electron.vite.config.ts  electron-builder.yml  tsconfig*.json  vitest.config.ts
  INSTALL.md
  src/
    shared/api.ts            # DTOs + KewApi interface shared by main, preload, renderer
    core/
      note.ts                # frontmatter/section parsing and line-preserving edits (port)
      names.ts  ids.ts       # normalizers, file names, ULIDs
      links.ts               # wikilink parse/resolve/rewrite
      outreach.ts            # log line parsing + follow-up rules
      schema/{types,defaults,load,validate}.ts
      index/{db,indexer,queries}.ts
      history.ts
      write/{apply,records,workflow,schema-changes}.ts
      vault.ts               # Vault service composing everything
      setup.ts               # new vault / open folder setup
      sample.ts              # sample vault generator
      templates/*.md         # default templates (imported as raw strings)
    main/{index,ipc,settings,watcher}.ts
    preload/index.ts
    renderer/
      main.tsx  App.tsx  router.ts  api.ts (typed window.kew + hooks)
      styles/{tokens,base}.css
      components/…           # Sidebar, CommandBar, StatusLine, PropertyPanel, FieldInput, DataTable, Board, …
      screens/…              # Onboarding, Today, Pipeline, RecordList, RecordPage, Search, SettingsFields, SettingsVault
  test/
    fixtures/vaults/{messy,basic}/…
    core/*.test.ts
    e2e/smoke.test.ts
```

## Shared types (Task 1 creates `app/src/shared/api.ts` with exactly these)

```ts
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
export interface SetupPlan { root: string; willCreate: string[]; existingNotes: number }
// Schema types (FieldDef, TypeDef, Schema, SchemaChange) are re-exported from core/schema/types.ts — see Task 4.

export interface KewApi {
  // app + vault lifecycle
  getState(): Promise<{ vault: VaultInfo | null; recent: string[] }>
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
  saveViews(views: ViewDef[]): Promise<ActionResult>
  undo(entryId: string): Promise<ActionResult>
  rebuildIndex(): Promise<void>
  openInFinder(id: string): Promise<void>
  // events
  onChanged(cb: (changedIds: string[]) => void): () => void
}
```

---

### Task 1: Scaffold the app and prove the platform

**Files:**
- Create: `app/` via electron-vite's `react-ts` template, then `app/src/shared/api.ts` (types above), `app/vitest.config.ts`, `app/test/core/platform.test.ts`
- Modify: root `.gitignore` (add `app/node_modules`, `app/out`, `app/dist`)

**Interfaces:**
- Produces: `npm run dev`, `npm test` (Vitest, node environment, `test/**/*.test.ts`), `npm run typecheck`, `npm run build`; `app/src/shared/api.ts`.

- [ ] **Step 1:** `cd app && npm create @quick-start/electron@latest . -- --template react-ts`, pin `electron@45.4.1`, add `vitest`, `yaml`, `zod`, `ulid`, `isomorphic-git`, `chokidar`. Set `"strict": true` in all tsconfigs. Set main window `webPreferences` to the Global Constraints values.
- [ ] **Step 2: Write the platform test** `test/core/platform.test.ts`: opens `new DatabaseSync(':memory:')` from `node:sqlite`, creates an `fts5` table, inserts `'hello world'`, asserts `match 'hello'` returns 1 row.
- [ ] **Step 3:** Run `npm test` → PASS.
- [ ] **Step 4: Prove `node:sqlite` loads inside Electron.** Add a temporary log in `src/main/index.ts` that runs the same FTS5 query on startup; `npm run dev`; expect `fts5 ok` in the terminal. Remove the log.
  - If it fails (Electron's Node lacks `node:sqlite` or FTS5): switch the index to `better-sqlite3` (add `@electron/rebuild`, run Vitest via `ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs`), keep the `SqliteDb` wrapper interface from Task 7 so nothing else changes, and note the switch in the commit message.
- [ ] **Step 5:** `npm run typecheck && npm test` → both pass. Commit `[code] Scaffold Kew app (Electron, React, TypeScript, Vitest)`.

### Task 2: Note parsing and line-preserving edits

**Files:**
- Create: `app/src/core/note.ts`, `app/test/core/note.test.ts`, `app/test/fixtures/vaults/messy/` (at least: a note with YAML comments and block lists, a CRLF note, a note with no frontmatter, a note whose body contains `---`, a note with an unquoted `: ` value that breaks YAML)

**Interfaces:**
- Produces:
  - `parseNote(text: string): { fm: Record<string, FieldValue>; body: string; ok: boolean; error?: string; eol: '\n' | '\r\n' }`
  - `setKeys(text: string, changes: Record<string, FieldValue | undefined>): string` (undefined removes the key)
  - `setBody(text: string, body: string): string`
  - `readList(text: string, heading: string): string[]`
  - `appendToSection(text: string, heading: string, item: string, opts?: { before?: string }): string` (creates the section if missing, before `opts.before` if given, else at the end)
  - `scalar(v: FieldValue): string` (the prototype's quoting rule)
  - `newNote(fm: Record<string, FieldValue>, body: string): string`

Port from the prototype's `lib/note.js`, keeping its behavior and its test cases from `test/run.js`.

- [ ] **Step 1: Write failing tests**, including:
  - `setKeys` on each messy fixture changes only the target line: `diffLines(before, after)` has exactly the expected changed lines.
  - preserves CRLF: output contains no lone `\n` when input was CRLF.
  - lists written as flow style: `setKeys(t, { themes: ['[[A]]', '[[B]]'] })` → line `themes: ['[[A]]', '[[B]]']`; replacing a block list removes its indented lines.
  - `scalar('AI: agents')` → `'AI: agents'` quoted; `scalar("O'Brien")` → `O'Brien` unquoted; `scalar('- dash')` quoted; `scalar('true')` quoted.
  - `parseNote` on the broken-YAML fixture returns `ok: false` with an error and does not throw; `setKeys` on it throws `NoteParseError`.
  - a body containing `---` is not treated as frontmatter end.
  - `appendToSection(t, '## Outreach log', '- 2026-11-24, out · email: hi', { before: '## Notes' })` inserts before `## Notes`, and appends to an existing section's end.
- [ ] **Step 2:** `npx vitest run test/core/note.test.ts` → FAIL.
- [ ] **Step 3:** Implement `app/src/core/note.ts` (use `yaml`'s `parse` with the core schema for reading; edits are line-based as in the prototype).
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit `[code] Port line-preserving note editing to TypeScript`.

### Task 3: Names and IDs

**Files:**
- Create: `app/src/core/ids.ts`, `app/src/core/names.ts`, `app/test/core/names.test.ts`

**Interfaces:**
- Produces:
  - `newId(): string` (ULID)
  - `normName(s: string): string`, `bareDomain(s: string): string`, `linkedinSlug(s: string): string` (ported verbatim in behavior from prototype `lib/vault.js`)
  - `safeFilename(s: string): string`
  - `meetingName(date: string, subject: string, meetingType?: string): string` → `"2026-11-18 Quill Security intro"`
  - `uniqueName(name: string, type: RecordType, taken: (candidate: string) => boolean, context?: { company?: string }): string` — people get `" (<company>)"`, others `" (<type>)"`; if still taken, append ` 2`, ` 3`…

- [ ] **Step 1: Failing tests:** `normName('Acme Labs, Inc.') === normName('acme')`; `bareDomain('https://www.acme.io/about') === 'acme.io'`; `linkedinSlug('https://linkedin.com/in/jane-doe/?x=1') === 'jane-doe'`; `safeFilename('Acme / Labs: AI') === 'Acme - Labs- AI'`; `uniqueName('Orbit', 'person', n => n === 'Orbit', { company: 'Orbit Data' }) === 'Orbit (Orbit Data)'`; `uniqueName('Orbit', 'theme', n => n === 'Orbit') === 'Orbit (theme)'`; `newId()` matches `/^[0-9A-HJKMNP-TV-Z]{26}$/`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `[code] Add name normalizers, file naming and IDs`.

### Task 4: Schema

**Files:**
- Create: `app/src/core/schema/types.ts`, `defaults.ts`, `load.ts`, `validate.ts`, `app/test/core/schema.test.ts`

**Interfaces:**
- Produces (in `types.ts`, re-exported from `shared/api.ts`):
  ```ts
  type FieldType = 'text'|'number'|'date'|'select'|'multi-select'|'stage'|'relation'|'url'|'checkbox'
  interface OptionDef { value: string; label: string; category?: StageCategory }
  interface FieldDef { key: string; label: string; type: FieldType; tier: 'system'|'starter'|'custom'; options?: OptionDef[]; target?: RecordType | 'any'; multiple?: boolean }
  interface TypeDef { folder: string; template: string; fields: FieldDef[] }
  interface Schema { version: number; types: Record<RecordType, TypeDef> }
  type SchemaChange =
    | { kind: 'add-field'; type: RecordType; field: FieldDef }
    | { kind: 'update-field'; type: RecordType; key: string; label?: string; options?: OptionDef[] }   // options: full new list; renamed values carry `renamedFrom`
    | { kind: 'rename-field'; type: RecordType; from: string; to: string }
    | { kind: 'delete-field'; type: RecordType; key: string }
  ```
  (`OptionDef` in `update-field` may carry `renamedFrom?: string`.)
- `DEFAULT_SCHEMA: Schema` in `defaults.ts`: exactly the fields in the spec's "Default fields" table, including `source` options `intro, email, event, linkedin, inbound-form, other`, and `pipeline_status` options/categories from the spec's schema example. `stage` options: `pre-seed, seed, series-a, series-b, growth`. `conviction`: `high, medium, low`. `round_status`: `tracking, raising`. `deal_sheet`: `yes, sent`. `category` (person): `founder, vc, operator, lp, other`. `channel`: `linkedin, email`. `meeting_type`: `intro, follow-up, diligence, reference, other`. `research.kind`: `note, screen`. `research.topic`: `team, market, financials, product, references`.
- `loadSchema(text: string, lastValid: Schema | null): { schema: Schema; error: string | null }` — zod-validates; on error returns `lastValid ?? DEFAULT_SCHEMA` plus the message.
- `serializeSchema(s: Schema): string`
- `validateFields(schema: Schema, type: RecordType, fm: Record<string, FieldValue>): string[]` — problems like `"stage: 'seed-ish' is not an option"`; unknown keys are not problems.
- `coerceValue(field: FieldDef, v: FieldValue): FieldValue` — throws `ValidationError` for invalid values on write.

- [ ] **Step 1: Failing tests:** default schema round-trips through `serializeSchema`/`loadSchema` unchanged; broken YAML returns `lastValid` and a non-empty error; deleting a system field in YAML is reported as an error; `validateFields` flags a bad select value and ignores unknown keys; `coerceValue` rejects `'2026-13-01'` for a date and `'maybe'` for a checkbox.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS.
- [ ] **Step 5:** Commit `[code] Add user-editable schema with validation and fallback`.

### Task 5: Links

**Files:**
- Create: `app/src/core/links.ts`, `app/test/core/links.test.ts`

**Interfaces:**
- Produces:
  - `extractLinks(text: string): string[]` — targets of `[[Target]]`, `[[Target|alias]]`, `[[Target#heading]]` in body and frontmatter values.
  - `rewriteLinks(text: string, from: string, to: string): string` — rewrites target only, keeps `|alias` and `#heading`; case-insensitive match on target.
  - `linkValue(name: string): string` → `[[name]]`; `unlink(v: string): string` (strips brackets).

- [ ] **Step 1: Failing tests** for all three link forms, rewrite inside frontmatter lists and body, no rewrite of `[[Orbital]]` when renaming `Orbit`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `[code] Add wikilink parsing and rewriting`.

### Task 6: Outreach log and follow-up rules

**Files:**
- Create: `app/src/core/outreach.ts`, `app/test/core/outreach.test.ts`

**Interfaces:**
- Produces:
  - `parseLog(text: string, personId: string): OutreachEvent[]` — reads `## Outreach log` lines `- YYYY-MM-DD, (out|in|note) · <channel>: <text>`; malformed lines are skipped.
  - `logProblems(text: string): string[]` — one message per malformed log line (surfaced in `RecordSummary.problems`).
  - `formatLogLine(e: Omit<OutreachEvent, 'personId'>): string`
  - `computeOutreach(input: { met: boolean; cadenceDays: number | null; nextFollowUp: string | null; companyClosed: boolean; lastMeeting: string | null }, events: OutreachEvent[], today: string): OutreachState`

Rules (from the spec's "Follow-up and reply rules", in order; events keep log order, so the last line wins same-day ties):
1. `companyClosed && !met` → `none`.
2. Latest `in`/`out` event is `in` → `reply-owed`, `dueDate = nextFollowUp ?? that date`.
3. Latest is `out` and `cadenceDays` set → `dueDate = nextFollowUp ?? out + cadenceDays`; `follow-up-due` if `dueDate <= today` else `waiting`.
4. `met` and `cadenceDays` set → last touch = max(latest event of any dir, `lastMeeting`); `dueDate = nextFollowUp ?? lastTouch + cadenceDays`; due/waiting as above. No touches at all → `none`.
5. Otherwise `none`.
`reason` is human copy: `"You messaged on LinkedIn 14 days ago, no reply"`, `"They replied by email today"`, `"Met 30 days ago, cadence 30 days"`.

- [ ] **Step 1: Failing tests**, one per rule plus: same-day `out` then `in` → `reply-owed`; same-day `in` then `out` → `waiting`/due by cadence; `nextFollowUp` earlier than computed wins; snoozed reply (`nextFollowUp` in the future) has `dueDate` = that date; no cadence and latest `out` → `none`; `formatLogLine` output parses back to the same event.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `[code] Add outreach log parsing and follow-up rules`.

### Task 7: Index

**Files:**
- Create: `app/src/core/index/db.ts`, `indexer.ts`, `queries.ts`, `app/test/core/index.test.ts`, `app/test/fixtures/vaults/basic/` (schema default; 4 companies across stages, 4 people with logs incl. one unmet founder of a passed company, 1 meeting, 1 theme, 1 research note, 1 `.png`, 1 note in an unknown folder)

**Interfaces:**
- Consumes: `parseNote`, `extractLinks`, `unlink`, `parseLog`, `computeOutreach`, `validateFields`, `Schema`.
- Produces:
  - `openIndex(file: string): Index` (`':memory:'` allowed); `class Index` wrapping `node:sqlite` with:
  - `indexFile(rel: string, text: string, schema: Schema): void`, `removeFile(rel: string): void`, `rebuild(root: string, schema: Schema): Promise<void>` (walks the five type folders only; skips non-`.md`)
  - `resolveName(name: string): RecordSummary | null` (name or alias, case-insensitive); `byId(id)`, `byPath(rel)`
  - `list(type, q?: ListQuery): RecordSummary[]`; `detail(id, root): RecordDetail | null`; `backlinks(id): RecordSummary[]`
  - `today(date: string): TodayData` — follow-ups and replies from `computeOutreach` over people (`lastMeeting` = latest `date` of meetings listing the person in `attendees`; `companyClosed` from their company's status category); `reachOut` = companies with `reach_out_on <= date` and status category not `closed`; `newInbound` = companies whose status category is `new`, newest `first_seen` first.
  - `search(text, limit): SearchHit[]` (FTS5 over name, aliases, body; snippet via `snippet()`)
  - `findDuplicates(type, name, fields): DuplicateHit[]` (normName on name and aliases; `bareDomain(website)`; `linkedinSlug(linkedin)`)
  - `allNames(): Set<string>` (lower-cased, for `uniqueName`)
  - Notes without an `id` get a stable synthetic id `path:<rel>` until the write path assigns a real one.

- [ ] **Step 1: Failing tests** against `fixtures/vaults/basic` with `today = '2026-11-24'`: record counts per type; the `.png` and unknown-folder note are ignored; `resolveName` finds by alias; backlinks of the theme include the companies tagging it; `today()` has the exact expected people in each list and excludes the unmet founder of the passed company; FTS search for a word only in a body returns that record; `findDuplicates('company', 'Quill Security Inc', { website: 'https://www.quill.example' })` returns the existing record with reason `domain` or `name`.
- [ ] **Step 2: Performance test:** generate 2,000 notes into a temp dir; `rebuild` completes in < 5000 ms.
- [ ] **Step 3–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `[code] Add SQLite index with queries, search and duplicates`.

### Task 8: History

**Files:**
- Create: `app/src/core/history.ts`, `app/test/core/history.test.ts`

**Interfaces:**
- Produces `class History`:
  - `static open(gitdir: string, root: string): Promise<History>` (inits if missing; first open commits the whole vault as `"Initial state"`, kind `external`)
  - `commitExternal(paths: string[]): Promise<HistoryEntry | null>` — commits these paths if they differ from HEAD; message `"External edits"`.
  - `commitAction(paths: string[], message: string, kind?: 'action' | 'undo'): Promise<HistoryEntry>` — stages adds, modifications and deletions for exactly these paths.
  - `list(limit: number): Promise<HistoryEntry[]>` — newest first; `undoable` = kind is not `external` and every file of the entry currently matches its content at that commit.
  - `undo(entryId: string): Promise<{ paths: string[]; message: string }>` — for each file of the entry: if current content ≠ content at the entry's commit → throw `UndoConflictError(path)`; else restore the parent commit's version (delete if it didn't exist). Returns paths for the caller to commit as `"Undid: <message>"`, kind `undo`.
  - Kind is stored as a commit trailer `Kew-Kind: action|external|undo`. Author `Kew <kew@localhost>`.

- [ ] **Step 1: Failing tests** in a temp vault: gitdir is outside the vault and no `.git` appears in the vault; action → list shows it undoable; undo restores previous bytes exactly; undo of a create deletes the file; undo after a hand edit to the same file throws `UndoConflictError` and the hand edit is intact; undoing an undo entry re-applies the change (redo); `commitExternal` on unchanged paths returns null.
- [ ] **Step 2–4:** FAIL → implement with `isomorphic-git` (`git.add`, `git.remove`, `git.commit`, `git.log`, `git.readBlob`, `git.walk` or `git.statusMatrix` scoped to paths) → PASS.
- [ ] **Step 5:** Commit `[code] Add local undo history outside the vault`.

### Task 9: Write path and record commands

**Files:**
- Create: `app/src/core/write/apply.ts`, `app/src/core/write/records.ts`, `app/test/core/write.test.ts`

**Interfaces:**
- Consumes: `History`, `Index`, `note.ts`, `names.ts`, `links.ts`, `schema/validate.ts`.
- Produces:
  - `interface Ctx { root: string; schema: () => Schema; index: Index; history: History; today: () => string; templates: Record<RecordType, string> }`
  - `interface FileEdit { path: string; apply: (current: string | null) => string | null; newPath?: string }` (`null` result deletes; `newPath` renames)
  - `applyAction(ctx: Ctx, message: string, edits: FileEdit[]): Promise<ActionResult>` — the only function that writes vault files. Order: read all targets with a content hash → `history.commitExternal(paths)` → compute results → immediately before writing, re-read; if a hash changed, recompute once from the new content; if it changes again throw `ConflictError` → atomic write/rename/delete → `history.commitAction` → `index.indexFile/removeFile` for each path → return `changedIds`.
  - In `records.ts`:
    - `createRecord(ctx, type, name, fields?, force?): Promise<ActionResult | { duplicates: DuplicateHit[] }>` — duplicate check unless `force`; name through `safeFilename` + `uniqueName`; frontmatter `id`, `type`, `name`, given fields (coerced), plus `first_seen: today` for companies and `created: today` for research; body from the type's template (template frontmatter, if any, merged under given fields). Message `"Created <name>"`.
    - `setFields(ctx, id, changes)` — coerces each value via the schema (throws `ValidationError`, nothing written); assigns `id` if the note lacked one. Message: `"Set <label> on <name>"` for one field, `"Updated <name>"` for several; a `pipeline_status` change reads `"Moved <name> to <option label>"`.
    - `setBody(ctx, id, body)` — message `"Edited <name>"`.
    - `rename(ctx, id, newName)` — renames file, updates `name`, rewrites links in every note that `extractLinks` shows referencing the old name; one action, message `"Renamed <old> to <new>"`.

- [ ] **Step 1: Failing tests** (temp copy of `basic` vault): create writes the expected file with an id and template body and returns duplicates for a known domain unless forced; a name with `/` and a cross-type clash produce safe unique file names; `setFields` changes only the target lines (byte diff); invalid value throws and writes nothing; rename rewrites links in 2 other notes and undo restores all 3 files and the old file name; **hand edit race:** simulate a hand edit between read and write (inject via a test hook on `applyAction`) → the action applies on top of the new content, history shows "External edits" before the action, and the hand edit survives.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `[code] Add the single write path and record commands`.

### Task 10: Workflow commands

**Files:**
- Create: `app/src/core/write/workflow.ts`, `app/test/core/workflow.test.ts`

**Interfaces:**
- Consumes: `applyAction`, `Ctx`, `formatLogLine`, `appendToSection`, `setKeys`.
- Produces (each one `applyAction` call, so one undoable entry):
  - `logOutreach(ctx, personId, e)` — appends the log line (section `## Outreach log`, created before `## Notes` if missing), clears `next_follow_up`; if `e.dir === 'out'` and this is the person's first `out` and their company's status is `new` or `pursuing`, sets the company to `reached-out` in the same action. Message: `"Logged a send to <name>"` / `"Logged a reply from <name>"` / `"Added a note on <name>"`.
  - `weMet(ctx, personId)` — `met: true`; company with status category `new` or `in-progress` → `active`. Message `"Met <name>"`.
  - `passCompany(ctx, id, reason)` — `pipeline_status: passed`, `pass_reason: reason`. Message `"Passed on <name>"`.
  - `snooze(ctx, id, until)` — person → `next_follow_up`; company → `reach_out_on`. Message `"Snoozed <name> until <until>"`.

- [ ] **Step 1: Failing tests:** first send to a founder of a `new` company changes both files in one history entry and undo reverts both; second send doesn't touch the company; send to a person whose company is `active` doesn't move it; `weMet` on a founder of a `reached-out` company → `active`, of a `passed` company → unchanged; after `passCompany`, `index.today()` no longer lists that company's unmet people; logging an event clears `next_follow_up`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `[code] Add outreach and pipeline workflow commands`.

### Task 11: Schema changes and saved views

**Files:**
- Create: `app/src/core/write/schema-changes.ts`, `app/test/core/schema-changes.test.ts`

**Interfaces:**
- Produces:
  - `changeSchema(ctx, change: SchemaChange): Promise<ActionResult>` — one action that writes `.kew/schema.yaml` and every affected note:
    - `add-field`: schema only. Key must be unique and match `/^[a-z][a-z0-9_]*$/`.
    - `update-field`: labels/options; each option with `renamedFrom` rewrites that value in every note of the type (select and multi-select). Removing an option that notes still use is refused with `ValidationError` naming the count.
    - `rename-field`: rewrites the key in every note of the type (line-preserving).
    - `delete-field`: refused for `system`; otherwise removes the key from every note.
    - Message: `"Renamed field Stage to Round stage (14 notes)"` style.
  - `affectedCount(ctx, change): number` (for the confirmation copy in Settings).
  - `loadViews(text: string | null): ViewDef[]` with defaults when missing — Pipeline views `Inbound` (status category new/in-progress), `Active deals` (active), `Passed` (closed), `All companies`; `saveViews(ctx, views)` writes `.kew/views.yaml` through `applyAction`.

- [ ] **Step 1: Failing tests:** renaming option `reached-out` → `contacted` rewrites only notes using it and undo reverts all; renaming a field key preserves values and other lines; deleting a system field is refused; removing an in-use option is refused with the count; `affectedCount` matches files changed.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `[code] Add schema editing that migrates notes`.

### Task 12: Vault service, setup and sample vault

**Files:**
- Create: `app/src/core/vault.ts`, `app/src/core/setup.ts`, `app/src/core/sample.ts`, `app/src/core/templates/{Company,Person,Meeting,Theme,Research}.md`, `app/test/core/vault.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `class Vault` with `static open(root: string, dataDir: string, opts?: { today?: () => string }): Promise<Vault>` (loads schema with last-valid fallback stored at `<dataDir>/last-schema.yaml`, opens index and history, rebuilds the index if empty or schema version changed), `close()`, `info(): VaultInfo`, every query and command method in `KewApi` from `today()` through `rebuildIndex()` with the same names and types, and `onExternalChange(paths: string[]): string[]` (re-index; reload schema if `.kew/schema.yaml` changed; returns changed ids).
  - `planSetup(root: string): Promise<SetupPlan>` — lists missing folders, templates, `.kew/schema.yaml`; counts existing `.md` notes.
  - `setupVault(root: string): Promise<void>` — creates only what's missing; never modifies existing files.
  - `generateSample(root: string, today: string): Promise<void>` — calls `setupVault`, then writes fictional data per the spec's "Sample vault" section: 14 companies (at least 2 in each stage category; 2 with `reach_out_on <= today`; 3 `new` with `first_seen` in the last 3 days), 3 themes, 11 people (6 met, 5 not met; logs arranged so Today has ≥3 follow-ups and ≥2 replies owed), 4 meetings, 2 research notes. Writes `.kew/sample` marker (sets `isSample`). All names clearly fictional; no real companies or people.
  - Templates: Company body sections `## What it is`, `## Team`, `## Why it could work`, `## Risks`, `## Notes`; Person `## Notes` (outreach log added on first log); Meeting `## Summary`, `## Notes`, `## Action items`; Theme `## Landscape`, `## Thesis`, `## Signal log`; Research `## Notes`, `## Sources`.

- [ ] **Step 1: Failing tests:** `planSetup` on a folder with 3 unrelated files lists exactly the 5 folders + templates + schema and `existingNotes: 0`; `setupVault` is idempotent and leaves the unrelated files' bytes unchanged; `generateSample(tmp, '2026-11-24')` then `Vault.open(...).today()` meets the counts above; every sample note passes `validateFields` with no problems; a hand-broken schema file yields `info().schemaError` non-null while `list('company')` still works.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `[code] Add vault service, setup and sample vault`.

### Task 13: Main process, IPC, preload and watcher

**Files:**
- Create: `app/src/main/ipc.ts`, `app/src/main/settings.ts`, `app/src/main/watcher.ts`, `app/src/preload/index.ts`, `app/src/renderer/api.ts`, `app/test/core/ipc.test.ts`
- Modify: `app/src/main/index.ts`

**Interfaces:**
- Consumes: `Vault`, `planSetup`, `setupVault`, `generateSample`.
- Produces:
  - `settings.ts`: `loadSettings(userData): { lastVault: string | null; recent: string[] }`, `saveSettings(...)` in `<userData>/settings.json`; recent capped at 5.
  - `ipc.ts`: `registerIpc(getVault, setVault)` — one `ipcMain.handle('kew:<method>')` per `KewApi` method; errors cross IPC as `{ error: { name, message } }` and the preload rethrows them as `Error` with the same `name`. `createVault('sample')` uses `~/Documents/Kew Sample`, `'empty'` uses `~/Documents/Kew` unless a root is given; if the folder exists and isn't empty, `planSetup` is required first (renderer shows it).
  - `watcher.ts`: `watchVault(root, onPaths)` with chokidar, ignoring `.kew/views.yaml` writes made by the app itself (track recent own-write paths for 1 s), debounced 300 ms; calls `vault.onExternalChange` and sends `kew:changed` with ids.
  - Preload exposes `window.kew: KewApi` via `contextBridge`; `renderer/api.ts` exports `kew` and hooks `useQuery<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: Error | null; reload(): void }` that also reloads on `onChanged`.
  - On launch, reopen `lastVault` if it still exists.

- [ ] **Step 1: Failing test** `ipc.test.ts`: the handler map built by `registerIpc` (export a pure `buildHandlers(getVault, setVault)` used by `registerIpc`) covers every `KewApi` key except `onChanged` (compare against a key list type-checked with `satisfies`), and a thrown `ValidationError` is serialized with its name.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** `npm run dev`; in devtools console `await window.kew.createVault('sample')` then `await window.kew.today()` returns non-empty lists. Commit `[code] Wire vault service to the renderer over typed IPC`.

### Task 14: Design pass — tokens, shell and Today (checkpoint)

**Files:**
- Create: `app/src/renderer/styles/tokens.css`, `base.css`, `components/{Sidebar,CommandBar,StatusLine,HistoryMenu,Button,Chip,Section,EmptyState}.tsx`, `screens/Today.tsx`, `app/src/renderer/router.ts`
- Modify: `app/src/renderer/App.tsx`

**Interfaces:**
- Consumes: `kew`, `useQuery`, `TodayData`.
- Produces: CSS custom properties (colour, type scale, spacing, radius, shadow, motion) for light and dark (`prefers-color-scheme`); `router.ts` with `type Route = { name: 'today' } | { name: 'pipeline'; viewId?: string } | { name: 'list'; type: RecordType } | { name: 'record'; id: string } | { name: 'search'; q: string } | { name: 'settings'; tab: 'fields' | 'vault' }` and `useRoute(): [Route, (r: Route) => void]` (in-memory, back/forward with ⌘[ ⌘]); `CommandBar` (cmdk) opened with ⌘K, listing records by name (from `search`) and commands (New company/person/meeting/theme/research, Go to …, Undo last); `HistoryMenu` listing `history(20)` with Undo per undoable entry and ⌘Z for the newest.

- [ ] **Step 1:** Invoke the `frontend-design:frontend-design` skill. Brief it with the spec's "Visual design" section and the Today wireframe (`design/wireframes/Main.dc.html`). Commit to one named direction and one distinctive choice (type or accent), stated at the top of `tokens.css` in a comment.
- [ ] **Step 2:** Build the shell (sidebar with counts from `today()`/`list()`, sample badge when `isSample`, status line "All changes saved on this Mac" / "Saving…", history menu, ⌘K) and Today with all four sections and their actions: log send (opens a small inline form: channel, text), log reply, snooze (3 days / 1 week / 2 weeks / date), pursue, pass (asks for a reason), push reach-out a week. Empty states for each section.
- [ ] **Step 3:** Verify against the sample vault in both light and dark mode: every Today action changes the file (check in Finder/editor), shows in history, and undo works; keyboard-only path through ⌘K → a record → back.
- [ ] **Step 4:** Commit `[code] Add design system, app shell and Today`.
- [ ] **Step 5: CHECKPOINT.** Stop and show Derek screenshots of the shell and Today in light and dark. Do not start Task 15+ screens until he reacts. Apply his feedback to tokens/shell first.

### Task 15: First launch

**Files:**
- Create: `app/src/renderer/screens/Onboarding.tsx`
- Modify: `app/src/renderer/App.tsx` (show Onboarding when `getState().vault` is null; Settings › Vault links back to it for switching)

**Interfaces:**
- Consumes: `getState`, `chooseFolder`, `planSetup`, `createVault`, `openVault`.

- [ ] **Step 1:** Welcome screen with the three paths (Try the sample vault / Start my vault / Open a folder). "Open a folder" shows the `SetupPlan` (list of what will be created, count of existing notes) with Confirm/Cancel. Recent vaults listed when present.
- [ ] **Step 2:** Verify: fresh `userData` (`--user-data-dir` to a temp dir) shows onboarding; each path lands on Today; reopening the app reopens the last vault.
- [ ] **Step 3:** Commit `[code] Add first-launch onboarding`.

### Task 16: Pipeline

**Files:**
- Create: `app/src/renderer/screens/Pipeline.tsx`, `components/{Board,BoardCard,DataTable,FilterBar,ViewTabs}.tsx`

**Interfaces:**
- Consumes: `views`, `saveViews`, `list('company', q)`, `schema`, `setFields`. Company summaries carry a derived, read-only field `_last_touch` (added in Step 1) for the card's outreach line.
- Produces: `DataTable` (props: `rows: RecordSummary[]`, `columns: FieldDef[]`, `sort`, `onSort`, `onOpen(id)`; rows virtualized with `@tanstack/react-virtual` so 2,000 rows scroll smoothly), reused by Task 17.

- [ ] **Step 1:** Add `_last_touch` (text like `"Messaged 3 days ago"`) to company summaries in `Index.list`, with a test in `index.test.ts`.
- [ ] **Step 2:** Board grouped by the view's `groupBy` (default `pipeline_status`), columns in option order, drag a card between columns → `setFields({ pipeline_status })` (dropping on a `closed` option opens the pass-reason prompt). Cards show name, one-line description (`## What it is` first line or `description` field if present), source and raise chips, `_last_touch`.
- [ ] **Step 3:** Table layout of the same view; view tabs from `views()`, "+ View" saves a new view; filters for any select/stage/relation field; layout toggle persists to the view.
- [ ] **Step 4:** Verify on the sample vault: drag a card, check the file and history, undo; switch views; add a filter, reload app, filter persists.
- [ ] **Step 5:** Commit `[code] Add pipeline board, table and saved views`.

### Task 17: Record lists

**Files:**
- Create: `app/src/renderer/screens/RecordList.tsx`, `components/NewRecordDialog.tsx`

- [ ] **Step 1:** One screen for all five types using `DataTable`: column picker from schema fields, sort, filter, text filter; "New <type>" opens `NewRecordDialog` (name + required system fields; on `{ duplicates }` shows "Did you mean …?" with Open / Create anyway). Meetings dialog builds the name via date + company + type.
- [ ] **Step 2:** Verify: create one record of each type; duplicate prompt appears for a sample company's domain.
- [ ] **Step 3:** Commit `[code] Add record lists and new-record flow`.

### Task 18: Record page

**Files:**
- Create: `app/src/renderer/screens/RecordPage.tsx`, `components/{PropertyPanel,FieldInput,AddPropertyDialog,MarkdownEditor,Backlinks,Timeline,OutreachCard,PassDialog}.tsx`

**Interfaces:**
- Consumes: `get`, `setFields`, `setBody`, `rename`, `changeSchema` (add-field), `logOutreach`, `weMet`, `passCompany`, `snooze`, `search` (for `[[` autocomplete), `openInFinder`.

- [ ] **Step 1:** `FieldInput` per field type (text, number, date picker, select/stage dropdown, multi-select chips, relation picker searching records of `target`, url with open button, checkbox). Problems from `RecordSummary.problems` shown on the field.
- [ ] **Step 2:** `PropertyPanel` with all schema fields and "+ Add a property" (`AddPropertyDialog`: label → key slug, type, options) calling `changeSchema({ kind: 'add-field', tier: 'custom' })`.
- [ ] **Step 3:** `MarkdownEditor` with CodeMirror 6 (`@codemirror/lang-markdown`): heading/list/link styling, `[[` autocomplete from `search`, ⌘-click a link opens the record (unresolved links offer "Create"). Saves via `setBody` 800 ms after typing stops and on blur; status line shows Saving…/Saved. Title editable → `rename`.
- [ ] **Step 4:** Company page: header actions (status dropdown, Pass… → `PassDialog`), Team (from `RecordDetail.people`), backlinks, timeline. Person page: `OutreachCard` (state + reason, Log send, Log reply, Snooze, We met), outreach log list, properties, backlinks. Meeting/Theme/Research: properties, editor, backlinks (Theme also lists companies with that theme).
- [ ] **Step 5:** Verify against the Company and Person wireframes on the sample vault; edit the same note in a text editor while it's open in Kew — the page refreshes and no edit is lost.
- [ ] **Step 6:** Commit `[code] Add record pages with properties, editor and outreach`.

### Task 19: Settings

**Files:**
- Create: `app/src/renderer/screens/SettingsFields.tsx`, `SettingsVault.tsx`

- [ ] **Step 1:** Fields tab per the Fields wireframe: type list, field table (name, type, tier, used by N notes), edit panel: label, options (add, rename → `renamedFrom`, reorder, stage category per option), delete (non-system, confirmation with `affectedCount`). Schema error banner when `info().schemaError` is set.
- [ ] **Step 2:** Vault tab: location (Reveal in Finder), switch vault (back to onboarding paths + recent), rebuild index, full history list with Undo and the reason when not undoable.
- [ ] **Step 3:** Verify: rename a pipeline stage; board and Today still work; undo restores the notes.
- [ ] **Step 4:** Commit `[code] Add fields and vault settings`.

### Task 20: Search

**Files:**
- Create: `app/src/renderer/screens/Search.tsx`
- Modify: `components/CommandBar.tsx` ("Search notes for “…”" item)

- [ ] **Step 1:** Full search view: results with type chip, highlighted snippet, open on Enter.
- [ ] **Step 2:** Verify a word only present in a note body is found from ⌘K → "Search notes".
- [ ] **Step 3:** Commit `[code] Add full-text search`.

### Task 21: Packaging and smoke test

**Files:**
- Create: `app/electron-builder.yml`, `app/INSTALL.md`, `app/test/e2e/smoke.test.ts`
- Modify: `app/package.json` (scripts `dist`, `e2e`)

- [ ] **Step 1:** electron-builder config: appId `app.kew.desktop`, productName `Kew`, mac targets `dmg` for `arm64` and `x64`, `identity: '-'` (ad-hoc), `hardenedRuntime: false`, notarize off; a commented block with Developer ID + notarization settings for later. App icon placeholder in `build/icon.icns`.
- [ ] **Step 2:** `INSTALL.md`: download, drag to Applications, first open blocked → System Settings › Privacy & Security › Open Anyway (screenshots taken from a real run), then choose "Try the sample vault".
- [ ] **Step 3: Smoke test** with Playwright `_electron.launch` on the built app and a temp `--user-data-dir`: choose sample vault → Today shows ≥1 follow-up → create company "Smoke Test Co" → drag it to Reached out on the board → log a send to a sample person → undo the send → quit. Assert the vault files reflect each step.
- [ ] **Step 4:** `npm run dist` produces two `.dmg` files in `app/dist`; run `npm run e2e` → PASS. Install the arm64 dmg on this Mac via the INSTALL steps and open the sample vault.
- [ ] **Step 5:** Commit `[code] Package Kew as ad-hoc signed DMGs with install guide and smoke test`.
