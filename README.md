# Mighty Man's Revenge

Post-apocalyptic 1v1 retro shooter (late-1980s pixel art) — Phaser.js client, Node.js authoritative server, WebRTC/UDP transport via Geckos.io, with full latency compensation (client prediction, server reconciliation, entity interpolation, server-side rewind). Solo hobby project for <10 friends in the NY/NJ area; not seeking external contributors.

- **Live client:** https://mighty-mans-revenge.web.app
- **Server health:** http://34.24.140.207:3001/health

## Repo layout

| Path      | What lives here                                                            |
| --------- | -------------------------------------------------------------------------- |
| `/client` | Phaser.js game client (Vite-bundled TypeScript)                            |
| `/server` | Authoritative game server (Node.js TypeScript)                             |
| `/shared` | Types, frozen game constants, physics/math/collision used by both packages |
| `/e2e`    | Playwright end-to-end + visual-regression tests                            |
| `/docs`   | Architecture Decision Records (`docs/adr/`) and infrastructure notes       |

## Quick start

```bash
pnpm install
pnpm dev          # client + server concurrently
pnpm test         # vitest across all packages
pnpm typecheck
pnpm build
```

See `CLAUDE.md` for the full command list and deploy procedures.

## Controls

| Action             | Keyboard + mouse           | Standard gamepad                | Touch                              |
| ------------------ | -------------------------- | ------------------------------- | ---------------------------------- |
| Move               | WASD                       | Left stick                      | Left virtual stick                 |
| Aim / fire         | Hold / release left mouse  | Right stick + hold / release RT | Hold / release right virtual stick |
| Grenade / detonate | Hold / release right mouse | Hold / release LT               | Grenade button                     |
| Sprint             | Shift                      | LB or left-stick click          | Push left stick to its rim         |
| Ability            | Space                      | RB                              | Ability button                     |
| Reload             | R                          | X / Square                      | Automatic                          |

Gamepad menus use the D-pad or left stick, A / Cross to select, and B /
Circle to cancel or return. Mouse, touch, keyboard, and gamepad can take over
at any time; no settings toggle is required.

## Solo play

`RUSTY SPAR` starts the familiar single Practice match at your selected Rusty
difficulty. `GAUNTLET` starts a three-fight run that escalates from Rookie to
Scrapper to Warlord; win to advance, while a loss or draw restarts the run.
Gauntlet fights rotate maps and modes but never change lifetime PvP records.
Each stage win banks score, with bonuses for the round contract and a
regulation finish. Zero-death wins add a flawless bonus, while every whole
regulation second left adds pace points up to the stage cap; completing all
three stages can set the device's `BEST CLEAR` and give the next run a target
to beat. After the first two wins, both next-fight routes preview a different
Rusty fighter; the chosen matchup is locked for that stage, and no opponent
repeats during the run. Each route also forecasts its compatible mid-match
chaos event. The selected event is locked into the fight, and forecasts do not
repeat during the same run. Forecasts also advertise a 100, 200, or 300 point
danger bounty; win that stage to bank it into the run and `BEST CLEAR` chase.

## Where to read next

| If you want…                                | Read                                     |
| ------------------------------------------- | ---------------------------------------- |
| Conventions, architecture, deploy, pitfalls | [`CLAUDE.md`](./CLAUDE.md)               |
| Why each big decision was made              | [`docs/adr/`](./docs/adr/)               |
| Full feature spec / user stories            | [`USER_STORIES.md`](./USER_STORIES.md)   |
| Visual / graphics roadmap                   | [`GRAPHICS_PLAN.md`](./GRAPHICS_PLAN.md) |
| Idea backlog                                | [`IDEAS.md`](./IDEAS.md)                 |
