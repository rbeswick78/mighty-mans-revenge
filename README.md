# Mighty Man's Revenge

Post-apocalyptic 2–4 player retro shooter (late-1980s pixel art) — Phaser.js client, Node.js authoritative server, WebRTC/UDP transport via Geckos.io, with full latency compensation (client prediction, server reconciliation, entity interpolation, server-side rewind). Solo hobby project for <10 friends in the NY/NJ area; not seeking external contributors.

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
| Battle cry         | T                          | Y                               | Taunt button                       |
| Reload             | R                          | X / Square                      | Automatic                          |

Gamepad menus use the D-pad or left stick, A / Cross to select, and B /
Circle to cancel or return. Mouse, touch, keyboard, and gamepad can take over
at any time; no settings toggle is required.

## Reforged settings

When the server advertises the disabled-by-default Reforged shell, Settings
collects the existing device-local callsign and audio controls, the read-only
automatic control map and current graphics presentation, best-effort
fullscreen entry, and authoritative signal status/Retry Now action. It does
not add accounts, remapping, a new graphics preference, or client-side recovery
authority. The complete legacy Lobby remains the fallback whenever the shell
capability is absent or the connection must recover.

## Combat feel

Repeated knockouts cycle through roster-aware collapse animations instead of
replaying the same fall every time. The choice comes from the synchronized
match death counter, so every client sees the same cosmetic beat.

## Group play

`QUICK MATCH` keeps the focused 1v1 rivalry experience. `RUMBLE 2–4` opens a
short gathering window once two fighters arrive, launches immediately at four,
and turns every existing arena, mode, character, and shared event into a
free-for-all. In a three- or four-fighter group, everyone votes on the arena
and then the mode; live ballot counts invite negotiation, plurality wins, and
the server breaks ties. Two-fighter Rumbles keep the quicker head-to-head
draft. The whole connected group can then vote for the next round from the
final standings. Direct Rumble rematches also carry a
session-only Crown: the winner claims it, repeat wins extend the reign, and the
next winner can steal it. The Crown disappears when the group returns to the
lobby, so it stays a social run-it-back story instead of persistent grind.
During three- and four-fighter rounds, server-authored takeover callouts now
make every sole lead, shared lead, and full-field tie part of the live story.
At the finish, every connected fighter who was knocked out gets a personal
Grudge against the rival who got them most; the latest knockout breaks a tie,
and a direct rematch carries that target into fighter select for one more score
to settle. In three- and four-fighter battles, meaningful recent setup damage
also earns one server-authored Assist when somebody else lands the knockout.
The live HUD celebrates it, Results shows K/A/D, and the best helper can take
the Wingman award without changing anybody's mode score. Results also preserve
the cast that created the story: Rumble rows pair every callsign with the
fighter they actually locked, while duel winners and losers enter the final
tableau as themselves instead of placeholder characters.

## Connection recovery

The lobby always shows whether its authoritative-server signal is linking,
online, retrying, or offline. Server-backed play buttons stay disabled until
the signal is ready, while local settings and the Gauntlet Codex remain
available. A stalled WebRTC handshake times out after five seconds, automatic
retries use bounded backoff, and `RETRY NOW` skips the wait. If the signal
drops during a match, the game shows a clear interruption beat and returns to
the lobby instead of freezing on stale state.

## Arena variety

Six arenas now shape matchmaking, rematches, and solo runs. Rusted Refinery is
the newest: a rotationally balanced industrial yard built around a red-roofed
power vault, open north/south approaches, and diagonal side gates that can be
shot open into fresh flanking routes. Paired barrels, scavenger caches, and
power pickups make its central fight volatile without adding map-only rules.

Real PvP wins also build a separate Arena Mastery record for every battlefield.
The pre-match draft compares both rivals' experience on each map, while Results
celebrates new SCOUTED, CLAIMED, STRONGHOLD, and HOME TURF tiers. Practice stays
outside this progression so mastery remains a record of friend-group victories.

## Solo play

`RUSTY SPAR` starts the familiar single Practice match at your selected Rusty
difficulty. Its `RIVAL` selector can stay on `RANDOM` or pin any roster fighter
for matchup practice, while `SOLO MODE` can keep the rotating mix or pin any of
the eight modes. `SOLO CHAOS` can also lock any compatible shared event into
the mid-match slot while leaving the final-minute twist random. All three
choices persist on that device and rematches keep them while maps continue to
rotate; Random mode skips rulesets that cannot honor the chosen event.
`SCRAP PIT` uses those same settings to launch a full four-fighter Rumble on
demand against Rusty, Scrapjaw, and Clank. All three are ordinary
server-authoritative fighters, so the solo brawl includes the live Rumble
lead, assists, standings, Crown, and direct-rematch stories without writing
lifetime PvP records. They also fight differently: Rusty is the all-rounder,
Scrapjaw pressures whoever leads the board, and Clank ranges farther for arena
loot. Character Select previews those roles before every fight. Throw a battle
cry during the brawl and the nearest available rival answers in character;
each crew member also has a signature cry when they knock you out. Completed
rounds build a device-local `PIT RECORD`: wins extend a run, draws hold it,
losses end it, and the best run stays visible on the Scrap Pit button.
`CREW 2V2` opens a six-second ally window before the same four-fighter team
fight. A second human can join you immediately; if nobody does, Rusty fills
the open blue slot and you still launch without another menu. The first player
in the window is captain: their compatible favorite mode, difficulty, and Solo
Chaos choice author the round, while a joining friend contributes their fighter.
Blue faces Scrapjaw and Clank with friendly fire off across bullets,
melee, axes, fire, grenades, barrels, and delayed explosives. Shots and thrown
weapons pass through Rusty instead of treating him as cover. Four explicit
team rulesets rotate: first-to-15 combined Deathmatch knockouts, King of the
Hill where allies can hold together, Kill Confirmed where either teammate can
deny an allied tag, and Core Run with shared carry time. A compatible favorite
mode stays pinned; Random changes the objective and arena on direct rematches.
A mint `ALLY` marker and the two-score team HUD keep the battlefield readable,
while Results groups the four real fighters with mode-correct team totals.
Every authoritative Crew win also secures that objective's device-local patch.
Collecting Deathmatch, Hill, Tags, and Core patches completes a `CREW TOUR`,
starts the next four-patch set, and increments a compact lobby tally. Duplicate
mode wins still extend the separate best win-run chase; draws hold the run,
losses end it, and neither removes earned patches. Fighter Select identifies
the human ally or Rusty fill and shows whether
the current objective offers an open or final patch, while Results celebrates
new patches and complete tours.
Direct rematches preserve the exact crew and require both humans to vote when a
friend joined. Difficulty and compatible Solo Chaos still apply, and the mode
remains Practice so it never writes lifetime PvP records.
`GAUNTLET` starts a three-fight run that
escalates from Rookie to Scrapper to Warlord; win to advance, while a loss or
draw restarts the run.
`DAILY RUN` serves one shared UTC-dated Gauntlet challenge. Its opening arena,
mode, rival, contract, spawn layout, and seeded match events repeat for every
attempt that day, so improving the clear is about mastery rather than a lucky
roll. Completed clears join the server-owned `DAILY TOP 5`, where each callsign
keeps its best score for that UTC date; results show the clear's rank and
authoritative best. Starting an attempt locks a `DAILY CHASE` from that board:
set the pace, claim an open rank, break into the top five, catch the callsign
directly ahead, or push the #1 score higher. The target stays fixed through all
three fights and progress is shown before each stage and on results. Daily
clears also keep a device-local best score and consecutive-day streak. Attempts
remain unlimited and still never affect lifetime PvP records.
Gauntlet fights rotate maps and modes but never change lifetime PvP records.
Each stage win banks score, with bonuses for the round contract and a
regulation finish. Zero-death wins add a flawless bonus, while every whole
regulation second left adds pace points up to the stage cap; completing all
three stages can set the device's `BEST CLEAR` and give the next run a target
to beat. After the first two wins, both next-fight routes preview a different
Rusty fighter; the chosen matchup is locked for that stage, and no opponent
repeats during the run. Each route also offers a different run-long boon:
armor on every life, kill salvage, faster ability recharge, or an opening
speed burst. The chosen build carries into later stages and can hold two boons
by the finale. Every complete two-boon loadout has a named build, and clearing
the finale discovers it in the device-local six-build `BUILD CODEX`. Open the
Codex from the lobby to inspect every recipe, reveal discovered identities, and
chase a personal best with each build. Results celebrate both new discoveries
and improved build records while the trophy board totals your best clears.
Routes also forecast a compatible mid-match chaos event. The
selected event is locked into the fight, and forecasts do not repeat during
the same run. Forecasts advertise a 100, 200, or 300 point danger bounty; win
that stage to bank it into the run and `BEST CLEAR` chase.
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
Ability Overdrive triples signature-power recharge, turning late rounds into
repeated character-power duels without changing the powers themselves.
Every activation banner pairs the mutator name with a compact rule callout, so
new surprises teach players how to react before the fight changes underneath
them.

## Where to read next

| If you want…                                | Read                                                               |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Conventions, architecture, deploy, pitfalls | [`CLAUDE.md`](./CLAUDE.md)                                         |
| Why each big decision was made              | [`docs/adr/`](./docs/adr/)                                         |
| Full feature spec / user stories            | [`USER_STORIES.md`](./USER_STORIES.md)                             |
| Active Reforged multi-session roadmap       | [`docs/REIMAGINING_ROADMAP.md`](./docs/REIMAGINING_ROADMAP.md)     |
| Completed replayability build history       | [`docs/REPLAYABILITY_ROADMAP.md`](./docs/REPLAYABILITY_ROADMAP.md) |
| Visual / graphics roadmap                   | [`GRAPHICS_PLAN.md`](./GRAPHICS_PLAN.md)                           |
| Idea backlog                                | [`IDEAS.md`](./IDEAS.md)                                           |
