# Kew app

The Electron app for Kew. Project rules, commands and architecture are in [`../CLAUDE.md`](../CLAUDE.md); current status and next steps are in [`../docs/HANDOFF.md`](../docs/HANDOFF.md); the end-user install guide is [`INSTALL.md`](INSTALL.md).

```bash
npm install      # needs Node 22.5+
npm run dev      # run with hot reload (uses your real vault)
npm test         # unit tests
npm run typecheck && npm run lint
npm run build && npx electron-builder --mac dir --arm64 && npm run e2e   # packaged end-to-end test
npm run dist     # DMGs for arm64 and x64 in dist/
```
