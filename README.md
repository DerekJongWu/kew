# Kew

A VC deal workflow in a box: sourcing, outreach, triage, diligence and memory, on a markdown vault you own, with Claude doing the legwork. Named for Q, the quartermaster who equips Bond before every mission.

- **[SPEC.md](SPEC.md)** is the product spec and the source of truth for the vision.
- **[DECISIONS.md](DECISIONS.md)** logs product decisions and why they were made.
- **[app/INSTALL.md](app/INSTALL.md)** is the install guide for the Mac app (download, first open, uninstall).
- **[docs/HANDOFF.md](docs/HANDOFF.md)** is the current status, next steps and known issues. Start here in a new Claude Code session.

Status: the core loop (Today, pipeline, records, outreach, fields, search, history) is built as a local Mac app in `app/`. Run `npm install && npm run dev` there, or `npm run dist` to build the DMGs. Diligence, the copilot and the browser button come next.
