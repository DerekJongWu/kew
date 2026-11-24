# Decisions

Newest first. One entry per decision: what was decided, why, and what it rules out.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-24 | No git remote or cloud backup in v1. Undo and history come from a local git repository stored outside the vault, with no remote | Keeps Kew a purely local app with nothing to set up. Users back up with their own tools (Time Machine, iCloud). A `.git` folder inside a synced vault gets corrupted, so the history lives in the app's support folder. Rules out the prototype's push-to-GitHub. |
| 2026-11-24 | Diligence is a tabbed workspace per company. Tabs show what's already collected (with sources, conflicts and gaps) before any chat; a files tab covers the data room | The investor should see what's known before asking for more homework. Tabs are built from research notes tagged by `topic` and facts read from attachments, so they stay plain files and users can add their own tabs. |
| 2026-11-24 | Connectors are out of v1. Future roadmap: connectors, then user routines (skill + trigger), then community (sharing theme research and deals between users) | Keeps v1 focused on the core loop. Meetings come in by dropping a transcript until connectors land. Each stage builds on the one before. |
| 2026-11-24 | The copilot's output is notes. It has a side panel and a full-screen diligence workspace; new notes apply right away with undo, edits to existing notes need approval | Diligence is only worth something once it's in the vault and linked to companies and themes. Approving every new paragraph would be friction with no safety gain. |
| 2026-11-24 | Users can edit fields, options and templates; the schema lives in the vault. Only system fields (id, type, name, pipeline status, outreach dates) are fixed | Investors work differently and want to shape their own system. Ship starter templates, but don't lock them. Rules out a schema hard-coded in the app. |
| 2026-11-24 | Four primitives (company, person, meeting, theme), plus research notes and attachments. Inbound merges into Company; every contact gets a Person note with a `met` flag | The prototype vault's Inbound/Company split and the met-only People rule caused file moves, cross-folder dedupe and copied outreach history. In an app these become views. Rules out folders as status. |
| 2026-11-24 | V1 is desktop only: one investor on one machine, no mobile or multi-device sync | Keeps the MVP local with no backend to run. Git stays a backup. The sync design (git vs. file sync vs. a hosted service) is deferred and should be shared with team mode when it comes. |
| 2026-11-23 | Name the product **Kew** | A nod to Q from James Bond: the quartermaster who equips the agent. Short and ownable in the VC-tools space (trademark check still open). |
| 2026-11-23 | Build a product for associates and partners at any firm, not a Canaan-internal tool | The workflow is general; the prototype proved it on one real vault. |
| 2026-11-23 | Local-first markdown vault as the system of record; Obsidian optional | Users own their data, Claude can read it directly, and there's no lock-in. |
| 2026-11-23 | Claude access via the Agent SDK with bring-your-own API key for the beta | Anthropic doesn't allow third-party products to use claude.ai login without approval. |
