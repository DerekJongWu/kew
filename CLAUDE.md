# CLAUDE.md — Kew

Kew is a desktop app for VC investors (see `SPEC.md`). This repo is in the product-definition stage: the main artifact is the spec.

## Working on the spec

- `SPEC.md` is the source of truth for the product vision. Edit it in place; don't fork it into new files.
- When a change reflects a decision (scope, pricing, architecture, naming), add a row to the top of the `DECISIONS.md` table with the date and the reason.
- Keep the spec's style: lead each section with its point, short sentences, tables for item-by-attribute comparisons, mermaid for flows and roadmaps.
- Update the "Last updated" line at the top of `SPEC.md` on every edit.
- Open questions live as checkboxes at the end of `SPEC.md`. Tick them and record the answer in `DECISIONS.md` when they're settled.
- Keep it general: no firm-specific names, deals or people from Derek's own vault.

## Related

- Prototype: `~/Desktop/brain-desk` (Electron app + Chrome extension). Code moves here in Phase 0.
- Reference vault and conventions: `~/Desktop/canaan-brain` (`VAULT_SCHEMA.md`, `AGENTS.md`, `.claude/`). Generalize from it; don't copy its data.

Commit format: `[spec] …`, `[decision] …`, `[code] …`.
