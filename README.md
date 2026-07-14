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

## Combat feel

Repeated knockouts cycle through roster-aware collapse animations instead of
replaying the same fall every time. The choice comes from the synchronized
match death counter, so every client sees the same cosmetic beat.

## Arena variety

Five arenas now shape matchmaking, rematches, and solo runs. Checkpoint Zero is
the newest: a fortified, rotationally balanced crossing built around long
reinforced-barricade lanes, shoot-open shortcuts, and a dangerous central
pickup fight. Its low cover is deliberately readable in both directions and
can still be blasted away to rewrite the sightlines during a round.

## Solo play

`RUSTY SPAR` starts the familiar single Practice match at your selected Rusty
difficulty. Its `RIVAL` selector can stay on `RANDOM` or pin any roster fighter
for matchup practice, while `SPAR MODE` can keep the rotating mix or pin any of
the eight modes. Both choices persist on that device and rematches keep them
while maps continue to rotate. `GAUNTLET` starts a three-fight run that
escalates from Rookie to Scrapper to Warlord; win to advance, while a loss or
draw restarts the run.
`DAILY RUN` serves one shared UTC-dated Gauntlet challenge. Its opening arena,
mode, rival, contract, spawn layout, and seeded match events repeat for every
attempt that day, so improving the clear is about mastery rather than a lucky
roll. Daily clears keep a device-local best score and consecutive-day streak;
attempts remain unlimited and still never affect lifetime PvP records.
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
Combat highlights matter too: First Blood, rapid multikills, Clutch finishes,
and From the Grave kills add a capped style bonus when the stage is won. Their
live callouts show the points at stake, while the results screen banks them.

## Match chaos

Every round gains two announced match-wide mutators that can stack. The pool
includes loadout swaps, storms, teleports, supply races, and Demolition Wave:
one arena-wide blast that permanently opens ordinary low cover and wire gates.
Barrels and scavenger caches survive the wave, leaving their traps and rewards
available inside the newly exposed sightlines. Blood Rush turns each living
opponent kill into a four-second speed burst, rewarding immediate pursuit.
Every activation banner pairs the mutator name with a compact rule callout, so
new surprises teach players how to react before the fight changes underneath
them.

## Where to read next

| If you want…                                | Read                                     |
| ------------------------------------------- | ---------------------------------------- |
| Conventions, architecture, deploy, pitfalls | [`CLAUDE.md`](./CLAUDE.md)               |
| Why each big decision was made              | [`docs/adr/`](./docs/adr/)               |
| Full feature spec / user stories            | [`USER_STORIES.md`](./USER_STORIES.md)   |
| Visual / graphics roadmap                   | [`GRAPHICS_PLAN.md`](./GRAPHICS_PLAN.md) |
| Idea backlog                                | [`IDEAS.md`](./IDEAS.md)                 |
