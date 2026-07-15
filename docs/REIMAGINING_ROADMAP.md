# Mighty Man's Revenge: Reforged Roadmap

This document is the living contract for the multi-session Reforged program.
Read this file and `CLAUDE.md` completely at the start of every batch. The
completed `docs/REPLAYABILITY_ROADMAP.md` remains the historical record for the
systems this program preserves and reorganizes.

- **Status:** Batch 4 complete on 2026-07-15.
- **Next batch:** Batch 5 — Play roster builder.
- **Public releases:** Reforged Arena, then Battle Royale.
- **Working model:** one numbered batch per session, direct commits and pushes
  to `main`, milestone-gated production deployments.
- **Rules of the road:** authoritative server, N-player-safe data structures,
  shared physics, centralized constants, discriminated network unions,
  deterministic tests, additive persistence, and mobile-first input/layout.

## Outcomes

### Reforged Arena

A clean five-tab journey, persistent fighter selection, parties, deliberate
mode selection, five-minute server-owned arena schedules, responsive 16:9
gameplay, a scrolling camera, modern stylized-comic art, minimaps, and six
hand-authored arenas with roughly four times their current tile area.

### Battle Royale

An eight-player solo survival mode with a 15-second human queue plus bot fill,
one-life elimination, six rarity-aware guns, attack-opened loot containers,
four authored biomes, phased moving radiation circles, spectating, and a
separate persistent record.

## Locked decision ledger

These decisions may be changed only through an explicit roadmap amendment
that records the reason, affected batches, compatibility impact, and date.

| Area                   | Locked decision                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Existing content       | Preserve existing activities and reorganize them; do not delete challenge depth to simplify the main menu.                   |
| Main navigation        | Five persistent tabs: Play, Fighters, Challenges, Records, Settings.                                                         |
| Standard formats       | Curated Duel, 2–4 fighter Rumble, Crew 2v2, and solo Battle Royale.                                                          |
| Play flow              | Guided roster builder; show only server-supported combinations.                                                              |
| Parties                | Short room code and shareable link assemble Duel, Rumble, or Crew human slots. Battle Royale has no parties in v1.           |
| Human queues           | A human choice never silently becomes a bot. Offer confirmed bot fill after 15 seconds.                                      |
| Standard bots          | Hide identity and difficulty during ordinary setup; use the current Scrapper baseline. Named challenge bots keep their lore. |
| Mode choice            | Standard Play requires an explicit mode. Challenges retain intentional seeded/random variety.                                |
| Arena schedule         | Server-owned, epoch-derived, five-minute schedule per standard mode; queue entry locks the displayed arena.                  |
| Rematches              | Keep the selected mode but use the newly active arena if the schedule changed.                                               |
| Fighter selection      | Persist selection from Fighters; allow changes before readiness; retire standard Draft and Character Select.                 |
| Viewport               | Fixed logical 16:9 world visibility with responsive FIT scaling and safe-area UI.                                            |
| Standard arena size    | Target approximately 40×24 tiles, preserving 48px tiles and existing movement/stamina physics initially.                     |
| Battle Royale arena    | One approximately 56×34 map with four authored regions.                                                                      |
| Camera                 | Center local player, clamp at world bounds, and compose transient kick/shake/zoom/roll separately.                           |
| Navigation aids        | Minimap on all large arenas; Battle Royale also has an input-opened tactical map.                                            |
| Art direction          | Browser-efficient stylized comic 2D; modernize rather than replace the six fighter identities.                               |
| Art production         | AI-assisted in-repo pipeline, approved reference art, human consistency cleanup, atlases, provenance, and performance gates. |
| Performance            | Target stable 60 FPS on desktop and recent mid-range mobile; automatically reduce cosmetic effects when necessary.           |
| Battle Royale roster   | Eight-player solo free-for-all; immediate start at eight humans or bot-fill every empty slot at the 15-second deadline.      |
| Battle Royale life     | One life, no respawn/revival; eliminated humans may spectate or leave to Results.                                            |
| Battle Royale duration | Typical match target is 6–8 minutes.                                                                                         |
| Battle Royale systems  | Keep fighter abilities, grenades, healing, and armor; disable random chaos mutators.                                         |
| Battle Royale loadout  | Spawn with fists, hold one gun, use universal reserve ammo, discard an empty gun back to fists.                              |
| Pickup behavior        | Auto-equip only while unarmed; otherwise show a comparison and use reload contextually to swap.                              |
| Dropped guns           | A swap drops the old gun with rarity and loaded ammunition; universal reserve stays with the player.                         |
| Containers             | Break by attacking; every container guarantees one gun plus a small supply bundle.                                           |
| Elimination loot       | Compact pile: held gun, loaded ammo, universal reserve, and one bundled sustain pickup.                                      |
| Arsenal                | Rifle, pistol, shotgun, SMG, sniper rifle, launcher.                                                                         |
| Rarity                 | Damage only; Common 0.8×, Uncommon 0.9×, Rare 1.0×, Epic 1.1×, Legendary 1.2×, Mythical 1.3×.                                |
| Rarity weights         | Common 10%, Uncommon 70%, Rare 10%, Epic 6%, Legendary 3%, Mythical 1%.                                                      |
| Rarity colors          | Grey, green, blue, purple, orange, red in ascending order.                                                                   |
| Safe zones             | Deterministic server-seeded moving circles with preview, closing, hold, and final phases.                                    |
| Battle Royale records  | Separate matches, wins, top-three finishes, eliminations, damage, and best placement.                                        |
| Persistence            | Additive normalization only; never reset existing player records.                                                            |
| Exclusions             | No accounts, monetization, shop, currency, unlock economy, squads, revival, transport/drop phase, or Battle Royale parties.  |

## Architecture contract

### Matchmaking and lobby truth

- Introduce shared `MatchFormat`, `MatchIntent`, participant-source,
  party-member, readiness, and compatibility types. The server validates every
  roster, mode, fighter, and fill combination.
- Add discriminated party messages for create, join, leave, intent update,
  readiness, kick, and authoritative state. Rooms are ephemeral and
  collision-safe; leadership transfers to the earliest remaining member.
- Add a server lobby-configuration snapshot containing feature capabilities,
  authoritative server time, and each mode's `mapName` and `rotationEndsAt`.
  Clients display this truth and never author schedule outcomes.
- Replace separate Duel/Rumble/Crew join requests with a generalized intent
  after a compatibility window. Keep `FORCE_MAP` and `FORCE_MODE` diagnostics.

### World, camera, and presentation

- Use separate world-space and screen-space APIs. All aiming, touch, markers,
  particles, lighting, decals, and overlays must declare their coordinate
  domain.
- A camera controller owns base follow/clamping. Recoil, shake, zoom, and roll
  are transient layers and cannot overwrite base scroll state.
- Replace playfield-sized render textures with viewport/chunk resources,
  culling, and pooled effects before any larger arena is enabled.
- Keep equal logical world visibility across devices. Safe-area layout may
  move HUD elements but may not grant a wider competitive view.

### Battle Royale state

- Add optional `WeaponRarity`, weapon-instance, universal-ammo, container,
  dropped-weapon, compact-loot, safe-zone, placement, and spectator state to
  shared contracts. Standard-mode snapshots retain existing semantics.
- Extend map metadata with named regions, landmarks, container spawns,
  minimap data, and authored Battle Royale spawn groups.
- Extend persistence additively with a normalized Battle Royale record.
- Apply rarity damage on the server after ordinary weapon falloff and before
  the existing authoritative damage choke point completes attribution.

## Release gates

Feature code is pushed continuously behind server-advertised capabilities.
Production deployment happens only at a gate or for an urgent live fix.

### Reforged Arena gate — after Batch 39

- All five tabs and every preserved activity are reachable with pointer,
  keyboard, gamepad, and touch where applicable.
- Parties, explicit mode choice, scheduled arenas, persistent fighters,
  rematches, disconnects, and bot fallback pass integration coverage.
- Six 40×24 arenas pass validation and every supported mode/bot walkthrough.
- Camera, input transforms, HUD, minimap, lighting, decals, effects, and map
  edges pass desktop and mobile E2E/visual checks.
- Modern art is coherent from Boot through Results with no required legacy
  placeholder visible.
- Client meets the 60 FPS target or enters the documented reduced-effects
  tier; authoritative ticks stay within the 50ms budget.
- Main tester completes a real multi-client walkthrough and explicitly signs
  off before capabilities are enabled in production.

### Battle Royale gate — after Batch 51

- One-human-plus-bots, partial-human, and full-eight-human queues all launch
  according to the locked 15-second contract.
- Loot, rarity, ammo, swaps, containers, compact death piles, moving circles,
  bots, elimination, spectating, placement, Results, and persistence pass
  deterministic and integration coverage.
- The 56×34 four-biome arena is connected, readable, spawn-safe, navigable by
  bots, and represented accurately on minimap/tactical map.
- Eight-fighter simulation and rendering pass network, tick, memory, and frame
  budgets on desktop and mobile quality tiers.
- Real playtests land in the 6–8 minute target without unresolved blockers.
- Server deploys before client capability exposure; production health and a
  live end-to-end smoke both pass.

## Batch overview

|   # | Batch                                  | Milestone     | Status                |
| --: | -------------------------------------- | ------------- | --------------------- |
|   1 | Roadmap bootstrap                      | Safety rails  | **DONE — 2026-07-15** |
|   2 | Baseline evidence                      | Safety rails  | **DONE — 2026-07-15** |
|   3 | Capabilities and flags                 | Safety rails  | **DONE — 2026-07-15** |
|   4 | Responsive menu foundation             | Navigation    | **DONE — 2026-07-15** |
|   5 | Play roster builder                    | Navigation    | NEXT                  |
|   6 | Fighters tab                           | Navigation    | Pending               |
|   7 | Challenges tab                         | Navigation    | Pending               |
|   8 | Records tab                            | Navigation    | Pending               |
|   9 | Settings tab                           | Navigation    | Pending               |
|  10 | Scheduled arenas                       | Navigation    | Pending               |
|  11 | General match intent                   | Navigation    | Pending               |
|  12 | Party core                             | Navigation    | Pending               |
|  13 | Party readiness and recovery           | Navigation    | Pending               |
|  14 | Queue fallback                         | Navigation    | Pending               |
|  15 | Results and rematches                  | Navigation    | Pending               |
|  16 | Legacy flow retirement                 | Navigation    | Pending               |
|  17 | Journey verification                   | Navigation    | Pending               |
|  18 | Gameplay viewport cutover              | World/camera  | Pending               |
|  19 | Coordinate separation                  | World/camera  | Pending               |
|  20 | Camera controller                      | World/camera  | Pending               |
|  21 | Dynamic world rendering                | World/camera  | Pending               |
|  22 | Responsive combat HUD                  | World/camera  | Pending               |
|  23 | Minimap foundation                     | World/camera  | Pending               |
|  24 | Camera regression gate                 | World/camera  | Pending               |
|  25 | Style bible                            | Visual system | Pending               |
|  26 | Asset pipeline                         | Visual system | Pending               |
|  27 | Modern UI assets                       | Visual system | Pending               |
|  28 | Fighter art I                          | Visual system | Pending               |
|  29 | Fighter art II                         | Visual system | Pending               |
|  30 | Weapons and pickups                    | Visual system | Pending               |
|  31 | Biome environment kit                  | Visual system | Pending               |
|  32 | Modern combat feedback                 | Visual system | Pending               |
|  33 | Full-journey visual cutover            | Visual system | Pending               |
|  34 | Map authoring contract                 | Large arenas  | Pending               |
|  35 | Wasteland Outpost and Overgrown Suburb | Large arenas  | Pending               |
|  36 | Scrapyard and Collapsed Overpass       | Large arenas  | Pending               |
|  37 | Checkpoint Zero and Rusted Refinery    | Large arenas  | Pending               |
|  38 | Mode and bot rebalance                 | Large arenas  | Pending               |
|  39 | Reforged Arena release gate            | Large arenas  | Pending               |
|  40 | Battle Royale lifecycle                | Battle Royale | Pending               |
|  41 | Eight-slot queue                       | Battle Royale | Pending               |
|  42 | Weapon instances and rarity            | Battle Royale | Pending               |
|  43 | Single-slot inventory                  | Battle Royale | Pending               |
|  44 | Containers and loot                    | Battle Royale | Pending               |
|  45 | Four-biome arena                       | Battle Royale | Pending               |
|  46 | Safe-zone phases                       | Battle Royale | Pending               |
|  47 | Battle Royale bots                     | Battle Royale | Pending               |
|  48 | Spectating                             | Battle Royale | Pending               |
|  49 | Battle Royale records                  | Battle Royale | Pending               |
|  50 | Network and performance hardening      | Battle Royale | Pending               |
|  51 | Battle Royale release gate             | Battle Royale | Pending               |
|  52 | Production rollout                     | Rollout       | Pending               |
|  53 | Visionary/tester response              | Rollout       | Pending               |
|  54 | Legacy cleanup                         | Rollout       | Pending               |

## Batch specifications

### Milestone 0 — Living contract and safety rails

#### Batch 1 — Roadmap bootstrap

Create this living roadmap with the decision ledger, ordered batch table,
release gates, bug ledger, session log, batch ritual, and handoff template.
Update repository orientation docs to point here while retaining the completed
Replayability Roadmap as history.

Acceptance:

- [x] Locked product and architecture decisions are recorded.
- [x] All 54 batches are dependency ordered and status tracked.
- [x] Release gates and dynamic bug rules are explicit.
- [x] README and `CLAUDE.md` direct future sessions to this roadmap.
- [x] No runtime code or completed historical roadmap content changed.

#### Batch 2 — Baseline evidence

Capture current unit, typecheck, lint, desktop/mobile E2E, and visual status;
record server tick, representative snapshot size, and client frame baselines;
inventory camera/world-coordinate assumptions; reproduce adjacent known bugs.
Commit evidence and test helpers only—do not begin capabilities or UI work.

Acceptance:

- [x] Unchanged runtime typecheck, lint, unit/integration, desktop, Firefox,
      mobile-landscape, and current visual status are recorded.
- [x] Repeatable helpers record authoritative tick processing, effective loop
      pacing, representative two/four-player snapshot sizes, and client frame
      timing without imposing machine-specific pass thresholds.
- [x] Fixed-canvas, camera, aiming, touch, HUD, overlay, render-target, and
      world-coordinate assumptions are inventoried for Batches 18-24.
- [x] Adjacent camera-composition bugs have deterministic reproduction tests;
      observed non-Chromium E2E limitations have evidence and explicit future
      dispositions.
- [x] Only evidence, tests, recorder helpers, and documentation changed; no
      Batch 3 capability or product UI work began.

#### Batch 3 — Capabilities and flags

Add server-advertised, backward-compatible feature capabilities for the new
shell, schedules, large worlds, modern art, and Battle Royale. Default every
unfinished capability off, cover old/new handshake combinations, document the
server-first rollout order, and preserve all current routes when disabled.

Acceptance:

- [x] The reliable welcome handshake advertises complete server-owned flags for
      the new shell, schedules, large worlds, modern art, and Battle Royale.
- [x] Every unfinished capability is a strict opt-in and defaults off.
- [x] Old-server/new-client, new-server/old-client, partial, malformed,
      reconnect, and disconnect behavior fails closed without breaking the
      legacy player-id welcome contract.
- [x] Disabled capabilities preserve every established route and no
      capability-owned product feature was enabled or implemented.
- [x] The server-first rollout, rollback, flag registry, and compatibility
      matrix are documented in `docs/REFORGED_CAPABILITIES.md`.

### Milestone 1 — Clean navigation and intentional matchmaking

#### Batch 4 — Responsive menu foundation

Introduce the logical 16:9 menu layout, safe-area helpers, modern design
tokens, shared focus/navigation behavior, and an empty five-tab shell behind
its capability. Existing Lobby remains the fallback.

Acceptance:

- [x] The capability-owned menu uses a 1280×720 logical FIT surface with
      reusable safe-area conversion helpers; the legacy 960×720 gameplay and
      Lobby surface remains unchanged when the shell is inactive.
- [x] Frozen modern layout, color, typography, control, and motion tokens drive
      an intentionally empty Play, Fighters, Challenges, Records, and Settings
      shell without moving or implementing any activity.
- [x] Shared wrapping focus/navigation behavior and the tab controls work with
      pointer, keyboard, standard gamepad, and touch-sized targets.
- [x] Only a literal normalized `newShell: true` welcome opens the shell; old,
      false, absent, partial, malformed, reconnecting, and disconnected states
      retain or restore the complete existing Lobby fallback.
- [x] Desktop and mobile-landscape layout/input checks pass behind the temporary
      test-only server opt-in; all five production capability defaults remain
      false and no Batch 5 roster-builder behavior began.

#### Batch 5 — Play roster builder

Implement a pure, exhaustively tested builder for format, human/bot
composition, compatible mode, current scheduled arena, selected fighter, and
review. Invalid combinations must never become selectable or serializable.

#### Batch 6 — Fighters tab

Move roster browsing, stats, abilities, mastery, and persistent fighter
selection into Fighters. Play reads the persisted selection; server locking
remains authoritative.

#### Batch 7 — Challenges tab

Relocate Spar, Scrap Pit, Gauntlet, Daily Run, Practice Setup, and Build Codex
without changing challenge rules, saved progress, or deliberate randomness.

#### Batch 8 — Records tab

Consolidate career, leaderboards, rivalry, mastery, and challenge records into
readable sections with reserved zero-state space for Battle Royale records.

#### Batch 9 — Settings tab

Relocate callsign, audio, controls, graphics quality, fullscreen, and signal
recovery. Ask for a callsign only when none is stored; do not add accounts.

#### Batch 10 — Scheduled arenas

Implement epoch-derived five-minute per-mode schedules with deterministic
mode offsets, server clock synchronization, queue-time locking, and FORCE
diagnostics. Clients display only server-authored schedule snapshots.

#### Batch 11 — General match intent

Introduce validated match intents for Duel, Rumble, and Crew, retain each
format's compatible modes, and remove random standard mode/map selection while
the legacy join messages remain temporarily compatible.

#### Batch 12 — Party core

Implement collision-safe codes/links, joining, format capacity, leader-owned
intent, member fighter visibility, kick/leave, and empty-room expiry for Duel,
Rumble, and Crew only.

#### Batch 13 — Party readiness and recovery

Add member readiness, leader transfer, reconnect/disconnect cleanup, open
human slots, cancellation, and stale/replayed message rejection. Preserve the
party through queue, match, Results, and valid rematches.

#### Batch 14 — Queue fallback

After 15 seconds waiting on requested humans, show a confirmed bot-fill action.
Never change the intent automatically; cancellation and connection loss must
leave no phantom queue or party state.

#### Batch 15 — Results and rematches

Render the retained party, revalidate readiness/format, preview schedule
changes, and use the current active arena for a rematch when a slot expired.

#### Batch 16 — Legacy flow retirement

Remove standard Draft and post-matchmaking Character Select routing after the
new capability is proven. Retain challenge-specific setup and server-side
fighter validation; keep transitional wire compatibility until Batch 54.

#### Batch 17 — Journey verification

Exercise every tab, preserved activity, standard roster, party path, queue,
schedule boundary, rematch, disconnect, and old-client fallback using pointer,
keyboard, gamepad, and touch.

### Milestone 2 — Scrolling-world and HUD foundation

#### Batch 18 — Gameplay viewport cutover

Replace the fixed 4:3 board plus bottom strip with a fixed logical 16:9 world
view and safe-area overlay contract behind the large-world capability.

#### Batch 19 — Coordinate separation

Centralize screen/world transforms for aim, touch, cursor, particles,
objectives, markers, and overlays. Add deterministic tests before scrolling.

#### Batch 20 — Camera controller

Add exact local-player follow, world-edge clamping, respawn and spectator
targets, and separate transient kick/shake/zoom/roll layers.

#### Batch 21 — Dynamic world rendering

Make maps, collision, destruction, lighting, decals, storms, and effects use
actual dimensions, chunks, culling, pools, and quality budgets rather than
960×576 full-playfield assumptions.

#### Batch 22 — Responsive combat HUD

Rebuild health, armor, stamina, ammo, ability, mode status, kill feed,
callouts, touch actions, and menus as prioritized safe-area overlays.

#### Batch 23 — Minimap foundation

Project map bounds, solids, landmarks, objectives, local player, and allies
where applicable without depending on camera culling or client authority.

#### Batch 24 — Camera regression gate

Verify center follow, every edge/corner, aiming while scrolling, touch,
screen-space effects, minimap accuracy, quality fallback, and frame pacing.

### Milestone 3 — Modern visual system

#### Batch 25 — Style bible

Generate and approve original reference sheets for fighters, environments,
UI, guns, rarity effects, lighting, line weight, color hierarchy, and motion.
Do not bulk-generate production assets before the golden references pass.

#### Batch 26 — Asset pipeline

Establish source/reference folders, cleanup and consistency rules, atlas
generation, import metadata, naming, provenance/attribution, compression, and
automated dimension/frame validation.

#### Batch 27 — Modern UI assets

Replace tab, card, button, icon, typography, party, queue, tactical-map, and
Results chrome while keeping focus, contrast, touch target, and fallback tests.

#### Batch 28 — Fighter art I

Modernize Mighty Man, Bruce, and Frost Wizard across directional idle,
movement, attack, ability, damage, and death states without changing mechanics.

#### Batch 29 — Fighter art II

Modernize Bubba, Jack, and Rook with equivalent coverage, including Jack's
weapon state and Rook's synchronized visual layers.

#### Batch 30 — Weapons and pickups

Produce coherent held, firing, ground, HUD, ammo, container, and rarity-aura
assets for six guns plus existing sustain pickups.

#### Batch 31 — Biome environment kit

Produce seamless terrain, walls, low cover, damage states, props, landmarks,
shadows, and transitions for wasteland, overgrown, industrial, and irradiated
families with explicit collision readability.

#### Batch 32 — Modern combat feedback

Replace muzzle, impact, explosion, healing, armor, ability, rarity, zone, and
elimination effects with pooled, quality-tiered equivalents.

#### Batch 33 — Full-journey visual cutover

Cut Boot through Results to the approved style together. Remove a legacy asset
only when every live use has a verified modern replacement and provenance is
updated.

### Milestone 4 — Four-times-larger standard arenas

#### Batch 34 — Map authoring contract

Extend validation/tooling for 40×24 maps, regions, landmarks, minimaps,
connectivity, objectives, spawns, pickups, gates, hazards, and symmetry.

#### Batch 35 — Wasteland Outpost and Overgrown Suburb

Hand-author recognizable 40×24 successors with balanced routes, objectives,
spawns, pickup economy, destruction, landmarks, and minimaps.

#### Batch 36 — Scrapyard and Collapsed Overpass

Hand-author their 40×24 successors with readable industrial landmarks,
flanking paths, objectives, destruction, and minimaps.

#### Batch 37 — Checkpoint Zero and Rusted Refinery

Hand-author their 40×24 successors with readable barricades, gates, vaults,
objectives, destruction, and minimaps.

#### Batch 38 — Mode and bot rebalance

Validate all eight modes, Crew compatibility, spawn safety, objective travel,
pickup density, bot navigation, and regulation pacing. Keep base movement and
stamina unchanged unless evidence creates a separate tuning batch.

#### Batch 39 — Reforged Arena release gate

Run the complete gate above, resolve blockers as recorded batches, deploy
server-first, enable the coherent Reforged capability, and smoke production.

### Milestone 5 — Battle Royale

#### Batch 40 — Battle Royale lifecycle

Add the format, one-life elimination, deterministic placement/winner rules,
disabled respawn/mutator hooks, and mode-specific Results foundations.

#### Batch 41 — Eight-slot queue

Implement immediate eight-human launch and the 15-second bot-fill deadline,
plus cancellation, duplicate protection, and pre-launch disconnect handling.

#### Batch 42 — Weapon instances and rarity

Add rarity-aware weapon instances and authoritative damage; implement SMG,
sniper rifle, and launcher without changing standard weapon semantics.

#### Batch 43 — Single-slot inventory

Implement fists, universal reserve, loaded ammo, contextual pickup/reload,
empty-gun discard, intentional swap, and dropped weapon state.

#### Batch 44 — Containers and loot

Add attack-opened containers, guaranteed gun rolls, supply bundles, rarity
auras/comparisons, contested collection, and compact elimination piles.

#### Batch 45 — Four-biome arena

Author the 56×34 arena with eight balanced spawn groups, four named regions,
transitions, landmarks, routes, containers, sustain, cover, and map UI.

#### Batch 46 — Safe-zone phases

Implement deterministic nested circles, preview/closing/hold phases,
escalating outside damage, final closure, warnings, minimap, and tactical map.

#### Batch 47 — Battle Royale bots

Teach bots to open/compare loot, manage ammo/sustain, plan for current/next
zones, select targets, fight, and increase aggression in final phases.

#### Batch 48 — Spectating

Add target cycling, placement/alive count, killer context, tactical map, leave
to Results, disconnect behavior, and automatic final Results.

#### Batch 49 — Battle Royale records

Persist and render matches, wins, top-three finishes, eliminations, damage, and
best placement separately from existing PvP totals.

#### Batch 50 — Network and performance hardening

Profile eight fighters, bots, projectiles, containers, loot, zones, effects,
snapshot traffic, tick time, memory, and frame pacing; optimize without moving
authority client-side.

#### Batch 51 — Battle Royale release gate

Run the complete gate above, insert/fix blockers, deploy server-first, enable
the capability, and complete production health plus live match smokes.

### Milestone 6 — Live rollout and feedback

#### Batch 52 — Production rollout

Verify compatible server/client versions, capabilities, schedules, persistence,
health, real devices, all standard paths, and Battle Royale in production.

#### Batch 53 — Visionary/tester response

Turn structured playtest feedback into measured tuning, adjacent fixes, or
explicitly inserted roadmap batches. Do not silently reopen completed systems.

#### Batch 54 — Legacy cleanup

After a stable observation period, remove disabled Draft/Character Select
code, transitional messages, fixed-canvas paths, obsolete assets, and expired
flags with full regression and rollback notes.

## Test contract

- Shared utilities receive deterministic coverage for schedules,
  compatibility, party transitions, rarity rolls, damage, zones, loot,
  placement, persistence normalization, and coordinate transforms.
- Server integration covers rooms, leadership, readiness, open slots, bot
  confirmation, schedules, rematches, eight-slot fill, disconnects,
  elimination, spectating, and persistence.
- E2E covers Chromium, Firefox, and mobile landscape. Pointer, keyboard,
  gamepad, and touch must reach every relevant player-facing action.
- Visual regression covers five tabs, party/queue, six fighters, representative
  biomes, HUD modes, map edges, minimap/tactical map, rarities, spectator, and
  Results.
- Performance requires the authoritative 20Hz simulation to remain inside its
  50ms tick budget and the client to hold 60 FPS or enter the documented
  reduced-effects tier.

## Dynamic bug ledger

### Insertion rules

1. A tightly coupled, low-risk bug may be fixed inside the active batch and
   must be recorded in that batch's Session Log entry.
2. A larger bug blocking the next dependency becomes an inserted batch such
   as `42A`, with its own reproduction, acceptance, tests, docs, commit, push,
   and handoff.
3. A non-blocking unrelated bug enters the table below and is scheduled
   deliberately. It does not silently expand the active batch.
4. Existing user changes are never discarded or staged accidentally.

| ID      | Discovered | Reproduction/evidence                                                                                              | Relationship  | Disposition                                                                                                 | Status |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| RFG-001 | 2026-07-15 | Idle `CameraKick.update()` clears a sustained `(320, 144)` base scroll to `(0, 0)`.                                | Batches 20/24 | Replace with composed transient offsets in Batch 20; gate in 24.                                            | Open   |
| RFG-002 | 2026-07-15 | Idle `ZoomPulse.update()` clears a sustained base zoom of `0.9` back to `1`.                                       | Batches 20/24 | Replace with composed transient zoom in Batch 20; gate in 24.                                               | Open   |
| RFG-003 | 2026-07-15 | Headless Firefox/WebKit live practice gets no player ID; staged gameplay and Reforged-shell WebKit PNGs are black. | Batches 17/24 | Keep staged assertions plus Chromium visual evidence; restore trustworthy non-Chromium visual path by gate. | Open   |

## End-of-batch ritual

Run this at the end of every numbered or inserted batch.

1. **Verify scope and worktree:** inspect status/diff, preserve unrelated work,
   and confirm only the active batch was implemented.
2. **Verify behavior:** run focused tests plus `pnpm typecheck`, `pnpm lint`,
   and `pnpm test`; run relevant desktop/mobile E2E, visual, manual, network,
   and performance checks for affected flows.
3. **Update docs:** check acceptance, update status and Session Log, record
   deviations/bugs/tuning, and update README, `CLAUDE.md`, architecture docs,
   attribution, and asset provenance when affected.
4. **Clean up:** remove temporary/dead code and keep balance/config constants
   centralized and frozen.
5. **Commit and push:** commit directly to `main` using Conventional Commits,
   stage only intended files, and push.
6. **Deploy only when authorized by the roadmap:** milestone gate or urgent
   production fix. Record deployment, health, smoke evidence, or why skipped.
7. **Hand off to a fresh session:** the final response must always include a
   fenced, paste-ready prompt intended to start a new Codex session. If the
   batch completed, target the next batch; if incomplete or blocked, resume the
   same batch. Include all carry-over warnings and never rely on conversation
   context surviving.

## Fresh-session prompt contract

Every session ends with a prompt the user can copy directly into a new Codex
task. This is mandatory for implementation, documentation, verification,
release, tuning, inserted-bug, and blocked sessions.

The prompt must state:

- the repository/program name and the roadmap plus `CLAUDE.md` read-first
  requirement;
- the exact next or resumed batch number and title;
- a strict instruction to implement only that batch;
- relevant verification and end-of-batch ritual requirements;
- the current commit, push, and deployment state;
- every known issue, deviation, unfinished item, or environmental warning;
- the following batch number when known, so the next handoff remains chained.

Put the prompt in a fenced `text` block in the final response. Do not replace it
with a link to this file, a summary, or an offer to provide it later.

## Roadmap amendments

### 2026-07-15 — Mandatory fresh-session prompt

At the user's request, made the paste-ready fresh-session prompt an explicit
non-optional result of every session, including incomplete and blocked work.
This clarifies the existing handoff ritual without changing batch scope or
release order.

## Session Log

### Batch 1 — 2026-07-15 — Roadmap bootstrap

**Shipped:** Established the Reforged living contract, locked decision ledger,
architecture contract, 54-batch dependency order, two public release gates,
test contract, dynamic bug protocol, per-batch ritual, and future-session
handoff. Updated repository orientation so the completed Replayability Roadmap
remains history while new work starts here.

**Verification:** `git diff --check` and the repository-local Prettier check
passed for the roadmap and orientation docs; confirmed no runtime files or
historical roadmap content changed. Runtime test suites were not required.

**Deployment:** Not applicable; Batch 1 changes documentation only and no
release capability exists yet.

**Deviations:** None.

**Known issues:** None discovered during Batch 1. Batch 2 owns measured baseline
evidence and adjacent bug reproduction.

### Batch 2 — 2026-07-15 — Baseline evidence

**Shipped:** Added repeatable server/network and cross-browser client frame
recorders, deterministic camera composition reproductions, and
`docs/REFORGED_BASELINE.md`. Captured the clean Batch 1 quality/E2E state,
current visual coverage, tick processing and pacing, two/four-player snapshot
sizes, headless client frame timing, fixed-world/camera assumptions, and the
three adjacent issues now listed in the bug ledger. No capability, navigation,
gameplay, UI, or art behavior changed.

**Verification:** The unchanged runtime baseline passed typecheck, lint, 1,331
unit/integration tests, and all three E2E projects (Chromium 47 passed/1
skipped, Firefox 39 passed/9 skipped, mobile landscape 40 passed/8 skipped).
After adding the evidence helpers, focused camera reproductions, server and
client recorders, typecheck, lint, the complete 106-file/1,333-test unit suite,
the complete three-project E2E suite (129 passed/18 expected skips), Prettier,
and `git diff --check` passed. Manual visual inspection confirmed a complete
unclipped live Chromium board/HUD and reproduced black staged gameplay captures
in headless Firefox/WebKit.

**Performance/network:** The 20Hz loop has a 50ms budget. A four-player
simulation measured 0.017ms mean, 0.035ms p95, 0.110ms p99, and 1.087ms max;
the live callback EMA was 0.108ms. The local live window also recorded one
254.279ms host event-loop drift reset (15.932 effective Hz despite a 20Hz
rolling counter). Representative active two/four-player UTF-8 JSON snapshots
were 2,481/3,762 bytes. Headless client samples are recorded in
`docs/REFORGED_BASELINE.md` as recorder output, not hardware gates.

**Deployment:** Skipped. Batch 2 contains evidence/test tooling and the roadmap
does not authorize a production deployment before a milestone gate or urgent
live fix.

**Deviations:** Firefox and mobile WebKit could not use the live local WebRTC
practice path, so their frame samples use a staged real `GameScene`; their
screenshots are black and their frame numbers are not directly comparable with
live Chromium. No screenshot binaries were committed. The local `pnpm` shim
selected a mismatched bundled pnpm, so verification used the repository's
declared pnpm 10.33.0 through Corepack.

**Known issues:** RFG-001 and RFG-002 are deterministic future-camera
composition blockers assigned to Batch 20/24. RFG-003 is a headless
non-Chromium network/visual harness limitation that must be resolved before the
relevant journey/camera visual gates. None blocks Batch 3 capability contracts.

### Batch 3 — 2026-07-15 — Capabilities and flags

**Shipped:** Extended the existing reliable `server:welcome` handshake with an
optional server-owned capability snapshot for the new shell, schedules, large
worlds, modern art, and Battle Royale. Added strict environment opt-ins that
default every capability off, a frozen fail-closed client normalization path,
connection-lifecycle resets, and a `GameService` accessor for future gated
routes. Covered absent, partial, malformed, new-server/legacy-reader,
reconnect, and disconnect combinations. Documented the flag registry,
compatibility matrix, server-first exposure order, and flag-first rollback in
`docs/REFORGED_CAPABILITIES.md`. No capability-owned feature, route, schedule,
world, art, or Battle Royale behavior was enabled or implemented.

**Verification:** Capability-focused shared/server/client coverage passed as
part of the complete 109-file/1,342-test unit/integration suite. Typecheck,
lint, and the full production build passed. The complete Playwright suite
passed with 129 tests and the established 18 expected skips across desktop
Chromium, desktop Firefox, and mobile landscape in 17.5 minutes. That suite
exercised the retained Lobby, challenge setup, Draft, Character Select, match,
recovery, and Results routes while all capability defaults remained false.
Repository Prettier and `git diff --check` passed for the intended Batch 3
files.

**Deployment:** Skipped. Batch 3 establishes disabled compatibility rails, and
the roadmap authorizes production deployment only at a milestone gate or for an
urgent live fix. No production capability flag was changed.

**Deviations:** None. The first focused server test invocation needed the
shared package rebuilt so `@shared/game` exposed the new runtime export; the
normal typecheck/build order produced the expected artifact and all final
verification passed.

**Known issues:** No new bugs were found, so the bug ledger is unchanged.
RFG-001 and RFG-002 remain assigned to Batches 20/24. RFG-003 remains the
documented headless Firefox/WebKit live-network and black staged-capture
limitation; staged frame measurements are still not hardware-comparable.

### Batch 4 — 2026-07-15 — Responsive menu foundation

**Shipped:** Added a capability-owned `ReforgedShellScene` on a responsive
1280×720 logical FIT surface, with viewport-to-logical safe-area conversion,
frozen modern design tokens, a reusable disabled-aware wrapping focus
navigator, and five persistent procedural tab controls. The empty Play,
Fighters, Challenges, Records, and Settings surfaces share pointer, keyboard,
gamepad, and touch behavior. The welcome boundary now publishes normalized
capability changes to scenes; only literal server-advertised `newShell: true`
opens the shell, while reconnection/disconnection restores the complete
960×720 Lobby. No activity moved, no roster builder or gameplay viewport work
began, and no production flag default changed.

**Verification:** Typecheck and lint passed. The complete 112-file/1,356-test
unit/integration suite passed, including deterministic safe-area, capability
route, and focus-navigation coverage. With `CAPABILITY_NEW_SHELL=true` only in
the local test process, the focused desktop Chromium and mobile-landscape shell
run passed its two applicable tests with two expected inverse-gate skips. It
covered 1280×720 sizing, 844×390 responsive FIT, safe bounds, pointer, keyboard,
gamepad, touch, literal capability entry, and reconnect restoration to the
960×720 Lobby. Manual inspection found the desktop and 844×390 Chromium shell
captures complete and unclipped. The production build passed. With every
capability at its default false value, the complete 153-case Playwright matrix
finished with 132 passed and the established/new inverse-gate 21 expected skips
across desktop Chromium, desktop Firefox, and mobile landscape in 16.8 minutes;
the legacy Lobby fallback check passed in all three projects. Repository
Prettier and `git diff --check` also passed for the intended Batch 4 files.

**Deployment:** Skipped. Batch 4 is incomplete milestone code behind a disabled
server capability, and the roadmap authorizes production deployment only at a
release gate or for an urgent live fix. No production environment or capability
flag changed.

**Deviations:** Headless mobile WebKit again failed to receive the live local
WebRTC welcome under RFG-003, so its shell route used a staged complete welcome
at the existing normalized client boundary. Real shell layout and input objects
were exercised, while visual review used mobile-sized Chromium. The staged
WebKit shell PNG was also black, broadening RFG-003 from staged gameplay pixels
to staged Phaser canvas pixels; it remains non-hardware-comparable evidence.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain assigned
to Batches 20/24 and were untouched. RFG-003 now explicitly includes the black
staged Reforged-shell WebKit capture in addition to its existing live-network
and staged-gameplay limitations. None blocks Batch 5's pure roster builder.

## Next-session prompt

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md and docs/REFORGED_CAPABILITIES.md before
implementation. Implement Batch 5 — Play roster builder exactly as specified.
Preserve unrelated changes and do not begin Batch 6 — Fighters tab.

Implement a pure, exhaustively tested Play roster builder for format, human/bot
composition, compatible explicit mode, current scheduled arena, selected
fighter, and review. Invalid combinations must never become selectable or
serializable. Build only inside the capability-owned Play tab; preserve the
empty Fighters, Challenges, Records, and Settings tabs and the complete legacy
Lobby fallback. Do not move activities, implement parties/schedules/general
match intent, retire Draft or Character Select, enable capabilities, change the
gameplay viewport/camera, or begin modern art.

Batch 4 is complete and pushed on main; the 16:9 safe-area shell and shared
navigation foundation remain behind `newShell`, all five strict server
capability flags default false, and no deployment was required. Update the
roadmap acceptance evidence and Session Log, run the complete end-of-batch
ritual, commit and push directly to main, skip deployment unless the roadmap
explicitly authorizes it, and end with the fenced paste-ready prompt for Batch 6.

Carry-over warnings: RFG-001 CameraKick and RFG-002 ZoomPulse overwrite future
base camera state and remain assigned to Batches 20/24. RFG-003 means headless
Firefox/WebKit cannot use the live local WebRTC practice path and staged
gameplay screenshots are black; staged frame numbers are not
hardware-comparable. The local Batch 2 live-loop sample recorded a 254.279ms
host scheduling drift reset and 15.932 effective Hz while simulation processing
remained far below the 50ms budget. Batch 4 broadened RFG-003 evidence: the
staged mobile WebKit Reforged-shell PNG is also black, so use mobile-sized
Chromium for visual evidence while retaining staged WebKit object/input
assertions. Use Corepack pnpm 10.33.0 if the local pnpm shim selects a mismatched
version. Batch 6 follows Batch 5.
```
