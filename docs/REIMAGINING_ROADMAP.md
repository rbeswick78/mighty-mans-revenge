# Mighty Man's Revenge: Reforged Roadmap

This document is the living contract for the multi-session Reforged program.
Read this file and `CLAUDE.md` completely at the start of every batch. The
completed `docs/REPLAYABILITY_ROADMAP.md` remains the historical record for the
systems this program preserves and reorganizes.

- **Status:** Batch 17 complete on 2026-07-16; navigation milestone awaiting
  user review.
- **Next batch:** Batch 18 — Gameplay viewport cutover, only after explicit
  milestone-review approval.
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
|   5 | Play roster builder                    | Navigation    | **DONE — 2026-07-15** |
|   6 | Fighters tab                           | Navigation    | **DONE — 2026-07-15** |
|   7 | Challenges tab                         | Navigation    | **DONE — 2026-07-15** |
|   8 | Records tab                            | Navigation    | **DONE — 2026-07-15** |
|   9 | Settings tab                           | Navigation    | **DONE — 2026-07-15** |
|  10 | Scheduled arenas                       | Navigation    | **DONE — 2026-07-15** |
|  11 | General match intent                   | Navigation    | **DONE — 2026-07-15** |
|  12 | Party core                             | Navigation    | **DONE — 2026-07-15** |
|  13 | Party readiness and recovery           | Navigation    | **DONE — 2026-07-15** |
|  14 | Queue fallback                         | Navigation    | **DONE — 2026-07-15** |
|  15 | Results and rematches                  | Navigation    | **DONE — 2026-07-15** |
|  16 | Legacy flow retirement                 | Navigation    | **DONE — 2026-07-15** |
|  17 | Journey verification                   | Navigation    | **DONE — 2026-07-16** |
|  18 | Gameplay viewport cutover              | World/camera  | Review gate           |
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

Acceptance:

- [x] A pure reducer covers Duel, 2–4 fighter Rumble, and Crew 2v2 with exact
      human/bot requests, explicit compatible modes, an injected current arena,
      all registered fighters, reversible steps, and a reviewed local draft.
- [x] The UI derives every option from the same compatibility model used by the
      fail-closed serializer; malformed, out-of-order, incompatible, missing,
      stale-arena, and unknown-fighter combinations cannot become selectable or
      serializable, with all 624 legal products covered deterministically.
- [x] The builder exists only inside the capability-owned Play tab. Fighters,
      Challenges, Records, and Settings remain empty, while false/absent flags,
      reconnects, and disconnects preserve the complete legacy Lobby fallback.
- [x] Pointer, keyboard, standard gamepad, and touch reach the guided flow on
      desktop and mobile landscape; dense options and review remain safe-area
      bounded in Chromium visual evidence, with staged WebKit object/input
      assertions retained under RFG-003.
- [x] The reviewed value remains a presentation-only draft with match entry
      disabled. No party, server schedule authority, generalized match intent,
      Draft/Character Select retirement, capability default, gameplay viewport,
      camera, activity relocation, or modern art work began.

#### Batch 6 — Fighters tab

Move roster browsing, stats, abilities, mastery, and persistent fighter
selection into Fighters. Play reads the persisted selection; server locking
remains authoritative.

Acceptance:

- [x] The capability-owned Fighters tab browses all six registry fighters with
      their shared HP/speed identity, canonical ability rules, and complete
      mastery presentation from the latest existing server-authored snapshot.
- [x] A registry-normalized device-local fighter preference defaults safely to
      Mighty Man, persists across scene recreation, and is selectable through
      pointer, touch, keyboard, and standard gamepad paths.
- [x] Play consumes the persisted fighter without duplicating roster browsing,
      while the unchanged Batch 5 pure reducer and fail-closed serializer still
      validate the fighter in every reviewed local draft.
- [x] Character Select and server locking remain authoritative, match entry
      remains disabled, and no challenge activity, party, scheduled arena,
      generalized intent, viewport/camera, capability default, or art work began.
- [x] Challenges, Records, and Settings remain empty; false/absent capability,
      reconnect, and disconnect behavior retain the complete legacy Lobby
      fallback.

#### Batch 7 — Challenges tab

Relocate Spar, Scrap Pit, Gauntlet, Daily Run, Practice Setup, and Build Codex
without changing challenge rules, saved progress, or deliberate randomness.

Acceptance:

- [x] The capability-owned Challenges tab exposes Spar, Scrap Pit, Gauntlet,
      Daily Run, Practice Setup, and the complete six-build Codex on the shared
      responsive shell surface with pointer, touch, keyboard, and standard
      gamepad paths.
- [x] Spar and Scrap Pit send the established saved difficulty, compatible
      mode, rival, and mutator preferences through the unchanged
      `client:startPractice` path; Gauntlet and Daily omit those optional pins
      and retain fixed server-authored difficulty, routes, rivals, forecasts,
      scoring, seeded randomness, and persistence behavior.
- [x] Existing device-local nickname, practice setup, Scrap Pit, Gauntlet,
      Daily, and Build Codex storage keys and normalization remain the only
      client persistence; missing callsign fails closed without beginning the
      Settings tab's Batch 9 editor.
- [x] The established server-authored `matchFound` transition still opens the
      unchanged Character Select path at the legacy gameplay size. Challenge
      Results, rematches, Draft, server locking, and every server/shared rule
      remain unchanged.
- [x] Batch 5 Play serialization and Batch 6 Fighters selection remain intact,
      Records and Settings stay empty, every capability default stays false,
      and false/absent capability behavior preserves the complete legacy Lobby
      including all six original challenge controls.

#### Batch 8 — Records tab

Consolidate career, leaderboards, rivalry, mastery, and challenge records into
readable sections with reserved zero-state space for Battle Royale records.

Acceptance:

- [x] The capability-owned Records tab consolidates career reputation and
      streak context, the server-ordered all-time and current Daily top-five
      boards, the latest lifetime rivalry/set snapshot, all six fighter
      mastery totals, all six arena mastery totals, and every established
      device-local challenge record into readable sections.
- [x] Records consumes only the existing server-authored leaderboard, Daily,
      match-result, fighter-mastery, and arena-mastery snapshots plus the
      established Scrap Pit, Gauntlet, Daily, Build Codex, and Crew Tour
      normalizers and storage keys. Recording rules, normalization, authority,
      saved values, scoring, ranking, retention, rematches, and wire contracts
      are unchanged.
- [x] Battle Royale has an explicit reserved zero state for matches, wins,
      top-three finishes, eliminations, damage, and best placement without
      adding persistence, gameplay, inferred values, or a new record category.
- [x] Pointer, touch, keyboard, and standard gamepad paths reach every read-only
      section on desktop and mobile landscape; desktop and mobile-sized
      Chromium evidence is safe-area bounded and readable, while staged WebKit
      retains object/input assertions under RFG-003.
- [x] Batch 5 Play serialization, Batch 6 Fighters selection and server lock,
      Batch 7 Challenges and Character Select routing, the empty Settings tab,
      default-false capabilities, and the complete legacy Lobby fallback remain
      intact. No Batch 9 or later feature work began.

#### Batch 9 — Settings tab

Relocate callsign, audio, controls, graphics quality, fullscreen, and signal
recovery. Ask for a callsign only when none is stored; do not add accounts.

Acceptance:

- [x] The capability-owned Settings tab presents Callsign, Audio, Controls,
      Graphics, Display, and Signal only. A stored callsign is shown without a
      prompt; a missing value opens the editor using the exact established key,
      character allowlist, length cap, and two-character readiness boundary.
- [x] Callsign edits immediately update Challenges readiness and Records
      identity for future entries without adding an account, changing existing
      server-authored records, or rewriting a stored value merely by reading it.
- [x] Audio delegates to the existing `AudioManager` mute/master/SFX/music
      controls and keys, including F2 behavior. Controls and current fixed
      pixel-art/full-effects quality semantics are documented read-only rather
      than adding a mode toggle or new quality preference.
- [x] Fullscreen reuses best-effort game-container gesture entry and browser
      denial behavior. Signal uses the established connection projection and
      Retry Now action; capability loss still fails closed to the complete
      legacy Lobby recovery surface with unchanged timeout/backoff authority.
- [x] Pointer, touch, keyboard, and standard gamepad reach Settings on desktop
      and mobile landscape. Play/Fighters/Challenges/Records, Draft, Character
      Select, default-false capabilities, and the legacy Lobby remain intact;
      no Batch 10 schedule or later feature work began.

#### Batch 10 — Scheduled arenas

Implement epoch-derived five-minute per-mode schedules with deterministic
mode offsets, server clock synchronization, queue-time locking, and FORCE
diagnostics. Clients display only server-authored schedule snapshots.

Acceptance:

- [x] The server derives every standard mode's registered arena from a shared
      five-minute epoch slot with deterministic mode offsets. Valid
      `FORCE_MAP` pins every advertised outcome, valid `FORCE_MODE` constrains
      presentation/locking, and malformed diagnostics are ignored.
- [x] The additive reliable `server:lobbyConfig` snapshot is sent on connect
      and refreshed per player from authoritative server time once per whole
      second. It carries a complete schedule, rotation deadline, optional
      forced mode, and optional immutable server-owned queue-entry lock.
- [x] The client validates the full snapshot atomically, clears it across
      reconnect/disconnect boundaries, and displays only server-supplied maps,
      clock delta, forced mode, and lock. It never derives a schedule outcome,
      advances a clock locally, or invents a lock.
- [x] Old server/new client, new server/old client, absent, partial, malformed,
      stale, capability-off, reconnect, and disconnect cases fail closed to
      the Batch 5 fixed Play preview. All capability defaults remain false.
- [x] The pure Play roster serialization boundary, Fighters locking,
      Challenges, Records, Settings, Draft, Character Select, existing
      map/mode rotation, and the complete legacy Lobby remain intact. Batch 10
      adds only the narrow server lock/release seam; no Batch 11 match intent
      or later feature work began.

#### Batch 11 — General match intent

Introduce validated match intents for Duel, Rumble, and Crew, retain each
format's compatible modes, and remove random standard mode/map selection while
the legacy join messages remain temporarily compatible.

Acceptance:

- [x] Shared frozen contracts enumerate Duel, Rumble, and Crew, every exact
      Batch 5 human/bot composition, and every format-compatible standard mode.
      The normalizer rejects malformed, stale, unknown, or incompatible fields.
- [x] The gated Play review submits the persisted fighter, explicit mode and
      composition, and displayed Batch 10 arena through the additive
      `client:submitMatchIntent` message only with a live complete authoritative
      schedule. Capability-off, old-server, reconnect, and disconnect paths
      retain established behavior.
- [x] The server creates and consumes its own queue-entry arena lock, compares
      it exactly with the normalized echo, groups only identical compatible
      intent keys, and launches Duel, Rumble, or Crew with explicit mode, map,
      server-owned teams, standard bots, and fighter locks. No standard random
      map/mode selection or client-authored fallback was added.
- [x] Duplicate, stale, replayed, incompatible, fighter-collision, cancel, and
      disconnect paths fail closed without a phantom queue or leaked arena
      lock. Reconnect starts from the established recovery state.
- [x] Legacy join messages, Lobby, Draft, Character Select, Practice,
      Challenges, Records, Settings, schedule/FORCE authority, and all
      default-false capability behavior remain intact. No party, readiness,
      queue fallback, Reforged Results/rematch, Battle Royale, viewport/camera,
      or art work began.

#### Batch 12 — Party core

Implement collision-safe codes/links, joining, format capacity, leader-owned
intent, member fighter visibility, kick/leave, and empty-room expiry for Duel,
Rumble, and Crew only.

Acceptance:

- [x] Shared deterministic contracts normalize unambiguous five-character room
      codes, http(s) share links, request ids, versions, fighters, format
      ceilings, exact intent human capacity, and complete authoritative state.
- [x] Enabled servers create collision-safe ephemeral Duel, Rumble, and Crew
      rooms, retry reserved codes, revalidate the leader's generalized intent
      against their own current schedule, and expire empty rooms after the
      documented reservation without persistence or client-authored state.
- [x] Create, join, member fighter change, member leave, fixed-leader kick,
      creator close, and leader intent update are authorized by membership,
      role, party id, exact version, and per-connection request id; malformed,
      duplicate-fighter, full, unknown, stale, replayed, and unauthorized paths
      fail closed and return only authoritative repair/error projections.
- [x] The gated Play surface creates or joins by code/link, copies an
      origin-correct share link, shows authoritative member fighters/capacity/
      intent, and exposes only leader-owned kick/intent actions. Readiness,
      transfer, recovery, queueing, Results, and rematches remain visibly deferred.
- [x] Batch 5-11 boundaries, legacy join messages, Draft, Character Select,
      Practice, every default-false capability, schedules-off fixed preview,
      and the complete legacy Lobby fallback remain intact; no Batch 13 work,
      deployment, viewport/camera, Battle Royale, or art change began.

#### Batch 13 — Party readiness and recovery

Add member readiness, leader transfer, reconnect/disconnect cleanup, open
human slots, cancellation, and stale/replayed message rejection. Preserve the
party through queue, match, Results, and valid rematches.

Acceptance:

- [x] Shared and wire contracts project member readiness, explicit
      occupied/open human slots, lifecycle, optional match identity, request
      ids, and expected versions without client-derived membership or recovery.
- [x] Readiness is server-normalized and idempotent; incomplete ready rooms wait
      with open human slots, while only full ready Duel, Rumble, and Crew rooms
      enter Batch 11's existing schedule-lock and explicit-intent launch path.
- [x] Intent/fighter changes, cancellation, leave, kick, and disconnect clear
      readiness; leadership transfers deterministically to the earliest
      remaining member and a replacement connection may rejoin by code/link.
- [x] Party identity and authoritative snapshots survive queue, match, Results,
      and valid rematches; stale, replayed, duplicate, lifecycle-invalid, and
      schedule-drifted requests fail closed without phantom queue state.
- [x] Batch 5-12 boundaries, legacy/fallback routes, Practice, Draft, Character
      Select, default-false capabilities, and production state remain unchanged;
      no timed bot-fill offer, automatic human replacement, Batch 15 Results
      redesign, deployment, world/camera, Battle Royale, or art work began.

#### Batch 14 — Queue fallback

After 15 seconds waiting on requested humans, show a confirmed bot-fill action.
Never change the intent automatically; cancellation and connection loss must
leave no phantom queue or party state.

Acceptance:

- [x] Incomplete ready Duel, Rumble, and Crew parties receive a complete
      server-authored waiting/available bot-fill offer with a monotonic
      15-second eligibility edge, captured server-clock timestamps, and exact
      open-slot count; clients never compute eligibility or infer fill state.
- [x] No requested human source changes automatically. Only the current leader
      may confirm the available offer through a fresh request id, exact party
      id, and current version; early, unauthorized, stale, duplicate, and
      replayed confirmations fail closed.
- [x] Confirmation revalidates the normalized intent and current scheduled
      arena, converts only the still-open human slots to standard Scrapper bots,
      and enters Batch 11's existing launch path across every legal Duel,
      Rumble, and Crew human count.
- [x] Cancellation, membership/readiness/intent/fighter mutation, disconnect,
      reconnect, schedule drift, launch rejection, and cleanup remove the offer
      and readiness without a phantom queue, leaked lock, or partial source
      change.
- [x] The client atomically renders server offer truth and exposes confirmation
      only to the projected leader. Batch 5-13 boundaries, legacy and
      schedules-off fallbacks, Practice, Draft, Character Select, default-false
      capabilities, Results/rematches, production, world/camera, Battle Royale,
      and art remain unchanged.

#### Batch 15 — Results and rematches

Render the retained party, revalidate readiness/format, preview schedule
changes, and use the current active arena for a rematch when a slot expired.

Acceptance:

- [x] Capability-owned Results render the complete server-authored party,
      format, participant source, locked fighter, readiness/consensus, match,
      retained explicit mode, prior arena, current arena, and arena-change
      projection without deriving membership, bots, eligibility, or schedule
      outcomes on the client.
- [x] A still-active queue-entry slot remains the rematch arena; an expired
      slot clears prior consensus, projects the newly active server schedule,
      and uses that exact current arena while preserving the explicit mode.
- [x] Fresh version-fenced, replay-protected human consensus revalidates the
      retained roster, confirmed Scrapper composition, format/mode, fighter
      locks, schedule, lifecycle, post-match identity, and connection mappings
      before entering Batch 11's existing explicit launch authority.
- [x] Result recreation, duplicate/stale/replayed requests, timeout,
      cancel/leave, disconnect/reconnect, schedule drift, invalid fighter/
      format/mode state, rejected launch, and cleanup are idempotent,
      N-player-safe across Duel, Rumble, and Crew, and leave no phantom party,
      queue, arena lock, match, or rematch projection.
- [x] Practice Results/rematches, Draft, Character Select, legacy Lobby and
      capability-off paths, all prior Reforged boundaries, default-false
      capabilities, production, world/camera, Battle Royale, and art remain
      unchanged; Batch 16 legacy retirement did not begin.

#### Batch 16 — Legacy flow retirement

Remove standard Draft and post-matchmaking Character Select routing after the
new capability is proven. Retain challenge-specific setup and server-side
fighter validation; keep transitional wire compatibility until Batch 54.

Acceptance:

- [x] Capability-owned generalized-intent, complete-party, confirmed bot-fill,
      and retained-party rematch launches enter the existing match countdown
      directly from server-validated Duel, Rumble, or Crew state, without
      standard Draft or post-matchmaking Character Select.
- [x] The additive standard-match contract preserves the exact format,
      human/standard-bot composition, participant identities and sources,
      locked fighters, explicit mode, current scheduled arena, and Crew teams;
      the client validates and renders that contract without inference.
- [x] Missing, partial, malformed, contradictory, stale, duplicate, replayed,
      cancelled, disconnected, source/team-drifted, or capability-drifted
      launches fail closed without phantom draft, character-select, party,
      queue, arena-lock, match, or rematch state.
- [x] Practice plus every Gauntlet, Daily, Spar, Scrap Pit, and Crew Battle
      setup route retains Character Select or its established route surface;
      capability-off and old-server Lobby, join, Draft, Character Select,
      Results, rematch, FORCE, scene, message, and wire fallbacks remain intact.
- [x] Deterministic N-player coverage spans legal Duel, Rumble, and Crew
      compositions, modes, fighters, participant sources, teams, party/rematch
      launches, rejection, cleanup, and immediate countdown ownership.
- [x] The full unit/static/build gates, enabled three-project Reforged and
      retained-party recovery matrices, complete capability-off three-project
      Playwright inventory, and inspected desktop/mobile Chromium direct-launch
      captures pass with all five capabilities still default false and no
      production deployment.

#### Batch 17 — Journey verification

Exercise every tab, preserved activity, standard roster, party path, queue,
schedule boundary, rematch, disconnect, and old-client fallback using pointer,
keyboard, gamepad, and touch.

Acceptance:

- [x] The cumulative deterministic audit covers every legal Duel, Rumble, and
      Crew format/composition/mode/fighter product, exact scheduled-arena and
      fighter locks, human/standard-bot sources, Crew teams, Rumble state,
      contracts/mutators, malformed launches, and fail-closed cleanup without
      client-authored roster, mode, map, team, source, schedule, or bypass state.
- [x] The complete enabled journey reaches all five tabs, Fighters persistence,
      every preserved Challenge, Records, Settings, parties, readiness,
      confirmed bot fill, direct countdown/gameplay, Results, retained-party
      rematch consensus, cancellation, leave, disconnect/reconnect, recovery,
      and cleanup across desktop Chromium, desktop Firefox, and mobile landscape.
- [x] Schedule locks and boundary changes retain the explicit mode, use the
      exact server-owned active arena, clear stale consensus, and revalidate a
      valid rematch; stale, duplicate, replayed, incompatible, cancelled,
      disconnected, and capability-drifted paths leave no phantom state.
- [x] Capability-off, missing/partial old-server advertisements, legacy joins,
      Lobby, Draft, Character Select, Practice, Results/rematch, FORCE
      diagnostics, scenes, messages, and transitional wire behavior remain
      intact with all five capability defaults false.
- [x] Pointer, keyboard, standard gamepad, and touch evidence passes on desktop
      and mobile-sized layouts. Inspected Chromium captures are readable and
      contained; staged Firefox/WebKit object/input assertions remain the
      documented RFG-003 evidence rather than trusted pixel captures.
- [x] The full unit/static/build gates, default-false complete Playwright
      inventory, enabled Reforged/party matrix, and focused post-fix visual
      rerun pass. The only demonstrated gap—party status copy colliding with
      action rows—has a measured-layout regression assertion and is fixed.
      No capability default, production configuration, viewport/camera, art,
      Battle Royale behavior, deployment, or Batch 18 work changed.

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

### Risk-based verification selection

The test contract is cumulative across the Reforged program; it does not mean
that every batch must run every repository check. Before implementation, name
the boundaries the batch can affect and select the smallest verification tier
that can disprove the likely regressions. Escalate when a focused check fails,
reveals unexpected coupling, or changes touch a broader boundary than planned.

| Change surface                                            | Minimum batch evidence                                                                                                                                   | Escalate to broader suites when                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Documentation or process only                             | Repository formatter for touched docs, `git diff --check`, link/command review, and intended-diff review. Runtime suites are not required.               | Executable configuration, generated runtime content, or code also changed.                                                |
| Isolated pure logic or capability-owned client UI         | Focused unit tests, `pnpm typecheck`, `pnpm lint`, affected package build, targeted desktop Chromium and mobile-landscape interaction/fallback evidence. | Shared contracts, networking, persistence, scene routing, or multiple packages are affected.                              |
| Shared, server, networking, persistence, or cross-package | Focused unit/integration tests, full `pnpm test`, relevant or full production build, and targeted E2E for affected journeys.                             | Wire behavior, recovery, timing, or multiple player-facing journeys change.                                               |
| Cross-cutting navigation, input, recovery, or capability  | Focused multi-browser E2E plus the affected legacy/new-shell journey subset, alongside the applicable unit/build evidence above.                         | A foundation used by most journeys changes, a capability is exposed, or focused evidence suggests a repository-wide risk. |
| Camera, world, performance, arena, or visual work         | The affected deterministic validators, recorders, performance probes, and desktop/mobile Chromium visual evidence; retain required object assertions.    | A performance/release gate is reached, shared simulation changes, or measured evidence regresses.                         |

The complete three-project Playwright matrix is reserved for release and
verification gates (including Batches 17, 24, 33, 39, 51, 52, and 54), a
deployment or capability-default change, legacy retirement, broad cross-cutting
foundations, or a focused result that indicates wider risk. It is not required
for every isolated capability batch. The full unit/integration suite remains
required for shared/server/network/persistence and cross-package changes and at
those gates; isolated client-only work may use the affected package and focused
tests. Never rerun a complete suite merely to investigate one failure: reproduce
and diagnose it with the narrowest reliable check first, then rerun the
appropriate gate after the fix.

Every Session Log verification entry must record the selected tier, the checks
actually run, and why any normally broader suite was unnecessary. This changes
test frequency, not acceptance coverage or release quality gates.

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
2. **Verify behavior by risk:** apply the test-selection matrix above. Runtime
   changes always receive focused tests plus `pnpm typecheck` and `pnpm lint`;
   add the affected package build and targeted desktop/mobile evidence. Run the
   full unit, build, browser, network, visual, or performance suites only when
   the changed boundary or a gate requires them. Documentation-only changes
   may omit runtime suites. Record the tier, commands, results, and rationale.
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

### 2026-07-15 — Risk-based verification

At the user's request, replaced the blanket expectation to run the complete
unit and browser inventory after every batch with an explicit risk-based
selection matrix. Focused tests and cheap static checks remain mandatory for
runtime work; broader suites now follow affected boundaries and escalation
signals, while the complete matrix remains mandatory at release, rollout,
legacy-retirement, and other cross-cutting gates. This reduces repeated
low-signal runtime without lowering the cumulative acceptance contract.

### 2026-07-15 — Mandatory fresh-session prompt

At the user's request, made the paste-ready fresh-session prompt an explicit
non-optional result of every session, including incomplete and blocked work.
This clarifies the existing handoff ritual without changing batch scope or
release order.

## Session Log

### Process amendment — 2026-07-15 — Risk-based verification

**Shipped:** Added a risk-based test-selection matrix and aligned the
end-of-batch ritual so future sessions choose verification from the actual
change surface. Defined minimum evidence for documentation, isolated client,
shared/server/network, cross-cutting interaction, and performance/visual work;
reserved the complete Playwright matrix for explicit gates and escalation.

**Verification:** Used the documentation/process tier: repository Prettier,
`git diff --check`, command/link review, and intended-diff review. Runtime test
suites were deliberately omitted because no executable source, configuration,
dependency, or generated runtime content changed.

**Deployment:** Skipped. This amendment changes repository guidance only and
does not authorize or require a production deployment.

**Deviations:** None. Existing acceptance coverage and release gates remain in
force; only the frequency and rationale for broad suite execution changed.

**Known issues:** RFG-001, RFG-002, and RFG-003 remain unchanged. No new bug ID
was required.

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

### Batch 5 — 2026-07-15 — Play roster builder

**Shipped:** Added a pure, dependency-ordered Play roster reducer and fail-closed
serializer for Duel, Rumble, and Crew; exact human/bot requests; explicit
format-compatible modes; an injected registered arena snapshot; all six
fighters; backtracking; and review. The capability-owned Play tab now renders
that flow with one activation path for pointer/touch, keyboard, and standard
gamepad. The other four tabs remain empty. Review produces only a local roster
draft and visibly leaves match entry disabled. A fixed Batch 5 adapter exercises
the arena boundary without clocks, rotation, queue locking, network messages,
or server authority; Batches 10 and 11 still own those systems.

**Verification:** The pure builder exhaustively covered all 624 legal
format/composition/mode/fighter products plus malformed, incompatible,
out-of-order, missing-schedule, stale-arena, and unknown-fighter rejection.
Typecheck, lint, the complete 113-file/1,371-test unit/integration suite, and the
production build passed. With only `CAPABILITY_NEW_SHELL=true`, the shell's
three-project matrix finished with six passes and three expected inverse-gate
skips. With every capability default false, the complete 156-case Playwright
matrix finished with 132 passes and 24 established/intentional skips across
desktop Chromium, desktop Firefox, and mobile landscape in 18.0 minutes.
Repository Prettier, `git diff --check`, and intended-diff review passed.
Desktop and 844×390 Chromium captures showed complete unclipped review and dense
nine-choice layouts. Staged Firefox/WebKit exercised real scene, layout,
pointer/touch, keyboard, and gamepad paths while the WebKit PNG remained black
under RFG-003.

**Deployment:** Skipped. Batch 5 remains incomplete milestone code behind the
default-false `newShell` capability, and the roadmap authorizes deployment only
at a release gate or for an urgent live fix. No production environment or flag
changed.

**Deviations:** The Batch 5 shell uses a fixed, injected arena preview solely to
exercise the pure read-only boundary before Batch 10 supplies authoritative
server schedules. It is not time-derived or networked and cannot start a match.
The longer staged mobile flow also sets the test boundary connected before the
synthetic welcome so the unrelated live five-second WebRTC timeout cannot tear
down its object/input assertions.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain assigned
to Batches 20/24 and were untouched. RFG-003 still covers unreliable headless
Firefox/WebKit live practice plus black staged gameplay and Reforged-shell PNGs;
mobile-sized Chromium remains the visual source while staged WebKit retains
object/input coverage. None blocks Batch 6.

### Batch 6 — 2026-07-15 — Fighters tab

**Shipped:** Added the capability-owned six-fighter roster browser with shared
HP/speed identity, canonical ability rules, mastery tiers from the latest
existing server-authored match-found snapshot, and a registry-normalized
`mmr_fighter_selection` device preference. Missing or stale values safely become
Mighty Man and are rewritten. Pointer/touch, keyboard, and standard gamepad all
select through the same card path. Play now consumes that persisted selection
as the final dependency of the unchanged pure Batch 5 reducer and serializer,
skips its old duplicate fighter step, and updates an already reviewed local
draft when the Fighters preference changes. Character Select and server locking
remain authoritative; match entry remains disabled.

**Verification:** Selected the isolated pure logic/capability-owned client UI
tier because executable changes stayed inside the client, reused the existing
`server:matchFound` mastery field without changing its wire contract, and did
not change shared/server/network/persistence, scene routing, recovery, or any
capability default. Focused Vitest passed 21 Fighters/Play/mastery tests across
three files. `corepack pnpm typecheck`, `corepack pnpm lint`, and
`corepack pnpm --filter @game/client build` passed. With only
`CAPABILITY_NEW_SHELL=true`, the focused three-project shell run passed nine
tests with three expected inverse-gate skips, covering pointer/touch, keyboard,
gamepad, persistence through scene recreation, Fighters-to-Play handoff, and
staged Firefox/WebKit object/input paths. With every capability at its default
false value, the legacy Lobby fallback passed in desktop Chromium, desktop
Firefox, and mobile landscape with nine expected gated skips. Manual inspection
of final desktop and 844×390 Chromium Fighters captures found all cards, stats,
abilities, mastery, selection, and authority copy readable and unclipped.
The complete unit suite and unrelated browser journeys were deliberately omitted
because no broader boundary changed and focused evidence showed no wider risk.

**Deployment:** Skipped. Batch 6 remains incomplete navigation-milestone code
behind the default-false `newShell` capability, and the roadmap authorizes
production deployment only at a release gate or for an urgent live fix. No
production environment or capability flag changed.

**Deviations:** No scope deviation. The existing handshake still has no
callsign-scoped mastery payload, so Fighters retains the latest complete
server-authored match-found snapshot in client memory and starts from the same
normalized zero-win presentation used before any such snapshot arrives. Initial
Chromium evidence exposed overflowing card/header copy; the tightly coupled
Batch 6 layout defect was corrected with bounded two-line card details before
final verification.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain assigned
to Batches 20/24 and were untouched. RFG-003 remains unchanged: live headless
Firefox/WebKit practice is unreliable and staged gameplay/Reforged-shell PNGs
are black, so staged object/input assertions and mobile-sized Chromium visual
evidence remain the required combination. None blocks Batch 7.

### Batch 7 — 2026-07-15 — Challenges tab

**Shipped:** Added the capability-owned Challenges activity grid for Spar,
Scrap Pit, Gauntlet, Daily Run, Practice Setup, and the complete six-build
Codex. The tab reads the exact existing nickname, difficulty, favorite mode,
rival, compatible Solo Chaos, Scrap Pit record, Gauntlet best, Daily progress,
and Build Codex device keys through their existing normalizers. Spar and Scrap
Pit project those preferences onto the unchanged `startPractice` arguments;
Gauntlet and Daily deliberately omit the optional mode/rival/mutator pins. A
server-authored `matchFound` still routes into the unchanged Character Select
scene and legacy gameplay size. Missing callsign fails closed in Challenges so
Batch 9 retains ownership of callsign entry. Records and Settings remain empty.

**Verification:** Selected the isolated pure logic/capability-owned client UI
tier because executable changes stay inside the gated client shell, reuse the
existing `client:startPractice` and `server:matchFound` contracts unchanged,
and do not alter shared/server/network persistence, recovery, capability
defaults, or the legacy scene foundation. Focused Vitest passed 20
Challenges/Play/Fighters compatibility tests across three files.
`corepack pnpm typecheck`, `corepack pnpm lint`, and
`corepack pnpm --filter @game/client build` passed. With only
`CAPABILITY_NEW_SHELL=true`, the focused desktop Chromium and mobile-landscape
shell subset passed eight tests with two expected inverse-gate skips, covering
tab navigation, Play/Fighters preservation, all six challenge surfaces,
pointer/touch, keyboard, gamepad, exact challenge request shapes, saved setup,
saved progress, Codex, server-authored Character Select entry, and staged
mobile-WebKit object/input behavior. With all capability defaults false, the
complete legacy Lobby and its six challenge controls passed in desktop
Chromium, desktop Firefox, and mobile landscape. Manual inspection found the
desktop and 844×390 Chromium activity, setup, and Codex captures readable,
complete, and unclipped. The complete unit inventory and unrelated browser
journeys were not rerun after the final fix because no broader boundary changed
and the focused evidence showed no wider risk.

**Deployment:** Skipped. Batch 7 remains incomplete navigation-milestone code
behind the default-false `newShell` capability, and the roadmap authorizes
deployment only at a release gate or for an urgent live fix. No production
environment or capability flag changed.

**Deviations:** No scope deviation. An initial pnpm argument form accidentally
expanded a focused Vitest command to the full inventory and exposed one wrong
expectation in the new malformed-storage fixture; the implementation correctly
retained a valid Random-mode mutator. The fixture was corrected and the focused
gate passed. Initial Chromium interaction evidence also exposed shell chrome
being covered after a Challenges subview rebuild because nested Phaser controls
were removed directly while their parent container still tracked them. Parent-
owned remove-and-destroy plus explicit shell depths fixed the tightly coupled
Batch 7 presentation defect; visual evidence uses the established two-frame
headless render settle before capture.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain assigned
to Batches 20/24 and were untouched. RFG-003 remains unchanged: live headless
Firefox/WebKit practice is unreliable and staged gameplay/Reforged-shell PNGs
are black, so staged object/input assertions and mobile-sized Chromium visual
evidence remain the required combination. None blocks Batch 8.

### Batch 8 — 2026-07-15 — Records tab

**Shipped:** Added the capability-owned read-only Records archive with Career,
Boards, Rivalry, Fighters, Arenas, Challenge, and reserved Battle Royale
sections. Career and rivalry project only the available latest server result;
the all-time and Daily boards retain server order; fighter mastery retains the
existing match-found snapshot; arena mastery retains the local player's
existing draft/result snapshot without a new request; and challenge records
reuse the exact Scrap Pit, Gauntlet best, Daily progress, Build Codex, and Crew
Tour device keys and normalizers. The Battle Royale section explicitly records
nothing. Settings remains the empty foundation.

**Verification:** Selected the isolated pure logic/capability-owned client UI
tier because executable work remains inside the gated client, adds only a
presentation cache for already-received arena values, and does not change a
shared/server/network/persistence/wire, routing, recovery, capability-default,
or cross-package boundary. Focused Vitest passed 36 Records/navigation plus
Play/Fighters/Challenges compatibility tests across seven files; the final
Records-only rerun passed five tests across two files. `corepack pnpm typecheck`,
`corepack pnpm lint`, and `corepack pnpm --filter @game/client build` passed.
With only `CAPABILITY_NEW_SHELL=true`, focused desktop Chromium and
mobile-landscape Records interaction/presentation passed two tests, and the
advertised-shell navigation/reconnect subset passed two more. With every
capability default false, the complete legacy Lobby fallback passed in desktop
Chromium, desktop Firefox, and mobile landscape. Pointer/touch, keyboard,
standard gamepad, live board refresh, every Records section, the empty Settings
boundary, and safe-area layout were exercised. Manual inspection found the
1280×720 server-board capture and 844×390 Chromium challenge-record capture
readable, complete, and unclipped; staged WebKit retained touch/object evidence
under RFG-003. The complete unit and unrelated browser inventories were omitted
because no broader boundary changed and focused evidence showed no wider risk.

**Deployment:** Skipped. Batch 8 remains incomplete navigation-milestone code
behind the default-false `newShell` capability, and the roadmap authorizes
deployment only at a release gate or for an urgent live fix. No production
environment or capability flag changed.

**Deviations:** No scope deviation. An initial focused-unit expectation used the
wrong frozen mastery tier names at 15 wins; the implementation correctly used
Master and Home Turf, the fixture was corrected, and the gate passed. An initial
Playwright argument separator accidentally expanded the intended Records subset
to the whole shell file and exposed a one-pixel pre-layout word-wrap exception
in the new panel constructor. Deferring Records layout until real safe-area
dimensions fixed the tightly coupled Batch 8 defect. Final focused runs passed.
A redundant second Chromium capture caught a partial headless WebGL frame, so
the misleading artifact was removed; final first-frame desktop and post-resize
mobile Chromium evidence is complete.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain assigned
to Batches 20/24 and were untouched. RFG-003 remains unchanged: live headless
Firefox/WebKit practice is unreliable and staged gameplay/Reforged-shell PNGs
are black, so staged object/input assertions and mobile-sized Chromium visual
evidence remain the required combination. None blocks Batch 9.

### Batch 9 — 2026-07-15 — Settings tab

**Shipped:** Added the capability-owned Callsign, Audio, Controls, Graphics,
Display, and Signal settings sections. Callsign reuses the exact
`mmr_nickname` key, legacy character allowlist, 16-character cap, and
two-character readiness rule; a stored value is presented without prompting,
while a missing value opens the editor. Edits immediately refresh Challenges
readiness and Records identity for future entries without an account or record
rewrite. Audio delegates to the existing `AudioManager` mute, master, SFX, and
music values/keys and retains F2 plus silent-mute/confirmation-on-unmute
behavior. Controls and the current fixed pixel-art/full-effects quality
semantics are read-only. Fullscreen retains best-effort game-container gesture
entry, and Signal reuses the established connection projection and exact Retry
Now service action. Capability loss still returns to the complete legacy Lobby
recovery surface.

**Verification:** Selected the cross-cutting navigation/input/recovery tier
because implementation stayed client-only but re-exposed callsign, audio,
fullscreen, and signal recovery across pointer, keyboard, gamepad, and touch.
Focused Vitest passed 32 Settings/callsign plus Play/Fighters/Challenges/
Records/recovery compatibility tests across seven files. `corepack pnpm
typecheck`, `corepack pnpm lint`, and `corepack pnpm --filter @game/client
build` passed; Vite retained its existing chunk-size advisory. With only
`CAPABILITY_NEW_SHELL=true`, the full affected desktop Chromium and
mobile-landscape shell file passed 12 tests with two expected inverse-gate
skips, and the Settings case additionally passed desktop Firefox. The final
post-audio-polish Settings rerun passed desktop Chromium and mobile landscape.
With defaults false, the legacy Lobby fallback passed in all three projects.
The focused audio, keyboard, and recovery subset passed all 12 configured
cases across desktop Chromium, desktop Firefox, and mobile landscape after
clearing a stale test-only capability listener. Manual review found the
1280×720 and 844×390 Chromium Signal/Retry captures readable, complete, and
safe-area bounded; staged mobile WebKit retained real touch/object assertions
under RFG-003. The complete unit and unrelated Playwright inventories were
omitted because no shared/server/wire/persistence rule, routing foundation,
capability default, or production exposure changed and focused evidence showed
no wider risk.

**Deployment:** Skipped. Batch 9 remains incomplete navigation-milestone code
behind the default-false `newShell` capability, and the roadmap authorizes
deployment only at a release gate or for an urgent live fix. No production
environment or capability flag changed.

**Deviations:** No product-scope deviation. One initial Playwright command
quoted its grep/capability arguments incorrectly and therefore ran only the
inverse-gate fallback. A later combined legacy run reused the prior
test-only-capability server on port 3000, redirecting live Chromium into the
shell; Firefox/mobile still passed, the exact stale test listeners were stopped,
and fresh default-false Chromium passed all affected cases. These were local
harness-state corrections, not runtime defects.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain assigned
to Batches 20/24 and were untouched. RFG-003 remains unchanged: live headless
Firefox/WebKit practice is unreliable and staged gameplay/Reforged-shell PNGs
are black, so staged object/input assertions and mobile-sized Chromium visual
evidence remain the required combination. None blocks Batch 10.

### Batch 10 — 2026-07-15 — Scheduled arenas

**Shipped:** Replaced the Batch 5 fixed Play preview on the gated path with a
server-owned five-minute schedule for every standard mode. Epoch slots use
deterministic mode offsets and registered maps, while valid `FORCE_MAP` and
`FORCE_MODE` diagnostics remain strongest. The additive reliable
`server:lobbyConfig` snapshot carries authoritative server time, rotation
deadlines, all mode outcomes, and an optional immutable queue-entry lock. The
server sends it on connect and refreshes each connected player once per whole
second, retaining that player's lock across later slots until release or
disconnect. The client accepts only a complete, current snapshot, clears it
across recovery boundaries, and renders server truth without deriving outcomes,
clocks, or locks. Capability-off and compatibility paths retain the fixed Play
preview and complete legacy Lobby. The narrow lock/release seam is ready for
Batch 11, but no generalized match intent was added.

**Verification:** Selected the shared/server/network cross-package tier and
escalated the affected schedule/reconnect journey to the focused multi-browser
subset because the batch adds wire timing and capability behavior. Focused
Vitest passed 71 schedule, offset, clock, lock, normalization, GameManager,
NetworkManager, presentation, and Play compatibility tests across six files.
The mandatory `corepack pnpm test` passed 122 files and 1,414 tests;
`corepack pnpm typecheck`, `corepack pnpm lint`, and the full `corepack pnpm
build` passed, with Vite's existing chunk-size advisory unchanged. With both
`CAPABILITY_NEW_SHELL=true` and `CAPABILITY_SCHEDULES=true`, advertised Play
and reconnect/clearing evidence passed in desktop Chromium, desktop Firefox,
and mobile landscape. With only `newShell` enabled, all three projects retained
the fixed preview; with defaults false, all three retained the legacy Lobby.
The final desktop Chromium schedule journey passed after presentation cleanup.
Manual review found the 1280×720 and 844×390 Chromium schedule captures
complete, readable, and safe-area bounded; the staged mobile composition grid
also remained complete. The full unrelated Playwright inventory was omitted
because this is not the Batch 17 release gate and focused evidence showed no
wider journey risk.

**Deployment:** Skipped. Batch 10 remains navigation-milestone code behind
default-false `newShell` and `schedules` capabilities. No production environment
or capability flag changed, and this task did not authorize deployment.

**Deviations:** No product-scope deviation. The first focused test invocation
used an argument form that expanded to the full workspace suite, and the server
initially resolved a stale built shared package; rebuilding shared and using its
public `@shared/game` export restored the intended focused path. An initial
reconnect E2E assertion assigned a page-evaluation result in the test callback;
the test-only callback was corrected and the final multi-browser run passed.
These were local verification-harness corrections, not runtime defects.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain
assigned to Batches 20/24 and were untouched. RFG-003 remains unchanged:
headless Firefox/WebKit cannot use the live local WebRTC practice path and
staged gameplay/Reforged-shell WebKit PNGs are black, so staged object/input
assertions plus mobile-sized Chromium visual evidence remain required. None
blocks Batch 11.

### Batch 11 — 2026-07-15 — General match intent

**Shipped:** Added frozen shared `MatchIntent` format, participant-source,
composition, mode, fighter, and scheduled-arena contracts with an exhaustive
normalizer over every legal Duel, Rumble, and Crew product. The gated Play
review now submits the additive `client:submitMatchIntent` message only with a
live callsign and complete authoritative schedule; it enters queued
presentation only after server acknowledgement and clears through cancel or
connection recovery. `GameManager` normalizes untrusted wire values and the
matchmaking manager creates its own schedule lock, compares the complete echo,
groups exact compatible intent keys, rejects fighter collisions and replayed
ids, and launches explicit maps/modes with server-owned fighter locks, Crew
teams, and established Scrapper bots. The Batch 5 serializer stays pure, the
client never derives or randomly replaces intent, and all legacy join paths
remain available.

**Verification:** Selected the roadmap's shared/server/network cross-package
tier because Batch 11 changes wire authority and queue ownership, then included
the required focused multi-browser entry/recovery subset. Focused Vitest passed
150 intent normalization, Play serialization, NetworkManager, GameManager, and
matchmaking integration tests across five files. The mandatory `corepack pnpm
test` passed 123 files and 1,437 tests; `corepack pnpm typecheck`, `corepack pnpm
lint`, and the full `corepack pnpm build` passed, with Vite's established
chunk-size advisory unchanged. With both gated capabilities enabled, the full
affected Reforged-shell file completed 21 cases in desktop Chromium, desktop
Firefox, and mobile landscape with three expected inverse-gate skips; the live
Chromium path submitted the generalized intent and reached Character Select or
Game, while staged Firefox/mobile proved queued recovery and legacy gameplay
size restoration. New-shell/schedules-off fixed-preview coverage passed all
three projects, and default-false legacy Lobby coverage passed all three.
Desktop plus 844×390 mobile Play-entry layout assertions and capture calls
completed without wider-risk evidence, so the unrelated Playwright inventory
was not escalated.

**Deployment:** Skipped. Batch 11 remains navigation-milestone code behind the
default-false `newShell` and `schedules` capabilities. No production environment
or capability flag changed, and this task did not authorize deployment.

**Deviations:** No product-scope deviation. The first enabled Playwright command
included an extra argument separator and therefore expanded from the requested
grep to the complete affected Reforged-shell file; that stronger run passed.
The pre-full-suite diff review removed an unnecessary generalized team-stats
extension so legacy Practice and Records persistence stayed unchanged. These
were local verification and scope-tightening corrections, not runtime defects.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain
assigned to Batches 20/24 and were untouched. RFG-003 remains unchanged:
headless Firefox/WebKit cannot use the live local WebRTC practice path and
staged gameplay/Reforged-shell WebKit PNGs are black, so staged object/input
assertions plus mobile-sized Chromium visual evidence remain required. The
Batch 2 host scheduling sample and its 15.932 effective Hz observation also
remain unchanged. None blocks Batch 12.

### Batch 12 — 2026-07-15 — Party core

**Shipped:** Added frozen shared party contracts for unambiguous five-character
codes, http(s) share-link parsing, format ceilings, request/version
normalization, authoritative members, and leader-owned generalized intent. The
server now owns collision retry, exact human capacity, current-schedule intent
revalidation, fixed creator leadership, per-connection replay protection,
version-fenced create/join/leave/kick/intent/fighter mutations, complete state
projection, creator-close behavior, and one-minute empty-room reservation/
expiry for Duel, Rumble, and Crew only. The gated Play review creates or joins
rooms, copies an origin-correct link, shows every authoritative member fighter,
and exposes leader-only intent/kick actions. It deliberately does not ready or
queue a party; Batch 13 owns that lifecycle.

**Verification:** Selected the shared/server/network cross-package tier and the
focused multi-browser multi-client escalation required by party wire state.
Focused Vitest passed 85 party parsing, collision/capacity/authorization/
expiry, GameManager routing, NetworkManager, MatchIntent, and Play builder tests
across five files. The mandatory `corepack pnpm test` passed 125 files and 1,469
tests; `corepack pnpm typecheck`, `corepack pnpm lint`, and full
`corepack pnpm build` passed, with Vite's established chunk-size advisory
unchanged. With `newShell` and `schedules` enabled, the two-client party path
passed live desktop Chromium plus staged desktop Firefox and mobile WebKit,
covering create, code/link join, authoritative two-member fighter projection,
role-specific controls, and leader kick. The pre-existing generalized-intent
path passed all three projects. With `newShell` only, the fixed preview passed
all three; with defaults false, the complete legacy Lobby passed all three.
Manual inspection of corrected 1280×720 and 844×390 Chromium captures found the
party roster, intent, code, and controls readable, complete, and unclipped.
The complete unrelated Playwright inventory was omitted because Batch 12 is not
a release/verification gate and focused cross-browser evidence showed no wider
journey risk.

**Deployment:** Skipped. Batch 12 remains navigation-milestone code behind
default-false `newShell` and `schedules` capabilities. No production environment
or flag changed, and this task did not authorize deployment.

**Deviations:** No product-scope deviation. The first focused Chromium capture
exposed party copy underneath the action grid; the tightly coupled Batch 12
layout defect was corrected with a party-only copy/action split before final
visual and browser verification. An initial grep quoting form produced a local
Playwright regular-expression error before tests ran; the corrected command and
all final gates passed. Creator departure intentionally closes the room because
leadership transfer is explicitly Batch 13 scope.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain assigned
to Batches 20/24 and were untouched. RFG-003 remains unchanged: headless
Firefox/WebKit cannot use the live local WebRTC practice path and staged
gameplay/Reforged-shell WebKit PNGs are black, so staged object/input assertions
plus mobile-sized Chromium visual evidence remain required. The Batch 2 host
scheduling drift sample and 15.932 effective Hz observation also remain
unchanged. None blocks Batch 13.

### Batch 13 — 2026-07-15 — Party readiness and recovery

**Shipped:** Extended the Batch 12 server-owned Duel, Rumble, and Crew party
contract with per-member readiness, explicit occupied/open human slots,
authoritative lifecycle and match identity, deterministic earliest-member
leadership transfer, queue cancellation, and reconnect/disconnect recovery.
Full ready rooms launch only through Batch 11's schedule-lock and normalized
intent authority; incomplete ready rooms retain their open human slots without
silently adding bots. Intent/fighter changes and every membership edge clear
readiness, stale or replayed mutations fail closed, and valid parties retain
their identity through queue, match, Results, and rematches. The gated Play
surface atomically renders the server projection and exposes ready/cancel
actions without deriving membership, slots, leadership, or recovery state.

**Verification:** Selected the shared/server/network cross-package plus
recovery tier because Batch 13 changes multi-client wire state and match
lifecycle ownership. Focused Vitest passed 180 readiness, leadership-order,
open-slot, cancellation, disconnect/reconnect, lifecycle, duplicate, stale,
replay, GameManager, NetworkManager, and Play projection tests across six
files. The mandatory `corepack pnpm test` passed 125 files and 1,483 tests;
`corepack pnpm typecheck`, `corepack pnpm lint`, and full `corepack pnpm build`
passed, with Vite's established chunk-size advisory unchanged. The focused
two-client recovery path passed live desktop Chromium plus staged desktop
Firefox and mobile WebKit, and a final live Chromium rerun passed after
formatting. New-shell/schedules-off fixed-preview and default-false legacy
Lobby fallback each passed all three projects. Manual inspection of final
1280×720 and 844×390 Chromium captures found party roles, readiness, lifecycle,
code, slots, and controls readable and unclipped. Focused evidence showed no
wider journey risk, so the unrelated Playwright inventory was not escalated.

**Deployment:** Skipped. Batch 13 remains navigation-milestone code behind
default-false `newShell` and `schedules` capabilities. No production environment
or capability flag changed, and this task did not authorize deployment.

**Deviations:** No product-scope deviation. The first final Playwright rerun
used a Windows quoting form that produced an invalid grep before tests ran, and
the second passed an extra argument separator that found no tests. The corrected
direct Playwright invocation passed the intended live two-client test. During
focused implementation evidence, explicit client disconnect and the
server-projected ready option index were corrected in the harness before the
final multi-browser and Chromium runs passed.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain assigned
to Batches 20/24 and were untouched. RFG-003 remains unchanged: headless
Firefox/WebKit cannot use the live local WebRTC practice path and staged
gameplay/Reforged-shell WebKit PNGs are black, so staged object/input assertions
plus mobile-sized Chromium visual evidence remain required. The Batch 2 host
scheduling drift sample and 15.932 effective Hz observation also remain
unchanged. None blocks Batch 14.

### Batch 14 — 2026-07-15 — Queue fallback

**Shipped:** Extended the server-owned Duel, Rumble, and Crew party lifecycle
with a complete waiting/available bot-fill offer after 15 seconds of monotonic
server time. No requested human source changes automatically. Only the current
leader can confirm with a fresh request id and exact party/version fence; the
server then revalidates the intent and scheduled arena, replaces only remaining
open human slots with established standard Scrapper bots, and enters Batch 11's
existing launch path. The client atomically renders the authoritative offer and
never calculates eligibility. Cancellation, membership/readiness/intent/fighter
mutation, disconnect, reconnect, schedule drift, duplicate, stale, replay, and
failed-launch paths clear or reject the offer without queue residue.

**Verification:** Selected the shared/server/network cross-package plus
recovery/timer tier. Focused Vitest passed 92 tests across shared party
validation, PartyManager, GameManager, and NetworkManager, including exhaustive
14,999/15,000ms, wall-clock drift, all legal Duel/Rumble/Crew fill products,
authorization, cancellation, invalidation, schedule revalidation, and recovery.
The mandatory full `corepack pnpm test` passed 125 files and 1,496 tests.
`corepack pnpm typecheck`, `corepack pnpm lint`, and full production
`corepack pnpm build` passed; Vite's established chunk-size advisory remains
unchanged. With both gated capabilities enabled, the focused bot-fill path and
the two-client readiness/recovery path each passed desktop Chromium, desktop
Firefox, and mobile landscape. The schedules-off fixed preview and default-
false legacy Lobby fallback also passed all three projects. Manual inspection
found the final 1280×720 and 844×390 Chromium bot-fill captures readable,
complete, and unclipped. Focused evidence showed no wider journey risk, so the
unrelated Playwright inventory was not escalated.

**Deployment:** Skipped. Batch 14 remains navigation-milestone code behind
default-false `newShell` and `schedules` capabilities. No production
environment or flag changed, and this task did not authorize deployment.

**Deviations:** No product-scope deviation. The first focused Chromium command
used a Windows quoting form that produced an invalid grep before tests ran; the
corrected focused command and every final gate passed. RFG-003 still requires
staged Firefox/WebKit object/input assertions plus mobile-sized Chromium visual
evidence.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain
assigned to Batches 20/24 and were untouched. RFG-003 remains unchanged. The
Batch 2 host scheduling drift sample and 15.932 effective Hz observation also
remain unchanged. None blocks Batch 15.

### Batch 15 — 2026-07-15 — Results and rematches

**Shipped:** Extended retained capability-owned Duel, Rumble, and Crew parties
with complete human/confirmed-Scrapper participant projections and a
server-owned Results/rematch state. Results now shows the exact format, source,
locked fighter, readiness, explicit mode, prior queue-entry arena, current
scheduled arena, arena-change decision, and human consensus without client
inference. Fresh version-fenced rematch requests clear on schedule boundaries
and require unanimous live humans. Before launching, Matchmaking revalidates
the original post-match roster and confirmed bot composition, format/mode,
fighter locks, current per-player arena locks, lifecycle, party/match identity,
and connection mappings, then atomically creates the new participants through
Batch 11's explicit launch path. Generic rematch messages cannot bypass the
retained party. Invalidations, disconnects, timeouts, rejected launches, and
cleanup fail closed without phantom party, queue, lock, match, or rematch state.

**Verification:** Selected the shared/server/network cross-package plus
recovery/rematch tier because Batch 15 changes additive wire state, post-match
ownership, schedule boundaries, and multi-client recovery. The six directly
affected Vitest files contributed 187 passing shared party, PartyManager,
MatchmakingManager, GameManager, NetworkManager, and pure Results-presentation
tests. The mandatory final `corepack pnpm test` passed 126 files and 1,506 tests;
`corepack pnpm typecheck`, `corepack pnpm lint`, and full production
`corepack pnpm build` passed, with Vite's established chunk-size advisory
unchanged. Focused two-client Results/rematch/recovery evidence passed desktop
Chromium, desktop Firefox, and mobile landscape; the desktop Chromium
capability-off legacy Results fallback also passed, with two inverse-project
duplicates intentionally skipped (four passed, two skipped). Manual inspection
of final 1280×720 and 844×390 Chromium captures found the complete party/source,
mode, prior/current arena, and consensus projections readable and contained.
Focused evidence showed no wider journey risk, so the unrelated full Playwright
inventory remained reserved for Batch 17's verification gate.

**Deployment:** Skipped. Batch 15 remains navigation-milestone code behind
default-false `newShell` and `schedules` capabilities. No production
environment or capability flag changed, and this task did not authorize
deployment.

**Deviations:** No product-scope deviation. Early focused Playwright recovery
assertions were coupled to the live local WebRTC channel and therefore raced
engine-specific connection transitions. The final staged clients explicitly
closed that channel and exercised the same Results recovery callbacks and
authoritative party-state replacement deterministically across all projects.
This was a test-harness correction, not a runtime defect. The full unrelated
browser inventory was not escalated because the final focused matrix, legacy
fallback, unit suite, static gates, and inspected visuals showed no wider risk.

**Known issues:** No new bug ID was required. RFG-001 and RFG-002 remain
assigned to Batches 20/24 and were untouched. RFG-003 remains unchanged:
headless Firefox/WebKit cannot use the live local WebRTC practice path and
staged gameplay/Reforged-shell WebKit PNGs are black, so staged object/input
assertions plus mobile-sized Chromium visual evidence remain required. The
Batch 2 scheduling-drift sample and 15.932 effective Hz observation also remain
unchanged. None blocks Batch 16.

### Batch 16 — 2026-07-15 — Legacy flow retirement

**Shipped:** Added a complete, additive `standardMatch` launch projection for
capability-owned Duel, Rumble, and Crew generalized intents, complete parties,
confirmed bot fill, and retained-party rematches. Matchmaking now emits the
exact server-validated format, human/standard-bot composition, participant
identities and sources, locked fighters, explicit mode, current scheduled
arena, and Crew teams after its existing queue/party revalidation. The client
normalizes that projection against the match envelope and local human identity,
then enters the existing countdown/gameplay scene directly only when both menu
capabilities are enabled and the contract is valid. Contradictory, partial,
malformed, duplicate, source/team-drifted, and capability-drifted contracts
return to Lobby without inference. Practice, all challenge setup, legacy
Lobby/Draft/Character Select/Results/rematch/FORCE routes, old messages, and
transitional wire compatibility remain available.

**Verification:** Selected the cross-cutting navigation/input/recovery/
capability tier and escalated to the complete Playwright inventory because this
batch retires legacy routing across shared, server, network, and multiple scene
boundaries. Focused shared/client/server Vitest passed 113 tests; the mandatory
`corepack pnpm test` passed 127 files and 1,514 tests. Typecheck, lint, and the
full production build passed, with Vite's established chunk-size advisory
unchanged. The capability-enabled Reforged matrix passed 30 tests across
desktop Chromium, desktop Firefox, and mobile landscape with three intentional
inverse-capability skips; it covered pointer, keyboard, gamepad, touch, direct
launch, challenge retention, bot fill, disconnect/recovery, and multi-client
party state. Retained-party Results/rematch recovery passed all three projects
(four passed, two intentional inverse-project skips). The complete default-
capability three-project Playwright inventory passed 136 tests with 50
documented capability/live-channel skips and no failures. A final targeted
Chromium direct-launch check passed, and manual inspection of 1280×720 and
844×390 captures found gameplay, countdown/HUD, and input presentation readable
and contained with no Draft or Character Select surface.

**Deployment:** Skipped. Batch 16 remains navigation-milestone code behind
default-false `newShell` and `schedules` capabilities. No production environment
or capability flag changed, and this task did not authorize deployment.

**Deviations:** No product-scope deviation. The direct-launch Playwright check
was adjusted to leave browser fullscreen before taking its mobile-sized
Chromium capture, and the mobile WebKit path uses touch for mode confirmation
to avoid synthesizing an extra keyboard edge. These are deterministic
test-harness corrections, not runtime defects.

**Known issues:** No bug-ledger entry was added. RFG-001 and RFG-002 remain
assigned to Batches 20/24 and were untouched. RFG-003 remains unchanged:
headless Firefox/WebKit cannot use the live local WebRTC practice path and
staged gameplay/Reforged-shell WebKit PNGs are black, so staged object/input
assertions plus mobile-sized Chromium visual evidence remain required. The
Batch 2 scheduling-drift sample and 15.932 effective Hz observation also remain
unchanged. None blocks Batch 17.

### Batch 17 — 2026-07-16 — Journey verification

**Shipped:** Completed the navigation-milestone verification gate across every
Batch 1–16 authority, compatibility, interaction, and recovery boundary. The
existing deterministic inventory already exhaustively covered all 624 legal
Play products plus every standard-match format/composition/mode and six
fighter-lock offsets, malformed and capability-drifted launch rejection,
schedule locking/boundaries, party lifecycle, retained rematches, FORCE paths,
old-client compatibility, and every preserved challenge. Visual review exposed
one tightly coupled acceptance gap: a two-human party's final server-owned
status line could sit beneath its action row. Party review copy now omits empty
rows, uses compact party-only line spacing, and positions actions below measured
copy height. The focused browser snapshot records both bounds and rejects any
future overlap for full-human and confirmed-bot-fill states. No other runtime,
wire, gameplay, capability, art, viewport, camera, or production behavior changed.

**Verification:** Selected the complete verification-gate tier because Batch 17
is one of the roadmap's explicit full-matrix gates. On the final code,
`corepack pnpm test` passed 127 files and 1,514 tests; `corepack pnpm typecheck`,
`corepack pnpm lint`, and the full `corepack pnpm build` passed, with only the
established TypeScript-ESLint support notice and Vite chunk-size advisory. The
explicitly default-false complete three-project Playwright inventory passed 136
tests with 50 documented capability/live-channel skips in 16.2 minutes. With
only `newShell` and `schedules` enabled, the Reforged shell plus party Results
matrix passed 34 tests with five intentional inverse-gate/project skips in 5.6
minutes. After the layout correction, the affected party recovery/readiness and
confirmed bot-fill cases passed all six desktop Chromium, desktop Firefox, and
mobile-landscape runs in 1.7 minutes, including the new measured non-overlap
assertions. Manual inspection of refreshed 1280×720 and 844×390 Chromium
captures confirmed direct launch, fixed party state, bot fill, Records, and
Settings are readable and contained. Staged Firefox/WebKit assertions retained
their established non-pixel role under RFG-003.

**Deployment:** Skipped. Batch 17 is a verification gate inside the unfinished
navigation milestone, not a production release gate. All five capabilities and
production configuration remain unchanged and default false. User review is
required before Batch 18 or any deployment.

**Deviations:** No product-scope deviation. The first default-false Playwright
attempt was detached when the active Codex turn was steered; it was discarded
and replaced by the complete logged 16.2-minute run above. The first full
visual inspection found the party-copy overlap, which was fixed in-scope under
the dynamic bug rule and rerun across every project. No separate bug-ledger ID
was needed because the defect was tightly coupled, low risk, and closed inside
this batch.

**Known issues:** No new open issue was added. RFG-001 CameraKick and RFG-002
ZoomPulse remain assigned to Batches 20/24 and were untouched. RFG-003 remains
open: headless Firefox/WebKit cannot use the live local WebRTC practice path,
and staged gameplay/Reforged-shell WebKit PNGs remain black, so staged object/
input assertions plus Chromium visual evidence are still required. The Batch 2
254.279ms host scheduling drift reset and 15.932 effective-Hz local sample also
remain unchanged; simulation processing stayed far below the 50ms budget.

## Next-session prompt

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md and docs/REFORGED_CAPABILITIES.md before
implementation. Batch 17 — Journey verification is complete and is the
navigation-milestone review gate. Do not begin Batch 18 — Gameplay viewport
cutover unless the user has explicitly approved crossing that gate. After that
approval, implement Batch 18 exactly as specified and do not begin Batch 19 —
Coordinate separation.

Replace the fixed 4:3 gameplay board plus bottom strip with the roadmap's fixed
logical 16:9 world view and responsive safe-area overlay contract only behind
the default-false `largeWorlds` capability. Preserve equal logical world
visibility across devices, shared/server physics, the authoritative 20Hz
simulation, all current map dimensions and gameplay rules, every menu and
challenge flow, the five-tab shell, scheduled arenas, parties, direct standard
launches, Results/rematches, compatibility scenes/messages, and production
configuration. Capability-off, old-server, and old-client paths must retain the
exact established 960×720 gameplay/Lobby behavior through Batch 54.

Do not begin Batch 19 coordinate centralization, camera follow or transient
composition, scrolling worlds, dynamic render targets, responsive combat-HUD
redesign, minimaps, large arenas, modern art, or Battle Royale. Do not repair
RFG-001/RFG-002 early except where a narrow capability-off preservation fix is
strictly required by Batch 18 evidence. Never move authority or physics to the
client, widen a device's competitive view, enable any capability by default, or
deploy without explicit authorization.

Batch 17 is complete and pushed on main as `fix(play): close Reforged journey
gate`. The full 127-file/1,514-test suite, typecheck, lint, production build,
default-false three-project inventory (136 passed/50 documented skips), enabled
Reforged/party matrix (34 passed/5 intentional skips), and focused post-fix
party matrix (6 passed) are green. The only acceptance gap found was party
status copy colliding with action rows; measured dynamic layout and E2E
non-overlap assertions now close it. All five capabilities remain default false,
wire compatibility is intact, production has not been deployed, and the user
must review the navigation milestone before Batch 18 begins.

Choose and document the roadmap's camera/world/visual verification tier for
Batch 18. Add deterministic coverage for the gated 16:9 viewport and safe-area
contract, capability-off/old-server fallbacks, equal desktop/mobile logical
visibility, scene-size restoration across menu/gameplay/Results/recovery, and
unchanged fixed-world rendering assumptions. Run focused tests, `corepack pnpm
typecheck`, `corepack pnpm lint`, the affected and full production build, and
the desktop Chromium/mobile-landscape interaction and visual evidence required
by the risk matrix. Escalate to the full unit or three-project browser suites if
shared, server, wire, recovery, or broader scene foundations change. Update the
roadmap acceptance evidence, baseline/capability/architecture docs when their
contracts change, the dynamic bug ledger, and the Session Log. Run the complete
end-of-batch ritual, commit and push directly to main, and skip deployment unless
explicitly authorized.

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
version. The Batch 17 gate passed without enabling or deploying any capability;
Batch 18 may begin only after explicit user milestone approval.
```
