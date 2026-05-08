# Mighty Man's Revenge

Post-apocalyptic 1v1 retro shooter (late-1980s pixel art) — Phaser.js client, Node.js authoritative server, WebRTC/UDP transport via Geckos.io, with full latency compensation (client prediction, server reconciliation, entity interpolation, server-side rewind). Solo hobby project for <10 friends in the NY/NJ area; not seeking external contributors.

- **Live client:** https://mighty-mans-revenge.web.app
- **Server health:** http://34.24.140.207:3001/health

## Repo layout

| Path       | What lives here                                                            |
| ---------- | -------------------------------------------------------------------------- |
| `/client`  | Phaser.js game client (Vite-bundled TypeScript)                            |
| `/server`  | Authoritative game server (Node.js TypeScript)                             |
| `/shared`  | Types, frozen game constants, physics/math/collision used by both packages |
| `/e2e`     | Playwright end-to-end + visual-regression tests                            |
| `/docs`    | Architecture Decision Records (`docs/adr/`) and infrastructure notes       |

## Quick start

```bash
pnpm install
pnpm dev          # client + server concurrently
pnpm test         # vitest across all packages
pnpm typecheck
pnpm build
```

See `CLAUDE.md` for the full command list and deploy procedures.

## Where to read next

| If you want…                                | Read                                          |
| ------------------------------------------- | --------------------------------------------- |
| Conventions, architecture, deploy, pitfalls | [`CLAUDE.md`](./CLAUDE.md)                    |
| Why each big decision was made              | [`docs/adr/`](./docs/adr/)                    |
| Full feature spec / user stories            | [`USER_STORIES.md`](./USER_STORIES.md)        |
| Visual / graphics roadmap                   | [`GRAPHICS_PLAN.md`](./GRAPHICS_PLAN.md)      |
| Idea backlog                                | [`IDEAS.md`](./IDEAS.md)                      |
