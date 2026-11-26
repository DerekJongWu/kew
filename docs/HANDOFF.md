# Kew — handoff

_Last updated 2026-11-25_

Read this first in a new session. It covers where the project stands, how it got here, and what to do next. Project rules and commands are in `CLAUDE.md`.

## Status

- The **core loop works and is pushed** on branch `feat/core-loop`, about 80 commits ahead of `main`. It is **not merged into `main`** and has no pull request yet. Create one from https://github.com/DerekJongWu/kew/pull/new/feat/core-loop.
- `spec/v1-local-scope` (the spec work) is already contained in `feat/core-loop`.
- Health at handoff:
  - unit tests: 369 pass across 35 files
  - typecheck: clean
  - lint: 0 errors, about 520 formatting warnings
  - e2e: 19 of 19 checks pass
  - DMG builds: work for arm64 and x64
- Derek tried the app and is happy with where it is.

### What the app does today

| Area | What works |
| --- | --- |
| Onboarding | Create a new vault, open an existing folder, or "Try the sample" (creates `~/Documents/Kew Sample` with invented data) |
| Today | Follow-ups that are due, replies owed and new inbound, with one-click Log send, Log reply and Snooze, plus an undo toast |
| Pipeline | Board and table views, saved views, one Filter button. Drag cards or use "Move to…" with any stage. Moving to Passed asks for a reason |
| Records | Company, Person, Meeting, Theme and Research pages. Each page has a wrapping title, a properties panel (empty fields collapse), a markdown notes editor with `[[links]]` and autocomplete, backlinks, a timeline, and an outreach log on Person pages |
| ⌘K | Jump to any record, ranked exact name match first, then name prefix, then word prefix. Also runs commands and "Search notes for …" |
| Search | Full-text search over notes with highlighted snippets |
| Settings | Fields: add, rename or delete fields and options, and map stages to categories. Changes rewrite every affected note in one undoable step. Vault: location, reveal in Finder, history |
| History and undo | Every change is one entry. ⌘Z and ⇧⌘Z work. Edits made in Obsidian or other editors are recorded first, so they can be undone too |
| Safety | Atomic writes with rollback. Edits flush on close and quit. A conflict bar appears when a note changes on disk while being edited. The window can't navigate away or accept dropped files |
| Packaging | Ad-hoc signed DMGs for macOS 13+. The install steps, including Gatekeeper's "Open Anyway", are in `app/INSTALL.md` |

**Not built yet:** diligence workspace, Claude copilot (Agent SDK, bring your own key), browser button, PDF and Excel viewer, connectors, and the Templates, Views and Claude settings tabs from the wireframes (Settings has only Fields and Vault and history today). See `SPEC.md` › Roadmap.

## How it was built

1. **Spec.** Wrote `SPEC.md` and `DECISIONS.md`, and drew wireframes in `design/wireframes/`.
2. **Design.** Used the superpowers brainstorming skill to write `docs/superpowers/specs/2026-11-24-kew-core-loop-design.md`.
3. **Plan.** Turned that design into a 21-task plan: `docs/superpowers/plans/2026-11-24-kew-core-loop.md`.
4. **Build.** Ran the plan with subagent-driven development: a fresh implementer for each task, a reviewer after each, then a whole-branch review and one round of fixes for everything it found.
5. **UX review.** Took 117 screenshots at three window sizes, which surfaced 25 problems. Derek approved all 25 fixes. They went in as three batches, each reviewed and re-reviewed. The design picks are in `DECISIONS.md` (2026-11-25).

The working ledger for steps 4 and 5 is at `.superpowers/sdd/2026-11-24-kew-core-loop/`. It is gitignored, so it exists only on Derek's Mac. It holds the task briefs, reports, reviews and every ruling. The parts worth keeping are copied below.

## Next steps (suggested order)

1. **Merge to `main`.** Open a PR from `feat/core-loop`, or merge locally, once Derek says so.
2. **Phase 0 gate.** Install from the DMG on a fresh Mac in under 10 minutes. Steps are in `app/INSTALL.md`.
3. **Phase 1 features**, each through brainstorm → design doc → plan → build:
   - Claude copilot: side panel plus full-screen diligence workspace. Uses the Agent SDK with the user's own API key. Its output is notes; new notes apply right away with undo, and edits to existing notes need approval. Decisions from 2026-11-24.
   - Diligence workspace: tabs per company, built from research notes tagged by `topic`, plus a files tab for the data room.
   - PDF and Excel viewer for attachments.
   - Browser button: add a company or person from LinkedIn or a company site, draft a message, log a send. Talks to the app over local HTTP and builds on the `brain-desk` prototype.
4. **Settings tabs** from the wireframes that don't exist yet: Templates, Views, Claude.
5. **Before a wider beta:** Developer ID signing and notarization (a config switch in `electron-builder.yml`), and auto-update.

## Known issues and parked items

Everything below is minor. Every Critical and Important review finding was fixed. These are worth knowing about before working in the area.

**UX (from the 2026-11-25 batches)**
- Toast Undo can say "something changed since" when an autosave that started before the action lands after it. This fails safe.
- In ⌘K, pressing an arrow key before results load can make "Search notes" the pick. The ⌘K highlight fix relies on cmdk 1.1 internals (one documented `eslint-disable` in `CommandBar.tsx`). After any cmdk upgrade, re-test this: type "pi", then "n", then press Return. It should open Pinemoth.
- A stored impossible date such as 2026-02-30 shows the raw string, but the date picker accepts only a valid shape.
- Settings › Fields shows the table and editor side by side only at 1336 px wide or more. Below that, the editor stacks under the table.
- Record lists (Companies, People) keep per-field filter buttons. Only Pipeline has the single Filter button.
- Multi-line paste into a title or property field can jump the caret.

**Core and data**
- Rename doesn't rewrite links inside nested frontmatter values. Re-quoted keys lose inline comments.
- Option renames rewrite the whole YAML line, which drops comments and flattens block lists.
- History restores are utf8, so binary attachments aren't safely undoable. Attachments aren't in scope yet.
- Orphan `.kew-tmp` files from a crash are never swept, and there's no fsync.
- Backlinks match any record that shares a name or alias, with no type tie-break.
- Frontmatter writer edge cases: quoted keys and BOM aren't handled, and trailing comments on rewritten lines are lost.
- Outreach: impossible dates are accepted in log lines, and a future-dated event shows "-3 days ago".
- ⌘Z skips already-undone actions by matching the "Undid:" message prefix. If history message wording changes, this breaks.
- `views.yaml` edits made outside the app don't reach an open window until reload.
- No IPC argument type or sender checks in main. The window is locked down, but these are worth adding before the browser button opens a local HTTP port.
- Lint has about 520 Prettier formatting warnings. `npm run format` would clear most of them as one commit of its own.

**Testing gaps**
- There is no DOM or component test environment, so UI behaviour is covered by e2e and screenshot checks only.
- e2e doesn't cover empty states, the Filter popover, toast Undo or wikilink Create.

## Gotchas for a new session

- `npm run dev` uses the real vault and data folder. Anything you click there changes Derek's files, though it's undoable from History.
- e2e needs a packaged build first: `npm run build && npx electron-builder --mac dir --arm64`.
- The renderer is sandboxed. Everything goes through `window.kew` methods listed in `src/shared/methods.ts`. Add a method there, in `main/ipc.ts`, in the preload, and in `renderer/src/api.ts`.
- Schema changes are refused while `.kew/schema.yaml` has a parse error, so Kew never overwrites a file the user is mid-edit on.
- Case-only renames and names starting with "." are refused on purpose. See `DECISIONS.md`.
