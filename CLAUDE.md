# CLAUDE.md — Kew

Kew is a local-only Mac app for VC investors: sourcing, outreach, pipeline and notes on a markdown vault the user owns (see `SPEC.md`). The core loop is built and working in `app/`. **Start every new session by reading `docs/HANDOFF.md`**: it has the current status, what's next, and the known issues.

## Where things live

| Path | What it is |
| --- | --- |
| `SPEC.md` | Product vision, the source of truth |
| `DECISIONS.md` | Every product and architecture decision, newest first, with the reason |
| `docs/HANDOFF.md` | Current state, how it was built, next steps, known issues |
| `docs/superpowers/specs/2026-11-24-kew-core-loop-design.md` | Detailed design of the built core loop (screens, data, write path) |
| `docs/superpowers/plans/2026-11-24-kew-core-loop.md` | The 21-task plan the core loop was built from |
| `design/wireframes/` | Original wireframes (`*.dc.html`) |
| `app/` | The Electron app (code, tests, packaging) |
| `app/INSTALL.md` | End-user install guide for the DMG |

## Working on the app

Run everything from `app/`. Use Node 22.5 or later, because the tests use `node:sqlite`.

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (also fetches Electron) |
| `npm run dev` | Run the app with hot reload. It opens the user's **real** vault and data folder |
| `npm test` | Vitest unit tests (369 passing at handoff) |
| `npm run typecheck` | Strict TS for main and renderer |
| `npm run lint` | ESLint. Must stay at 0 errors (about 520 formatting warnings are known) |
| `npm run build && npx electron-builder --mac dir --arm64 && npm run e2e` | Package the app and run the 19-check end-to-end test against it |
| `npm run dist` | Build the ad-hoc signed DMGs for arm64 and x64 into `app/dist/` |
| `npm run smoke:preload` | Check the preload bridge |
| `npm run screenshot` | Screenshot harness (`scripts/screenshot.mjs`) |

Before every commit: `npm test`, `npm run typecheck`, and `npm run lint` with 0 errors. Also run e2e when you touch a flow it covers (onboarding, sample vault, new company, pipeline status, ⌘K, Log send, undo, quit flush).

### Never touch the user's real data

- Derek's real vault is `~/Documents/Kew Sample` and the app data is `~/Library/Application Support/kew`. Tests, scripts and agents must never write, move or delete either.
- To run the app for checks, set `KEW_HOME=<scratch dir>` and pass a scratch `--user-data-dir`. Main prints `kew:home=` when the override is on. `scripts/e2e.mjs` already does this, and it fails if the real folder changes.
- Put screenshots and scratch vaults in a temp or scratchpad folder, never in the repo.

## Architecture in one screen

- **Stack.** Electron 45, electron-vite, React 19, strict TypeScript, Vitest, CodeMirror 6, cmdk, dnd-kit. No native modules.
- **`src/core/`** has no Electron. It handles the vault, notes and frontmatter (`note.ts`), schema (`schema/`), links, outreach, history (isomorphic-git), the index (`node:sqlite` with FTS5, rebuilt on every vault open) and the write path (`write/`).
- **Single write path.** Every change goes through `applyAction` (`core/write/apply.ts`), which:
  - writes atomically;
  - commits outside edits to history first;
  - rolls back on failure;
  - records one history entry per action.
  Undo replays an entry through the same path. Never write vault files any other way.
- **History** is a git repo outside the vault, at `<userData>/vaults/<hash>/history.git`, with no remote.
- **`src/main/`** covers IPC (`ipc.ts`), the file watcher, the menu, the navigation lock (`navigation.ts`), and the flush on close or quit (`flush.ts`). Close and quit ask the renderer to save pending edits, with a 2 s timeout.
- **`src/preload/`** is a sandboxed bridge. It exposes typed envelopes listed in `src/shared/methods.ts` (`KEW_METHODS`). The renderer wraps them in `src/renderer/src/api.ts`.
- **`src/renderer/src/`** has `screens/`, `components/` and `lib/`. Pure logic goes in `lib/` and gets unit tests. Styling is three files: `styles/tokens.css`, `base.css` and `components.css`.
- **Schema** lives in the vault at `.kew/schema.yaml`, with views in `.kew/views.yaml`. The user can edit fields. Only system fields are fixed.

## UI rules

- Design is "Glasshouse" with the Cobalt glass accent (#2148C0 light, #7FA2FF dark). Use the tokens in `tokens.css` and add no new colours, fonts or spacing.
- **Names are never truncated or ellipsized.** They wrap.
- Errors from `window.kew` are never swallowed. Show them inline or in the status line.
- Accessibility: use real buttons and labels, give icon-only buttons an aria-label, keep focus visible, and keep text contrast at 4.5:1 or more in both themes.
- Layout:
  - The main pane is the scroll container.
  - Record layouts use a container query on `.record-body`.
  - Fixed-position UI (dialogs, toasts, popovers) must live outside `.record-body` or be portaled to `document.body`.
- One-click actions show a toast whose Undo reverts only that action. ⌘Z undoes the newest action.
- The app must work at 960×600 (the minimum window), 1100×720 and 1440×900, in light and dark.

## Working on the spec

- `SPEC.md` is the source of truth for the product vision. Edit it in place; don't fork it into new files.
- When a change reflects a decision (scope, pricing, architecture, naming, UX behaviour), add a row to the top of the `DECISIONS.md` table with the date and the reason.
- Keep the spec's style: lead each section with its point, short sentences, tables for item-by-attribute comparisons, mermaid for flows and roadmaps.
- Update the "Last updated" line at the top of `SPEC.md` on every edit.
- Open questions live as checkboxes at the end of `SPEC.md`. Tick them and record the answer in `DECISIONS.md` when they're settled.
- Keep it general: no firm-specific names, deals or people from Derek's own vault. Sample data uses invented brands and `linkedin.example` URLs.

## Git

- Commit format: `[spec] …`, `[decision] …`, `[code] …`, imperative and describing the user-visible effect.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on a branch, not `main`. Push only when Derek asks.

## Related

- Prototype: `~/Desktop/brain-desk` (Electron app + Chrome extension), github.com/DerekJongWu/brain-desk. The browser button will draw on it.
- Reference vault and conventions: `~/Desktop/canaan-brain` (`VAULT_SCHEMA.md`, `AGENTS.md`, `.claude/`). Generalize from it; don't copy its data.
