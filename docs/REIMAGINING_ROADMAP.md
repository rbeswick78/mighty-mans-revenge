# Mighty Man's Revenge: Reforged Roadmap

This document is the living contract for the multi-session Reforged program.
Read this file and `CLAUDE.md` completely at the start of every batch. The
completed `docs/REPLAYABILITY_ROADMAP.md` remains the historical record for the
systems this program preserves and reorganizes.

- **Status:** Batch 31 complete on 2026-07-16; the deterministic four-family
  biome environment kit is in-repo and mechanically dormant.
- **Next batch:** Batch 32 — Modern combat feedback.
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
|  18 | Gameplay viewport cutover              | World/camera  | **DONE — 2026-07-16** |
|  19 | Coordinate separation                  | World/camera  | **DONE — 2026-07-16** |
|  20 | Camera controller                      | World/camera  | **DONE — 2026-07-16** |
|  21 | Dynamic world rendering                | World/camera  | **DONE — 2026-07-16** |
|  22 | Responsive combat HUD                  | World/camera  | **DONE — 2026-07-16** |
|  23 | Minimap foundation                     | World/camera  | **DONE — 2026-07-16** |
|  24 | Camera regression gate                 | World/camera  | **DONE — 2026-07-16** |
|  25 | Style bible                            | Visual system | **DONE — 2026-07-16** |
|  26 | Asset pipeline                         | Visual system | **DONE — 2026-07-16** |
|  27 | Modern UI assets                       | Visual system | **DONE — 2026-07-16** |
|  28 | Fighter art I                          | Visual system | **DONE — 2026-07-16** |
|  29 | Fighter art II                         | Visual system | **DONE — 2026-07-16** |
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

Acceptance:

- [x] Only literal normalized `largeWorlds: true` selects the fixed 1280x720
      logical 16:9 gameplay surface; false, absent, malformed, reconnecting,
      disconnected, and old-server paths retain the exact 960x720 behavior.
- [x] Browser safe-area intrusions convert into frozen logical overlay bounds
      after FIT letterboxing, while desktop and mobile landscape expose the
      same 1280x720 logical world view without competitive widening.
- [x] Menu/gameplay, Character Select/gameplay, gameplay/Results, rematch, and
      connection-recovery transitions restore each scene's owning logical size.
- [x] Every current arena remains 960x576 at world origin with camera scroll
      `(0, 0)`, zoom `1`, fixed render targets, shared/server physics,
      authoritative 20Hz simulation, gameplay rules, and transitional HUD
      geometry unchanged.
- [x] Deterministic viewport/camera coverage, the complete unit inventory,
      typecheck, lint, affected/full builds, capability-off Chromium, enabled
      desktop Chromium/mobile-landscape interaction, and inspected desktop plus
      mobile-sized Chromium captures pass with all capability defaults false.
- [x] No coordinate centralization, camera follow/composition, scrolling,
      dynamic rendering, responsive combat-HUD, minimap, large arena, modern
      art, Battle Royale, capability exposure, production change, or deployment
      began.

#### Batch 19 — Coordinate separation

Centralize screen/world transforms for aim, touch, cursor, particles,
objectives, markers, and overlays. Add deterministic tests before scrolling.

Acceptance:

- [x] One branded gameplay coordinate service owns screen-to-world, inverse
      world-to-screen, direction/aim, world-bounds, and explicit object-domain
      declarations using Phaser's live camera transform without deriving
      authoritative state from screen coordinates.
- [x] Pointer aim, touch-stick aim, fixed-map touch admission, cursor/crosshair,
      and touch controls cross or declare the correct logical screen/world
      boundary while preserving current input and gameplay behavior.
- [x] Fighters and their markers, KOTH/Core Run/Kill Confirmed objectives,
      aim/trail/impact/explosion particles, and world warnings declare world
      space; radiation, scrapstorm, X-ray, flash, signal, and cursor overlays
      declare screen space.
- [x] Deterministic coverage proves every conversion, transformed round trips,
      camera-origin identity, desktop/mobile equivalence, pointer/touch aim,
      fixed-map bounds/objectives/markers, and screen-pinned placement.
- [x] Capability-off/old-server 960x720 fallback, enabled 1280x720 desktop and
      mobile logical equality, current 960x576 maps at origin, camera `(0, 0)`
      and zoom `1`, Results/recovery restoration, and all defaults remain intact.
- [x] Focused tests, full unit/static/build gates, enabled three-project object/
      input evidence, default-false three-project fallback, and inspected
      desktop plus mobile-sized Chromium captures pass. No Batch 20 camera
      controller/composition, scrolling, dynamic rendering, HUD, minimap,
      arena, art, Battle Royale, production, or deployment work began.

#### Batch 20 — Camera controller

Add exact local-player follow, world-edge clamping, respawn and spectator
targets, and separate transient kick/shake/zoom/roll layers.

Acceptance:

- [x] One gameplay camera controller owns exact branded world-space
      local-player follow and base zoom/scroll, with deterministic clamps at
      every edge/corner and authored-origin anchoring for worlds smaller than
      the logical viewport.
- [x] Respawning locals remain explicit targets, respawns return to exact
      local follow, and eliminated/missing locals may follow a deterministic
      living spectator target without adding target cycling or Battle Royale
      spectator behavior.
- [x] Recoil kick, every shake path, zoom pulse, and roll compose as separate
      transient layers over sustained base state; idle and completed effects
      cannot overwrite scroll or zoom, resolving RFG-001 and RFG-002.
- [x] Batch 19's gameplay coordinate service remains the sole screen/world
      transform and preserves pointer/touch aim plus presentation round trips
      while the camera is scrolled, zoomed, kicked, shaken, or rolled.
- [x] Current 960x576 maps remain at `(0, 0)`; enabled 1280x720 desktop/mobile
      keep equal logical visibility, while capability-off/old-server 960x720,
      Results/rematch, and recovery restoration retain established behavior.
- [x] Focused deterministic/static/build gates and targeted enabled/default-
      false desktop Chromium/mobile-landscape object, interaction, restoration,
      and inspected Chromium visual evidence pass. No Batch 21 dynamic world
      rendering, HUD, minimap, arena, art, Battle Royale, production, or
      deployment work began.

#### Batch 21 — Dynamic world rendering

Make maps, collision, destruction, lighting, decals, storms, and effects use
actual dimensions, chunks, culling, pools, and quality budgets rather than
960×576 full-playfield assumptions.

Acceptance:

- [x] The selected registered map derives the one client world-bounds and
      render-plan contract consumed by Batch 19 coordinates, Batch 20 camera,
      map chunks, decals, lighting, storms, X-ray, and shader shockwaves.
- [x] Map presentation uses clipped 8x8-tile chunks with live four-corner
      camera culling; the complete mutable collision grid remains resident and
      shared with prediction/reconciliation without changing authority.
- [x] Persistent decals use chunk-local masked resources, preserve the existing
      full-quality 512-stamp cap, replay across seams, and rebuild every
      affected ledger/mask after authoritative destruction. Live scorch remains
      a map-derived tile mutation and the obsolete fixed RT implementation is gone.
- [x] Lighting and screen effects consume the actual world/viewport resource
      extent, world lights/shockwaves cross only the Batch 19 transform, and
      storms/decals remain aligned while scrolled, zoomed, or rolled.
- [x] Frozen full/reduced budgets govern impact, debris, smoke, light, decal,
      and shockwave pools with deterministic exhaustion and hysteretic cosmetic
      fallback; quality never changes gameplay or authoritative state.
- [x] Current 960x576 maps remain at `(0, 0)` with identical small-world camera
      behavior, equal desktop/mobile logical visibility, exact capability-off
      fallback, Results/rematch and recovery restoration, transitional HUD,
      capability defaults, wire/server/physics/simulation, and production state.
- [x] Focused deterministic/static/build gates, enabled/default-false desktop
      Chromium/mobile-landscape object/interaction evidence, the Batch 21 frame
      recorder, and inspected live plus mobile-sized Chromium captures pass.
      No Batch 22 HUD, minimap, arena, art, Battle Royale, or deployment began.

#### Batch 22 — Responsive combat HUD

Rebuild health, armor, stamina, ammo, ability, mode status, kill feed,
callouts, touch actions, and menus as prioritized safe-area overlays.

Acceptance:

- [x] One pure logical-coordinate layout owns health, armor, stamina, rifle and
      special ammo, grenades, ability, score/mode status, timer, kill feed,
      contracts, countdown/briefings, death, connection/event/combat/contract
      callouts, touch actions, and the confirmed live-match menu.
- [x] Every value and visibility rule retains its established authoritative
      snapshot/event and pure presentation source, including all eight modes,
      Crew units, challenge copy, overtime, contracts, and N-player score/feed
      behavior; no screen coordinate authors gameplay state.
- [x] The three transient callout lanes, persistent status, kill feed, contract
      card, vitals, touch controls, and menu are safe-area bounded and retain a
      readable priority when simultaneous messages compete.
- [x] Pointer, keyboard, standard gamepad, and touch retain equivalent actions;
      touch combat edges and the non-pausing consequence-specific leave
      confirmation remain unchanged.
- [x] Enabled desktop/mobile use the same 1280x720 logical visibility and
      current 960x576 maps stay anchored at origin, while capability-off and
      old-server play retains the exact established 960x720 HUD geometry.
- [x] Focused deterministic/static/build gates and targeted enabled/default-
      false desktop Chromium/mobile-landscape object, interaction, visual,
      Results/rematch, and recovery evidence pass. No Batch 23 minimap, arena,
      camera, rendering-resource, physics, wire, capability-default,
      production, art, or Battle Royale work began.

#### Batch 23 — Minimap foundation

Project map bounds, solids, landmarks, objectives, local player, and allies
where applicable without depending on camera culling or client authority.

Acceptance:

- [x] Capability-owned gameplay projects the selected map's actual bounds,
      complete live collision solids, and authored decoration landmarks from
      map/collision truth independently of camera, chunk culling, viewport
      resources, and screen-derived gameplay state.
- [x] Authoritative destruction removes affected solids and authored
      landmarks, while current 960x576 maps retain origin `(0, 0)` and the
      complete mutable prediction grid remains the existing authority seam.
- [x] KOTH current/next zones, every live Kill Confirmed tag, the Core Run
      core, and the Bounty Hunt target project only in their owning mode from
      live snapshot state; modes without a world objective show none.
- [x] The local fighter and any number of exact server-authored Crew allies
      project from gameplay positions. Generic rivals stay hidden, no team is
      inferred from callsign/order, and a Bounty target appears only as that
      mode's objective.
- [x] One non-interactive screen-pinned minimap layout is safe-area bounded,
      reserves the complete Batch 22 menu/kill-feed/touch/vitals priorities,
      and keeps equal 1280x720 desktop/mobile logical visibility. This batch
      adds no tactical-map or input action.
- [x] Capability-off/old-server play retains the exact 960x720 fallback with
      no minimap. Focused deterministic/static/build gates and targeted
      desktop Chromium/mobile-landscape object, visual, Results/rematch, and
      recovery evidence pass without beginning Batch 24 gate work.

#### Batch 24 — Camera regression gate

Verify center follow, every edge/corner, aiming while scrolling, touch,
screen-space effects, minimap accuracy, quality fallback, and frame pacing.

Acceptance:

- [x] Deterministic and live Phaser evidence verifies exact local, respawn,
      and spectator follow; every edge/corner clamp; current small-world origin
      anchoring; and composed recoil, shake, zoom, and roll without a second
      camera owner.
- [x] Pointer aim, touch aim/admission, world markers/effects, screen-pinned
      HUD/effects, equal desktop/mobile logical visibility, and the repaired
      RFG-001 `(320, 144)` scroll plus RFG-002 `0.9` zoom proofs pass while the
      synthetic gate is scrolled, zoomed, and rolled.
- [x] Dynamic chunks, decals, lighting, storms/X-ray resources, destruction,
      full/reduced quality budgets, and the complete map/objective/local/Crew
      minimap remain accurate independently of camera culling and transients.
- [x] Responsive HUD resources, all eight mode projections, kill feed,
      contracts, simultaneous callouts, touch actions, live-match menu,
      Results/rematch, recovery, exact 960x720 fallback, and every preserved
      standard/challenge journey pass the complete verification inventory.
- [x] RFG-003 has an explicit gate disposition: non-Chromium live local WebRTC
      remains unavailable in this headless host, while staged object/input
      assertions plus direct non-black Phaser renderer snapshots provide
      trusted Firefox/WebKit visual evidence; live and mobile-sized Chromium
      remain the compositor/hardware reference.
- [x] Full unit/integration, typecheck, lint, affected/full builds, complete
      default-false three-project Playwright, enabled three-project camera/
      world/HUD/minimap, server/client recorder, performance, and inspected
      visual gates pass. All capabilities remain default false and production
      was not deployed.

### Milestone 3 — Modern visual system

#### Batch 25 — Style bible

Generate and approve original reference sheets for fighters, environments,
UI, guns, rarity effects, lighting, line weight, color hierarchy, and motion.
Do not bulk-generate production assets before the golden references pass.

Acceptance:

- [x] Four original golden reference sheets define all six established fighter
      identities/silhouettes, four biome families, modern UI and six-gun
      language, all six rarity colors/shapes, lighting, line weight, color
      hierarchy, motion, and full/reduced cosmetic principles.
- [x] Mighty Man, Bruce, Frost Wizard, Bubba, Jack, and Rook retain their
      established mass, posture, carried-object, human/undead, state/layer, and
      ability-accent identities at full and gameplay scale.
- [x] Explicit written criteria cover gameplay-scale readability, collision/
      cover/objective separation, palette and line hierarchy, biome
      differentiation, UI/rarity contrast, lighting, motion, originality,
      provenance, and browser/mobile feasibility.
- [x] Every approved 1536x1024 reference was inspected at full size plus
      temporary 768x512 mobile-width and 384x256 gameplay-detail scales. The
      one generic UI candidate that introduced prohibited `SHOP`/economy copy
      was rejected and narrowly corrected; no other direction required a
      revision.
- [x] `docs/REFORGED_STYLE_BIBLE.md` and the in-repo provenance manifest record
      the approved set, generation lineage, prompt specifications, dimensions, hashes,
      inspection evidence, rejected/deferred directions, and later-batch scope.
- [x] Only documentation/reference artifacts changed. No Batch 26 pipeline,
      production atlas/asset, live UI/fighter/weapon/environment replacement,
      runtime camera/rendering/HUD/minimap behavior, map, gameplay, wire,
      capability default, production configuration, or deployment changed.

#### Batch 26 — Asset pipeline

Establish source/reference folders, cleanup and consistency rules, atlas
generation, import metadata, naming, provenance/attribution, compression, and
automated dimension/frame validation.

Acceptance:

- [x] Non-runtime source, production-reference, provenance, local-archive, and
      generated-runtime destinations are explicit; Batch 25 goldens remain
      immutable documentation references and no production art is added.
- [x] Canonical PNG cleanup, lower-kebab naming, exact sheet/frame grids,
      registration/layer consistency, mip-safe padding/extrusion, and visual
      review responsibilities are documented for later visual batches.
- [x] A dependency-free deterministic packer validates PNG checksums/formats,
      declared dimensions/frame counts, source/decoded/atlas byte ceilings,
      stable sort/packing, no trim/rotation, RGBA8888 output, and repeatable
      hashes.
- [x] Runtime import metadata contains only atlas/frame/dimension/integrity
      data, while complete origin, creator, license, attribution, source
      references, generation lineage, and hashes remain in non-runtime
      provenance reports.
- [x] Third-party source archives and licensing detail cannot enter runtime
      redistribution; archive paths are rejected, local archives are ignored,
      and provenance output under `client/public` fails closed.
- [x] The smallest synthetic fixture proves naming, source confinement,
      dimensions, frame counts, metadata separation, atlas determinism,
      compression boundaries, provenance completeness, and stable multi-error
      reporting without committing generated runtime content.
- [x] Focused validators, repository formatting, `git diff --check`, intended-
      diff/provenance review, typecheck, lint, affected client build, and full
      production build pass. No runtime unit/browser escalation, capability
      exposure, production asset, gameplay behavior, or deployment occurs.

#### Batch 27 — Modern UI assets

Replace tab, card, button, icon, typography, party, queue, tactical-map, and
Results chrome while keeping focus, contrast, touch target, and fallback tests.

Acceptance:

- [x] One project-owned manifest packs the smallest complete production set:
      two canonical PNG sheets, 32 modern chrome states, 16 semantic icons, one
      deterministic 1024x256 RGBA8888 atlas, runtime-safe import metadata, and
      separate complete provenance without copying a Batch 25 golden.
- [x] Capability-owned tabs, cards, buttons, typography, party/queue state,
      tactical-minimap language, responsive HUD frame, match menu, and Results
      chrome consume the atlas while preserving every current label, value,
      visibility, safe-area, input, rematch, and authority rule.
- [x] Teal focus, amber primary/pressed, visible disabled, red-only danger,
      minimum 48px modern control targets, readable contrast, and pointer,
      keyboard, gamepad, and touch activation are deterministic state mappings.
- [x] Full and reduced quality retain identical essential chrome, icon, focus,
      and telegraph treatment without bloom or secondary particles; tactical
      language remains a non-interactive minimap and adds no map gameplay/input.
- [x] Literal server-owned `modernArt` is required for modern presentation.
      Missing/false/old-server paths retain the established shell, 960x720
      gameplay/Lobby, Results/rematch, and recovery behavior; every production
      capability default remains false.
- [x] Focused asset/import/state tests, typecheck, lint, affected/full builds,
      capability-on and capability-off desktop Chromium/mobile-landscape
      interaction, small-world, Results, recovery, and inspected visual evidence
      pass. No fighter, weapon, pickup, biome, combat-effect, map, gameplay,
      capability exposure, production configuration, or deployment changed.

#### Batch 28 — Fighter art I

Modernize Mighty Man, Bruce, and Frost Wizard across directional idle,
movement, attack, ability, damage, and death states without changing mechanics.

Acceptance:

- [x] Three original AI-assisted production references and one deterministic
      project geometry source produce canonical 64px sheets for Mighty Man,
      Bruce, and Frost Wizard without copying, cropping, or reinterpreting a
      Batch 25 golden.
- [x] All three fighters provide registered four-direction idle, movement,
      attack, ability, and damage states plus exact existing horizontal death-
      variant cycles: 100 Mighty Man, 88 Bruce, and 100 Frost Wizard frames.
- [x] Silhouette, facing, negative space, and identity locks preserve Mighty
      Man's bone/amber rifleman and cyan x-ray cue, Bruce's stocky undead no-gun
      mass and ember breath, and Frost Wizard's slim hood/wrap/wand and cyan/
      indigo frost at full, mobile-width, and gameplay scale.
- [x] The Batch 26 packer emits one deterministic 288-frame 2048x1024 RGBA8888
      atlas with exact declared grids, stable sorting, no trim/rotation, 3px
      padding, 2px extrusion, byte ceilings, runtime-safe metadata, and separate
      complete source/generation provenance.
- [x] Literal server-owned `modernArt` gates live gameplay bodies. False,
      absent, old-server, missing-atlas, non-Batch-28 roster, Mighty Man non-
      rifle, and Frost Wizard bat paths retain complete legacy fallbacks; Bruce
      remains gunless and no capability/default/mechanic contract changes.
- [x] Snapshot-derived attack, ability, damage, death, and respawn presentation
      consumes existing authority without changing animation lifecycle, aim,
      collision, movement, weapon, combat, ability, wire, or server behavior.
      Authored recognition and ability cues remain essential in full/reduced.
- [x] Focused generation/asset/import/grid/registration/layer/state/direction/
      fallback/full-reduced tests, typecheck, lint, affected/full builds,
      formatting, diff/provenance review, targeted Chromium/mobile-landscape,
      small-world, HUD/minimap, Results/rematch, recovery, and inspected visual
      evidence pass. No Batch 29 content, legacy removal, capability exposure,
      production configuration, or deployment occurs.

#### Batch 29 — Fighter art II

Modernize Bubba, Jack, and Rook with equivalent coverage, including Jack's
weapon state and Rook's synchronized visual layers.

- [x] Three original AI-assisted references plus deterministic project cleanup
      produce Bubba, Jack, and Rook without copying, cropping, or reinterpreting
      a Batch 25 golden or changing the completed Fighter Art I atlas.
- [x] Five registered canonical sheets provide 404 exact frames: 88 Bubba, 88
      Jack axe-absent, 76 Jack axe-present, 76 Rook body, and 76 Rook helmet.
      All include four-direction idle/move/attack/ability/damage and exact live
      death cycles; Jack's two complete bodies and Rook's synchronized layers
      preserve their grids and registration through every facing and death.
- [x] Bubba retains the tallest/widest planted no-gun undead tank, patched
      overalls/scrap mass, and steel-blue Iron Hide cue; Jack retains a wiry
      rust-red undead shape, long-handled axe truth, and thrown-axe cue; Rook
      retains a compact forward rifleman, close rifle, full green lens helmet,
      paired teal chevrons, and low dash streak at full/mobile/gameplay scale.
- [x] The Batch 26 packer emits one deterministic 404-frame 2048x2048 RGBA8888
      `fighter-art-ii.core` atlas with exact grids, stable sorting, no trim or
      rotation, 3px padding, 2px extrusion, byte ceilings, runtime-safe import
      metadata, and separate complete production lineage.
- [x] Literal server-owned `modernArt` gates live bodies. False, absent,
      old-server, missing-atlas, non-Batch-29, and incompatible Rook non-rifle
      paths preserve legacy fallbacks; Bubba remains no-gun and Jack follows
      the existing snapshot-owned axe cooldown without mechanics changes.
- [x] Focused deterministic asset/import/grid/registration/layer/state/
      direction/fallback/full-reduced tests, typecheck, lint, affected/full
      builds, formatting, diff/provenance review, targeted desktop Chromium and
      mobile-landscape interaction/visual evidence, small-world HUD/minimap,
      Results/rematch, death/respawn, and recovery checks pass. No Batch 30
      content, capability exposure, legacy retirement, or deployment occurs.

#### Batch 30 — Weapons and pickups

Produce coherent held, firing, ground, HUD, ammo, container, and rarity-aura
assets for six guns plus existing sustain pickups.

- [x] One AI-assisted production reference and deterministic project cleanup
      produce six exact 24-frame 64px gun sheets: rifle, pistol, shotgun, SMG,
      sniper rifle, and launcher. Every sheet preserves one recognizable base
      silhouette across directional held, firing, dry, ground, HUD, ammo, and
      container presentation.
- [x] Rifle remains the balanced middle-length baseline; pistol is the smallest
      compact block; shotgun owns the thick pump/front mass; SMG is the short
      box with deep magazine; sniper is the longest narrow scoped shape; and
      launcher is the broadest tube with the heaviest rear mass.
- [x] Existing gun ammo, grenade, bandage, armor, and overcharge identities plus
      supply/container language are registered without changing authoritative
      pickup types, spawn timing, ammo, inventory, rarity, or loot behavior.
      Bat and punch keep their legacy presentation and mechanics.
- [x] Common neutral, Uncommon underline, Rare two ticks, Epic four facets,
      Legendary three crown rays, and Mythical narrow double chevrons are
      registered as compact grayscale-readable presentation overlays only.
      Full/reduced policy retains badge, rim, silhouette, timing, and identity;
      neither tier repaints a gun or adds damage, bloom, or particles.
- [x] The unchanged Batch 26 packer emits one deterministic 158-frame 1024x1024
      RGBA8888 `weapon-pickup-art.core` atlas from eight canonical sources with
      exact grids, stable sorting, no trim/rotation, 3px padding, 2px extrusion,
      byte ceilings, runtime-safe import metadata, and separate full lineage.
- [x] Literal server-owned `modernArt` gates live current rifle/pistol/shotgun,
      sustain-pickup, and HUD/ammo presentation. False, absent, old-server,
      missing-atlas, bat, and punch paths retain legacy fallbacks. SMG, sniper,
      launcher, rarity, and container art are registered but mechanically
      dormant for their owning later batches.
- [x] Deterministic asset/import/grid/registration/silhouette/presentation/
      rarity/pickup/fallback/full-reduced tests, the full 1,585-test unit matrix,
      typecheck, lint, affected/full builds, formatting, diff/provenance review,
      and targeted desktop Chromium/mobile-landscape live evidence pass. Current
      small-world, HUD/minimap, Results/rematch, recovery, and capability-off
      contracts remain green; no Batch 31 work, exposure, or deployment occurs.

#### Batch 31 — Biome environment kit

Produce seamless terrain, walls, low cover, damage states, props, landmarks,
shadows, and transitions for wasteland, overgrown, industrial, and irradiated
families with explicit collision readability.

- [x] One original AI-assisted reference plus deterministic project geometry
      emits four exact 20-frame 64px sheets. Each family owns three seam-safe
      ground variants, three directed transition pieces, paired full-wall,
      low-cover, two-prop, and landmark states, three southeast shadows, and a
      grayscale-readable navigation anchor.
- [x] The unchanged Batch 26 packer emits a separate deterministic 80-frame
      1024x512 RGBA8888 `biome-environment-art.core` atlas plus runtime-safe
      import JSON and complete non-runtime provenance. All completed atlases and
      Batch 25 goldens remain byte-for-byte isolated from this set.
- [x] Boot validates/registers all 80 frames. Literal server-owned `modernArt`
      permits only the targeted verification preview; live maps retain their
      exact legacy tile, cover, decoration, procedural, destruction, collision,
      minimap, and fallback paths until Batch 33.
- [x] Deterministic asset/import/grid/seam/registration/collision/pairing/
      footprint/landmark/shadow/transition/palette/grayscale/dormancy/full-
      reduced checks, typecheck, lint, affected/full builds, formatting, diff/
      provenance review, and targeted desktop Chromium/mobile-landscape visual
      evidence pass. No shared/server/wire/map/mechanics/capability-default/
      production/deployment behavior changes and no Batch 32 work occurs.

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

| ID      | Discovered | Reproduction/evidence                                                                                                     | Relationship  | Disposition                                                                                                                                                                                                                                                   | Status             |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| RFG-001 | 2026-07-15 | Idle recoil used to clear sustained `(320, 144)` base scroll to `(0, 0)`.                                                 | Batches 20/24 | Resolved by composed kick offsets in Batch 20; retain the proof in the Batch 24 gate.                                                                                                                                                                         | Resolved           |
| RFG-002 | 2026-07-15 | Idle zoom pulse used to clear sustained base zoom `0.9` back to `1`.                                                      | Batches 20/24 | Resolved by the composed zoom multiplier in Batch 20; retain the proof in the Batch 24 gate.                                                                                                                                                                  | Resolved           |
| RFG-003 | 2026-07-15 | Headless Firefox/WebKit live practice gets no player ID; compositor screenshots from staged WebKit gameplay remain black. | Batches 17/24 | Batch 24 accepts staged object/input assertions plus direct non-black Phaser renderer snapshots as trustworthy Firefox/WebKit visual evidence; Chromium remains the live/compositor reference. Revisit real-device/live-channel coverage at the release gate. | Gate-dispositioned |

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

### Batch 18 — 2026-07-16 — Gameplay viewport cutover

**Shipped:** Added a pure, fail-closed gameplay viewport contract and connected
it only to `GameScene`. Literal normalized `largeWorlds: true` now selects a
fixed 1280x720 logical 16:9 FIT surface with viewport-to-logical browser safe-
area conversion. False, absent, malformed, old-server, reconnecting, and
disconnected states retain or restore the exact 960x720 surface. GameScene
shutdown and Results creation restore legacy sizing, while a rematch reapplies
the current capability contract. The signal-loss beat now covers whichever
gameplay surface is active. Current 960x576 maps, origin, camera scroll/zoom,
fixed render targets, HUD/touch geometry, input transforms, shared/server
physics, 20Hz authority, game rules, wire state, and every menu/challenge route
remain unchanged.

**Verification:** Selected the roadmap camera/world/visual tier because this is
an isolated client viewport and scene-size boundary. Focused viewport plus
unchanged-camera Vitest passed 8 tests across two files. An early focused-command
separator expanded to the complete inventory, which also passed 128 files and
1,520 tests; this stronger result found no shared/server coupling. `corepack
pnpm typecheck`, `corepack pnpm lint`, the affected client build, and full
production build passed with only the established Vite chunk-size advisory.
Default-false desktop Chromium passed the exact 960x720 fallback (one pass, two
intentional inverse-gate skips). With only `largeWorlds` enabled, final desktop
Chromium and mobile-landscape object/interaction/restoration evidence passed
four tests with two inverse-gate skips. Inspected 1280x720 and resized 844x390
Chromium captures showed the same complete fixed arena and transitional HUD
inside the 16:9 surface; staged mobile WebKit retained its non-pixel role under
RFG-003. The full Playwright inventory was not rerun because no shared, server,
wire, capability-default, broad recovery, or release-gate foundation changed,
and focused evidence showed no wider regression.

**Deployment:** Skipped. Batch 18 is unfinished world/camera milestone work
behind the default-false `largeWorlds` capability. No production environment,
flag, server, or client deployment changed, and this task did not authorize one.

**Deviations:** No product-scope deviation. The first enabled mobile fixture
also advertised `newShell`, racing its synthetic gameplay start against shell
entry under RFG-003. The fixture was narrowed to the independently owned
`largeWorlds` capability and final desktop/mobile runs passed. The retained map
and HUD occupy the established 960x720 region of the wider surface by design;
centering, scrolling, dynamic targets, and HUD migration remain Batches 19-22.

**Known issues:** No bug-ledger entry was added. RFG-001 CameraKick and RFG-002
ZoomPulse remain assigned to Batches 20/24 and still reproduce in their passing
baseline tests. RFG-003 remains open for headless Firefox/WebKit live WebRTC and
black staged canvas captures. The Batch 2 254.279ms host scheduling drift reset
and 15.932 effective-Hz sample remain unchanged; no simulation code changed.

### Batch 19 — 2026-07-16 — Coordinate separation

**Shipped:** Added `GameplayCoordinateSpace` as the single client gameplay
boundary for branded logical screen/world points, Phaser-camera
screen-to-world conversion, inverse affine world-to-screen conversion,
screen-direction/aim transforms, fixed-world checks, and explicit object-domain
declarations. Keyboard pointer aim and touch-stick aim now use that boundary;
fixed-map touch admission converts screen input to world Y. Cursor/touch UI and
warning/full-screen overlays are screen-pinned, while fighters and markers,
KOTH/Core Run/Kill Confirmed objectives, aim/trail/impact/explosion particles,
and world warnings explicitly remain world-space. The camera stays at `(0, 0)`
with zoom `1`; current maps, render targets, HUD, physics, simulation, wire,
authority, capability defaults, compatibility routes, and production state are
unchanged.

**Verification:** Selected the camera/world/visual tier and escalated for the
gameplay input-foundation touch points. Focused coordinate, viewport, and
camera-baseline Vitest passed 14 tests across three files. The required full
`corepack pnpm test` passed 129 files and 1,526 tests; `corepack pnpm typecheck`,
`corepack pnpm lint`, the affected client build, and full production build
passed with only the established Vite chunk-size advisory. With `largeWorlds`
enabled, the focused desktop Chromium, desktop Firefox, and mobile-landscape
matrix passed six tests with three intentional inverse-gate skips, covering
live Phaser conversion identity, world objectives/markers/particles,
screen-pinned overlays, pointer/crosshair aim, touch aim/bounds, equal logical
visibility, and Results/recovery restoration. With defaults false, the exact
960x720 fallback passed all three projects with six gated skips. The final
desktop Chromium and mobile-landscape evidence passed four tests with two
inverse-gate skips. Inspected 1280x720 and resized 844x390 Chromium captures
retained the complete uncentered fixed arena/transitional HUD; staged mobile
WebKit remained black under RFG-003.

**Deployment:** Skipped. Batch 19 is unfinished world/camera milestone work
behind default-false `largeWorlds`. No production environment, capability,
server, client deployment, or exposure changed, and this task did not authorize
deployment.

**Deviations:** No product-scope deviation. The sandbox could not execute pnpm
linked binaries until the existing repository-scoped Corepack pnpm approval was
used. An initial scripted Playwright invocation forwarded the project filters
after an extra separator and therefore ran the full three-project focused file;
that stronger run passed and the final direct Playwright command retained the
intended Chromium/mobile artifacts. No runtime correction was required.

**Known issues:** No bug-ledger entry was added. RFG-001 CameraKick and RFG-002
ZoomPulse still reproduce and now pass to their owning Batch 20/24 work; this
batch did not alter either layer. RFG-003 remains open for headless Firefox/
WebKit live WebRTC and black staged canvas captures. The Batch 2 254.279ms host
scheduling drift reset and 15.932 effective-Hz sample remain unchanged; no
simulation code changed.

### Batch 20 — 2026-07-16 — Camera controller

**Shipped:** Added `CameraController` as the single gameplay owner of base
follow/clamping and composed recoil, shake, zoom, and roll. Targets are branded
world positions with explicit local-player, respawn, and spectator kinds.
`GameScene` follows its rendered local prediction, retains the local corpse
during ordinary respawn, and uses the stable first living remote only when the
local fighter is eliminated or absent. Every former direct Phaser shake and
the old absolute kick/zoom/roll writers now request transient controller
layers. Small worlds clamp to their authored origin, so current 960x576 maps
remain at `(0, 0)` on both logical surfaces. Batch 19 coordinate transforms
remain the only aim/presentation boundary. RFG-001 and RFG-002 are resolved.

**Verification:** Selected the camera/world/visual tier because changes are
isolated to client camera presentation, `GameScene` targeting/cleanup, and the
existing gameplay-viewport evidence; no shared, server, wire, persistence,
capability-default, or production boundary changed. Focused Vitest passed 29
camera, coordinate, and viewport tests across four files. `corepack pnpm
typecheck`, `corepack pnpm lint`, the affected client build, and the full
production build passed; Vite's established chunk-size advisory is unchanged.
With `largeWorlds` enabled, targeted desktop Chromium/mobile-landscape object,
input, transformed-aim, transient composition, equal-visibility, Results, and
recovery evidence passed four tests with two inverse-gate skips. With defaults
false, exact 960x720 fallback passed both projects with four gated skips. A
final desktop Chromium case passed and retained inspected 1280x720 plus 844x390
Chromium captures; both show the unchanged origin-anchored arena and
transitional HUD. The complete unit and three-project Playwright inventories
were omitted because no shared/server/wire/input/recovery foundation changed,
this is not the Batch 24 gate, and focused evidence showed no wider risk.

**Deployment:** Skipped. Batch 20 remains unfinished world/camera milestone
work behind default-false `largeWorlds`. No production environment,
capability, server, client deployment, or exposure changed, and this task did
not authorize deployment.

**Deviations:** No product-scope deviation. The first focused unit run exposed
a negative-zero shake sample at the exact expiry edge; completed shake state
now normalizes to literal zero. A strengthened live Phaser assertion then
caught an initial zoom-aware clamp formula treating `scrollX/Y` as the
world-view top-left. The controller now follows Phaser's center-origin scroll
semantics, and exact zoomed target centering plus edge clamps pass. Current maps
are intentionally too small to scroll, so live evidence exercises scroll/zoom
through a synthetic controller world bound without changing map data, then
restores the real fixed-map contract before capture.

**Known issues:** RFG-001 and RFG-002 are resolved and remain historical
regression evidence for Batch 24. RFG-003 remains open for headless Firefox/
WebKit live WebRTC and black staged canvas captures. The Batch 2 254.279ms host
scheduling drift reset and 15.932 effective-Hz sample remain unchanged; no
simulation code changed.

### Batch 21 — 2026-07-16 — Dynamic world rendering

**Shipped:** Added one map-derived `WorldRenderPlan` for actual world bounds,
clipped 8x8-tile chunks, viewport/world-intersection resources, visible-chunk
culling, frozen full/reduced cosmetic budgets, hysteretic quality fallback, and
deterministic FIFO pool acquisition. `GameScene` now selects the authoritative
registered map before constructing the Batch 19 coordinate service and Batch 20
camera controller, so both consume the actual world. Map presentation and
chunk-local masked decal resources cull from the coordinate-derived four-corner
view; the dense client collision grid remains resident for shared prediction.
Seam-crossing decals retain their style ledger and authoritative destruction
rebuilds every affected mask/resource. Lighting, storm/X-ray overlays, and
shockwaves use derived dimensions or the live coordinate transform. Existing
impact/debris/smoke/shockwave pools and lights consume quality budgets. Removed
the unused fixed-size scorch RT; live tile scorch remains unchanged.

**Verification:** Selected the camera/world/performance/visual tier because all
runtime changes are isolated to client presentation and test instrumentation;
shared, server, wire, persistence, input, recovery authority, capability
defaults, and production are unchanged. Focused Vitest passed 36 camera,
coordinate, chunk/resource, pool/quality, storm, and historical camera tests
across six files. `corepack pnpm typecheck`, `corepack pnpm lint`, the affected
client build, and full production build passed; Vite's established chunk-size
advisory remains. With `largeWorlds` enabled, desktop Chromium/mobile-landscape
viewport evidence passed six applicable tests with two intentional inverse-gate
skips, including seam destruction, edge culling, transformed lighting, quality
fallback, equal visibility, Results, and recovery. With defaults false, exact
legacy 960x720 fallback passed both projects with six gated skips. The first
default-false attempt exposed first-frame mobile `camera.worldView` staleness;
four-corner Batch 19 view derivation fixed the test-coupled culling input and the
rerun passed. The targeted frame recorder passed desktop Chromium and mobile
landscape, logging six visible chunks/decal resources and derived 960x576
lighting. The complete unit and three-project browser inventories were omitted
because no shared/server/wire/recovery/input foundation changed, this is not the
Batch 24 gate, and focused evidence showed no broader risk.

**Performance/visual:** The recorder observed live headless Chromium at 3.658
FPS / 273.375ms mean at full quality and staged mobile at 30.202 FPS / 33.110ms
mean at reduced quality. These are host/software-renderer observations, not pass
thresholds; >250ms host stalls do not force a cosmetic tier change. Inspected
live Chromium retained the complete map, lighting, transient HUD, and world
effects. Mobile-sized Chromium retained the same logical view; the staged
mobile WebKit recorder PNG remains black under RFG-003 and is not visual
evidence.

**Deployment:** Skipped. Batch 21 remains unfinished world/camera milestone
work behind default-false `largeWorlds`. No production environment, capability,
server, or client deployment changed, and this task did not authorize one.

**Deviations:** No product-scope deviation. The viewport contract still reports
its compatibility-era 960x576 current-world field while the live coordinate,
camera, and rendering path now derives the selected map's actual dimensions;
all current maps make those values identical. The transitional combat HUD and
touch positions remain intentionally untouched for Batch 22. A final attempt
to run the affected and full Vite builds concurrently raced while both cleaned
`client/dist/assets`; the full build passed and the affected build passed when
rerun alone, confirming a verification-process collision rather than a runtime
or build defect.

**Known issues:** No bug-ledger entry was added. RFG-001 and RFG-002 remain
resolved historical proofs for Batch 24. RFG-003 remains open for headless
Firefox/WebKit live WebRTC and black staged canvas captures. The Batch 2
254.279ms host scheduling drift reset and 15.932 effective-Hz sample remain
unchanged; no authoritative simulation code changed.

### Batch 22 — 2026-07-16 — Responsive combat HUD

**Shipped:** Added one pure `responsiveCombatHudLayout()` model for the complete
combat HUD, touch action cluster, and confirmed live-match menu. Literal
`largeWorlds` play now places health/armor, stamina, rifle/special ammo,
grenades, ability, score/mode/timer state, active events, kill feed, contracts,
countdown/briefings, death, connection beats, and separately prioritized
combat/contract/event callouts inside Batch 18's logical safe area. Desktop and
mobile share the same 1280x720 logical coordinates. Touch action edges and the
non-pausing consequence-specific menu confirmation remain unchanged. The exact
legacy 960x720 geometry remains frozen when the capability is false or absent.
All authoritative snapshot/event sources and mode/challenge visibility and unit
rules remain intact; no minimap, world resource, camera, transform, physics,
wire, balance, capability-default, production, art, or Battle Royale behavior
changed.

**Verification:** Selected the camera/world/visual tier plus focused input/menu
evidence because runtime changes are isolated to client screen-space layout and
do not change shared, server, wire, persistence, recovery authority, or input
semantics. Focused Vitest passed 78 tests across 19 HUD, viewport, resource,
mode-status, kill-feed, callout, briefing, death, touch, gamepad, and match-menu
files. `corepack pnpm typecheck`, `corepack pnpm lint`, the affected client
build, full production build, repository Prettier, and `git diff --check`
passed; Vite's established chunk-size advisory remains. Final enabled desktop
Chromium/mobile-landscape HUD/menu/touch plus Results/rematch/recovery evidence
passed four tests. Exact default-false 960x720 fallback passed both projects,
and isolated desktop Chromium plus mobile-landscape equal-visibility/current-
small-world evidence passed. Inspected desktop and mobile-sized Chromium HUD
and menu captures are readable and contained; staged mobile WebKit remains
black under RFG-003. The complete unit and three-project browser inventories
were omitted because no shared/server/wire/recovery/input foundation changed,
this is not the Batch 24 gate, and focused evidence showed no broader risk.

**Deployment:** Skipped. Batch 22 remains unfinished world/camera milestone
work behind default-false `largeWorlds`. No production environment, capability,
server, or client deployment changed, and this task did not authorize one.

**Deviations:** No product-scope deviation. Initial visual evidence showed the
three technically separate transient callout lanes were too tight at animation
scale; their large-world spacing was widened before final object and visual
verification. Early focused browser assertions also used pre-existing rounded
vitality copy incorrectly and bypassed normal GameScene cleanup while staging a
rematch; the fixtures now assert the established rounding and exercise the real
cleanup boundary. One host-limited combined Chromium run timed out before a
canvas bound lookup; the isolated equal-visibility rerun passed. No runtime
authority or behavior defect remained.

**Known issues:** No bug-ledger entry was added. RFG-001 and RFG-002 remain
resolved historical proofs for Batch 24. RFG-003 remains open for headless
Firefox/WebKit live WebRTC and black staged canvas captures. The Batch 21
3.658-FPS live Chromium and 30.202-FPS staged mobile observations and the Batch
2 254.279ms host scheduling drift reset/15.932 effective-Hz sample remain
non-hardware evidence; no rendering recorder, simulation, or server code
changed.

### Batch 23 — 2026-07-16 — Minimap foundation

**Shipped:** Added a pure minimap layout/projection boundary and a thin
screen-pinned Phaser renderer only for literal capability-owned large-world
gameplay. Static projection consumes the selected map's actual bounds, the
complete mutable collision grid, and authored decoration metadata; authoritative
tile destruction refreshes both solids and surviving landmarks. Dynamic
projection consumes the owning mode plus live KOTH current/next zones, Kill
Confirmed tags, Core Run state, Bounty Hunt target, local gameplay position,
and exact server-authored Crew teams. Generic rivals remain hidden, allies are
N-player-safe and id-sorted, and no team/objective/visibility state comes from
callsigns, screen coordinates, camera, chunks, or viewport resources. The
non-interactive 216x154 safe-area panel reserves Batch 22's complete five-row
kill feed, match-menu launcher, touch cluster, and other HUD regions. The exact
legacy path creates no minimap.

**Verification:** Selected the camera/world/visual plus isolated client-UI
tier because source changes remain inside client presentation and focused E2E
instrumentation; no shared/server/wire/persistence/recovery/input authority,
capability default, or production boundary changed. Final focused Vitest passed
29 tests across minimap, responsive HUD, gameplay viewport, dynamic world
rendering, and the historical camera reproductions. `corepack pnpm typecheck`,
`corepack pnpm lint`, `corepack pnpm --filter @game/client build`, and the full
`corepack pnpm build` passed; Vite's established chunk-size advisory remains.
With `largeWorlds` enabled, targeted desktop Chromium/mobile-landscape equal-
visibility/camera, minimap objective/Crew/destruction, and Results/rematch/
recovery evidence passed six tests. Exact default-false fallback passed both
projects, and a final desktop Chromium minimap rerun passed with attached
1280x720 and resized 844x390 frames. Direct inspection found both frames
readable, complete, and clear of the HUD. The complete unit inventory and
three-project browser matrix were omitted because this is isolated client
presentation, not the Batch 24 gate, and focused evidence showed no broader
risk.

**Deployment:** Skipped. Batch 23 remains unfinished world/camera milestone
work behind default-false `largeWorlds`. No production environment, capability,
server, client deployment, or exposure changed, and this task did not authorize
one.

**Deviations:** No product-scope deviation. The client-only `tsc` shortcut was
not exposed by this workspace, so the required root typecheck was used. The
in-app browser could not reach the host localhost service; the already-green
Playwright Chromium path therefore attached its exact desktop and mobile-sized
frames for local inspection. Staged mobile WebKit retained object assertions
under RFG-003 and was not treated as pixel evidence. No runtime correction was
required after visual review.

**Known issues:** No bug-ledger entry was added. RFG-001 and RFG-002 remain
resolved historical proofs owned by the Batch 24 regression gate. RFG-003
remains open for headless Firefox/WebKit live WebRTC and black staged canvas
captures. The Batch 21 host-limited frame observations and Batch 2 scheduling-
drift sample remain non-hardware evidence; no simulation or server code changed.

### Batch 24 — 2026-07-16 — Camera regression gate

**Shipped:** Completed the cumulative Batch 18–23 scrolling-world/camera
verification gate without changing gameplay presentation or authority. The
existing deterministic and live Phaser matrix verifies exact local, respawn,
and spectator follow, every edge/corner clamp, RFG-001 sustained scroll
`(320, 144)`, RFG-002 sustained zoom `0.9`, transformed pointer/touch aim,
screen-pinned HUD/effects, map-derived chunks/resources, destruction, quality
fallback, responsive HUD, complete minimap truth, Results/rematch, recovery,
and exact capability-off fallback. Added only verification infrastructure:
isolated configurable E2E ports, direct Phaser renderer snapshots for staged
non-Chromium pixels, retained gate artifacts, and host-tolerant 15-second
Gauntlet scene-readiness waits.

**Verification:** Selected the complete camera/world/performance verification-
gate tier required by Batch 24. The final `corepack pnpm test` inventory passed
133 files and 1,563 tests. `corepack pnpm typecheck`, `corepack pnpm lint`, the
affected client build, and the full production build passed with the established
Vite chunk advisory. The complete default-false three-project Playwright
inventory passed 139 cases with 68 documented capability/project skips and no
failures in 23.8 minutes. With only `largeWorlds` enabled, the complete camera/
world/HUD/minimap file passed 17 cases with four expected inverse/project skips
in 3.3 minutes across desktop Chromium, desktop Firefox, and mobile landscape.
The final three-project client recorder passed, as did the server simulation,
snapshot, and live-loop recorder. Direct inspection of retained 1280x720 and
844x390 Chromium compositor frames plus Firefox and WebKit renderer-extracted
frames found the current arena, HUD, minimap, objective/Crew markers, callout,
and touch controls readable and unclipped.

**Performance/network:** The server recorder observed 0.027ms mean, 0.051ms
p95, 0.223ms p99, and 4.009ms max across 2,000 warmed four-player ticks; active
two/four-player snapshots remained 2,481/3,762 bytes. Its live window recorded
15.981 effective Hz, a 0.104ms processing mean, and one 253.572ms host scheduling
drift reset while the rolling counter remained 20Hz. The enabled client recorder
observed live Chromium at 3.227 FPS / 309.930ms mean, staged Firefox at 109.392
FPS / 9.141ms mean, and staged mobile WebKit at 21.046 FPS / 47.516ms mean.
These remain local headless/software-renderer observations, not hardware pass
thresholds; gameplay authority and simulation stayed within their existing
budgets.

**Deployment:** Skipped. Batch 24 is a verification gate inside the unfinished
world/camera milestone, not a production release gate. All five capabilities
and production configuration remain unchanged and default false. User review
is required before Batch 25 or any deployment.

**Deviations:** No product-scope deviation. The first live Chromium recorder
attempt reused an unrelated access-protected listener on port 3000 and timed
out without a welcome. Configurable isolated E2E ports forced fresh repository
services and the focused plus complete recorder reruns passed. The first full
default-false matrix then found only three Firefox Gauntlet boot waits exceeding
their implicit five-second polling default under host contention; all three
passed narrowly, their readiness waits were aligned to the existing 15-second
cross-browser boundary, and the complete 23.8-minute gate rerun passed. No
runtime camera, minimap, rendering, HUD, input, gameplay, server, or wire change
was made to satisfy the gate.

**Known issues:** RFG-001 and RFG-002 are closed and retained as mandatory
historical proofs. RFG-003 is gate-dispositioned rather than fully resolved:
headless Firefox/WebKit still cannot use the live local WebRTC practice path and
WebKit compositor screenshots may remain black, but staged object/input checks
and direct non-black Phaser renderer snapshots now provide trustworthy engine-
specific visual evidence. Live and mobile-sized Chromium remain the compositor/
hardware visual source; real-device/live-channel coverage should be revisited
at the Reforged Arena release gate. No new bug ID was required.

### Batch 25 — 2026-07-16 — Style bible

**Shipped:** Established the original Reforged stylized-comic 2D visual system
and four approved 1536x1024 golden reference sheets: all six fighter identities
and silhouettes; wasteland, overgrown, industrial, and irradiated biome
families; modern five-tab UI, six-gun, pickup, and rarity language; and the
complete line-weight, value, lighting, motion, and full/reduced-effect grammar.
`docs/REFORGED_STYLE_BIBLE.md` freezes the written implementation rules and
acceptance criteria. The provenance manifest records every prompt, output id,
dimension, SHA-256, inspection result, and disposition. Five total candidates
were generated: four goldens plus one retained rejected UI predecessor. No
production sprites, atlases, import metadata, live replacement, or runtime
behavior was added.

**Verification:** Selected the camera/world/visual documentation-and-reference
tier. Every golden PNG was inspected at original 1536x1024 resolution and in
temporary local 768x512 mobile-width plus 384x256 gameplay-detail previews.
Fighter identity, gameplay silhouette, collision/objective hierarchy, all four
biomes, UI states, six gun shapes, six value/shape-coded rarities, five lighting
conditions, motion strips, and full/reduced effect pairs remained readable. The
initial UI sheet's generic `SHOP`, upgrade, and dismantle copy violated the
locked no-economy scope; a single text-only image edit preserved its approved
visual structure while restoring Play/Fighters/Challenges/Records/Settings and
neutral game actions. Repository Prettier, `git diff --check`, in-repo image
dimension/hash validation, provenance/intended-diff review, and link/path review
passed. Runtime typecheck, lint, unit, build, recorder, and browser suites were
deliberately omitted because no executable source, configuration, generated
runtime content, dependency, capability, or production path changed.

**Deployment:** Skipped. Batch 25 is visual reference documentation inside the
unfinished visual-system milestone. All five capabilities and production
configuration remain default false and unchanged; no server or client was
deployed.

**Deviations:** No product-scope deviation. Direct `file://` inspection in the
in-app browser was blocked by browser URL policy, so reduced-scale evidence used
local temporary PNG previews and the image viewer without modifying the golden
sources. The initial UI candidate's prohibited generic economy labels were a
tightly coupled reference defect and were corrected before approval. No bulk
candidate or production-asset generation occurred.

**Known issues:** No new bug-ledger entry was required. RFG-001 and RFG-002
remain closed historical camera proofs. RFG-003 remains gate-dispositioned and
unchanged because Batch 25 introduced no runtime/browser path. The style bible
does not authorize pipeline implementation, visual cutover, larger maps,
capability exposure, or deployment; Batch 26 owns the source/atlas pipeline.

### Batch 26 — 2026-07-16 — Asset pipeline

**Shipped:** Established `art/reforged/sources`, `references`, and `provenance`
as non-runtime production-art boundaries, with local source archives and atlas
scratch output ignored. Added `docs/REFORGED_ASSET_PIPELINE.md` as the cleanup,
naming, exact sheet/frame-grid, registration, compression, attribution, and
later-batch acceptance contract. Added a dependency-free Node PNG/atlas tool
that verifies checksums and canonical 8-bit RGB/RGBA input, confines source
paths, sorts asset/frame identities, packs deterministic power-of-two shelves
without trim or rotation, extrudes mip-safe edges, emits RGBA8888 plus stable
runtime import JSON, enforces source/decoded/atlas byte ceilings, and writes
complete hashes/license/lineage only to a separate non-runtime provenance
report. The synthetic fixture creates two tiny PNGs only in the system temp
directory and commits no generated runtime content or production art.

**Verification:** Selected the visual/tooling tier with executable-tooling
escalation because Batch 26 changes a root package script and adds a standalone
build tool, but changes no runtime source, generated runtime content, shared,
server, wire, persistence, scene, capability, or production boundary.
`corepack pnpm test:assets` passed 8 focused deterministic validators for
naming/path confinement, dimensions, frame counts, metadata separation,
byte-identical atlas/import/provenance output, compression boundaries,
provenance completeness, and stable failure reporting. Repository Prettier,
`git diff --check`, intended-diff/provenance review, `corepack pnpm typecheck`,
`corepack pnpm lint`, `corepack pnpm --filter @game/client build`, and the full
`corepack pnpm build` passed. Vite's established chunk-size advisory remains.
Runtime unit and browser suites were deliberately omitted because the tool and
fixtures never enter application execution or runtime asset output, and focused
evidence showed no broader coupling.

**Deployment:** Skipped. Batch 26 is tooling and contract work inside the
unfinished visual-system milestone. All five capabilities and production
configuration remain default false and unchanged; no server or client was
deployed.

**Deviations:** No product-scope deviation. Repository-local Prettier,
TypeScript, and ESLint binaries initially hit the managed sandbox's node-module
read restriction; the identical commands passed with approved repository-local
execution. The first documented pnpm forwarding form was exercised, corrected,
and made separator-tolerant before final verification. No production art was
generated and no Batch 25 golden was modified.

**Known issues:** No new bug-ledger entry was required. RFG-001 and RFG-002
remain closed historical camera proofs. RFG-003 remains gate-dispositioned and
unchanged because Batch 26 adds no runtime/browser path. Batch 27 owns modern UI
production assets; the pipeline does not authorize fighter, weapon, biome,
combat-feedback, map, Battle Royale, capability-exposure, or deployment work.

### Batch 27 — 2026-07-16 — Modern UI assets

**Shipped:** Added the first production Reforged atlas without copying or
reinterpreting a Batch 25 golden. One project-owned deterministic geometry
source emits two canonical PNG sheets: 32 chamfered panel/tab/card/button/HUD/
Results/tactical states and 16 semantic icons. The unchanged Batch 26 packer
produces one 48-frame 1024x256 RGBA8888 atlas, runtime-safe import JSON, and a
separate complete provenance report. Boot validates/registers named frames.
Literal server-owned `modernArt` now selects modern five-tab shell, party/queue,
HUD/minimap/match-menu, and Results chrome with condensed system typography,
teal focus, amber primary/pressed, visible disabled, red-only danger, and 48px
minimum modern targets. Existing values, visibility, safe areas, actions,
authority, and procedural fallbacks are unchanged.

**Verification:** Selected the visual plus isolated capability-owned client-UI
tier because executable work is confined to client presentation, deterministic
asset tooling, and focused E2E instrumentation; no shared/server/wire/
persistence, input/focus foundation, recovery authority, capability default, or
production boundary changed. `corepack pnpm test:assets` passed 10 validators,
including byte-identical committed runtime/provenance rebuilds and metadata
separation. Focused Vitest passed three atlas-state, import-schema, contrast,
touch-target, and full/reduced tests. `corepack pnpm typecheck`, `corepack pnpm
lint`, affected client build, full production build, repository formatting, and
`git diff --check` passed; Vite's established chunk-size advisory remains.
Targeted desktop Chromium/mobile-landscape evidence passed four modern shell/
queue/HUD/minimap/Results cases, four exact capability-off/old-server fallback
cases, and six `modernArt=false` shell, large-world, Results/rematch, and
recovery cases. Inspected 1280x720 and 844x390 Chromium frames are readable,
contained, and preserve the current 960x576 world. Mobile staged object/input
evidence retains its RFG-003 role. The full unit and three-project browser
inventories were omitted because focused evidence showed no broader coupling
and Batch 33 remains the full-journey visual gate.

**Deployment:** Skipped. Batch 27 is incomplete visual-system milestone work
behind a default-false server capability. No production environment, flag,
server, client deployment, or capability exposure changed.

**Deviations:** No product-scope deviation. The image-generation workflow was
reviewed, but exact reusable chrome and icon grids are better served by original
deterministic project geometry than model-generated pixels. Initial synthetic
gameplay evidence advertised `newShell` while directly staging `GameScene`,
leaving a second shell scene visible behind gameplay/Results. The fixture was
narrowed to its owning capability boundary, the overlap disappeared, and all
final browser evidence passed. This was a test-staging defect, not a runtime
route defect. No fighter, weapon, pickup, biome, or combat-effect art was made.

**Known issues:** No new bug-ledger entry was required. RFG-001 and RFG-002
remain closed historical proofs. RFG-003 remains gate-dispositioned: staged
Firefox/WebKit object/input and direct-renderer pixels remain the non-Chromium
evidence model, while Chromium is the live/compositor and mobile-sized visual
reference. Batch 28 owns Mighty Man, Bruce, and Frost Wizard production art;
the modern UI atlas does not authorize Batch 29 or later work.

### Batch 28 — 2026-07-16 — Fighter art I

**Shipped:** Added three original AI-assisted production references plus one
deterministic project cleanup source for Mighty Man, Bruce, and Frost Wizard.
The source emits complete registered 64px directional idle, move, attack,
ability, and damage grids plus the fighters' exact live death-variant cycles.
The unchanged Batch 26 tool packs 288 frames into one deterministic 2048x1024
RGBA8888 `fighter-art-i.core` atlas with runtime-safe import JSON and separate
complete provenance. Boot validates/registers the named frames. Literal server-
owned `modernArt` selects the bodies in gameplay, while snapshot edges select
authored ability, damage, death, and respawn presentation without changing
authority. Mighty Man keeps his rifle/bone/amber/cyan identity, Bruce stays a
stocky ember-accented gunless undead, and Frost Wizard keeps the slim hood/wrap/
wand cyan/indigo identity. Incompatible carried-object states and every false,
absent, old-server, missing-atlas, or other-roster path stay on complete legacy
fallbacks.

**Verification:** Selected the visual plus isolated client-rendering tier
because executable changes are confined to deterministic art tooling, Boot
loading, and capability-owned player presentation; no shared/server/wire/
persistence, input, recovery authority, capability default, production, or
mechanics boundary changed. The focused asset suite passed all existing
validators plus byte-identical source/runtime/provenance rebuild, exact 288-
frame metadata, grid, registration, dominant-mass, negative-space, palette,
layer, and identity checks. Focused Vitest passed six import, frame-range,
death-cycle, direction, held-object fallback, and full/reduced tests.
`corepack pnpm typecheck`, `corepack pnpm lint`, affected client build, full
production build, repository formatting, and `git diff --check` passed; Vite's
established chunk advisory remains. Targeted desktop Chromium and mobile-
landscape evidence passed capability-on directional/state, ability, damage,
death/respawn, fallback/restoration, current 960x576 world, HUD/minimap,
Results/rematch, and recovery checks plus capability-off/old-server fallback.
The source sheets, packed atlas, 1280x720 direct-renderer frame, 844x390
Chromium frame, and gameplay-scale silhouettes were inspected. Full unit and
three-project browser inventories were omitted because the isolated evidence
showed no broader coupling; Batch 33 and Batch 39 retain their full-journey and
release-gate matrices.

**Deployment:** Skipped. Batch 28 is incomplete visual-system milestone work
behind a default-false server capability. No production environment, flag,
server/client deployment, capability exposure, or legacy asset changed.

**Deviations:** No product-scope deviation. The first pnpm test invocation used
an invalid focused forwarding form and was rerun with the repository Vitest
binary. The first Playwright invocation forwarded a literal separator and found
no tests; the corrected command passed. Managed sandbox node-module reads
required approved repository-local execution. Mobile-landscape compositor PNGs
retain RFG-003's black-frame limitation, so passing object/state assertions and
non-black direct-renderer pixels remain the trustworthy evidence; desktop
Chromium supplied the live and mobile-sized compositor references.

**Known issues:** No new bug-ledger entry was required. RFG-001 and RFG-002
remain closed historical proofs. RFG-003 remains gate-dispositioned and did not
change. Batch 29 owns Bubba, Jack, and Rook, including Jack axe/no-axe and Rook
synchronized layers. Batch 33 owns coherent Boot-through-Results cutover and
verified legacy retirement.

### Batch 29 — 2026-07-16 — Fighter art II

**Shipped:** Added three original AI-assisted production references plus one
deterministic project cleanup source for Bubba, Jack, and Rook. Five canonical
64px sheets provide complete registered four-direction idle, move, attack,
ability, and damage states plus exact live death cycles: 88 Bubba, 88 Jack
axe-absent, 76 Jack axe-present, 76 Rook body, and 76 Rook helmet frames. The
unchanged Batch 26 packer emits a deterministic 404-frame 2048x2048 RGBA8888
`fighter-art-ii.core` atlas, runtime-safe import JSON, and separate complete
provenance. Boot validates and registers it independently from Fighter Art I.
Literal server-owned `modernArt` selects the bodies from existing snapshots;
Jack's cooldown selects a complete axe body and Rook's helmet animates in
lockstep with his rifle body. Bubba stays the planted steel-blue no-gun tank,
Jack stays the wiry rust-red axe undead, and Rook stays the compact green-helmet
rifleman with paired teal dash chevrons. All incompatible, absent, false,
old-server, missing-atlas, or other-roster paths retain complete legacy art.

**Verification:** Selected the visual plus isolated client-rendering tier
because executable changes are confined to deterministic production art, Boot
loading, snapshot-owned presentation selection, and focused browser
instrumentation. No shared/server/wire/persistence, gameplay, collision, input,
camera, recovery authority, capability default, production, or deployment
boundary changed. The focused asset suite passed deterministic source/runtime/
provenance rebuild, exact 404-frame metadata, grid, registration, dominant-mass,
negative-space, identity-palette, Jack axe truth, and Rook layer synchronization
checks. Focused Vitest passed seven import, frame/death range, state/direction,
held-object fallback, and full/reduced tests. Typecheck, lint, affected client
build, full production build, repository formatting, and `git diff --check`
passed; Vite's established chunk advisory remains. Targeted desktop Chromium
and mobile-landscape evidence passed capability-on state/direction, ability,
damage, death/respawn, Jack axe swap, Rook layer lockstep, Rook held-object
fallback/restoration, and capability-off/old-server fallback plus retained
small-world, HUD/minimap, Results/rematch, and recovery cases. The five source
sheets, packed atlas, 1280x720 desktop renderer, 844x390 Chromium frame, and
gameplay-scale silhouettes were inspected. Full unit and three-project browser
inventories were omitted because focused evidence showed no broader coupling;
Batch 33 and Batch 39 retain the full-journey and release-gate matrices.

**Deployment:** Skipped. Batch 29 is incomplete visual-system milestone work
behind a default-false server capability. No production environment, server or
client deployment, capability exposure, or legacy asset changed.

**Deviations:** No product-scope deviation. Initial focused validators correctly
found a clipped Bubba attack margin and then exposed over-specified Jack/Rook
test geometry; the source pose was tightened and the checks were rewritten to
assert direct per-frame axe presence/absence and authored helmet registration.
The corrected suite passed. The Batch 26 atlas height was raised from the
initial 1024 estimate to 2048 because the exact 404-frame grid cannot fit the
smaller declared shelf; byte ceilings and loading lifecycle stayed unchanged.
Managed sandbox node-module reads required approved repository-local execution.
The pnpm Playwright wrapper forwarded a literal separator, so final targeted
evidence used the installed Playwright shim. Mobile staged object/input and
direct-renderer evidence retains RFG-003's role; desktop Chromium supplied the
live/compositor and resized mobile-width visual reference.

**Known issues:** No new bug-ledger entry was required. RFG-001 and RFG-002
remain closed historical proofs. RFG-003 remains gate-dispositioned and
unchanged. Batch 30 owns weapons, pickups, ammo/container art, and rarity auras;
Batch 33 owns coherent Boot-through-Results cutover and verified legacy
retirement.

### Batch 30 — 2026-07-16 — Weapons and pickups

**Shipped:** Added one original AI-assisted production reference plus
deterministic project geometry for rifle, pistol, shotgun, SMG, sniper rifle,
launcher, gun ammo, grenade, bandage, armor, overcharge, supply/container, and
the six locked rarity shapes. Eight canonical 64px sheets provide 158 exact
frames. The unchanged Batch 26 packer emits one deterministic 1024x1024
RGBA8888 `weapon-pickup-art.core` atlas with runtime-safe import JSON and
separate complete provenance. Boot validates/registers the grid independently
from both fighter atlases. Literal server-owned `modernArt` selects current live
rifle/pistol/shotgun held/ground/HUD/ammo and sustain-pickup art while preserving
legacy bat/punch and incompatible/missing/capability-off paths. SMG, sniper,
launcher, rarity, and container frames are registered but mechanically dormant.

**Verification:** Selected the visual plus isolated client-rendering tier
because executable changes are confined to deterministic production art, Boot
loading, capability-owned current weapon/pickup presentation, and focused
browser instrumentation. No shared/server/wire/persistence, gameplay,
collision, input, camera, recovery authority, capability default, production,
or deployment boundary changed. The complete 20-test asset suite passed byte-
identical source/runtime/provenance rebuild, exact 158-frame metadata, grid,
registration, silhouette mass, presentation coverage, pickup identity, rarity
shape, runtime-safety, and lineage checks. The configured Vitest matrix passed
all 137 files and 1,585 tests, including six new import, frame, dormancy,
fallback, pickup, rarity, and full/reduced contract tests. `corepack pnpm
typecheck`, `corepack pnpm lint`, affected client build, full production build,
repository formatting, and `git diff --check` passed; Vite's established chunk
advisory remains. Targeted desktop Chromium and mobile-landscape evidence passed
capability-on live pistol/shotgun, sustain-pickup identities, bat fallback,
future-art dormancy, and capability-off/old-server fallback. Retained Batch
29/current small-world, HUD/minimap, Results/rematch, death/respawn, and recovery
checks remained green in the full unit and established browser evidence. All
source sheets, the packed atlas, 1280x720 compositor, 844x390 Chromium frame,
and direct-renderer/gameplay-scale output were inspected. The complete three-
project browser inventory was omitted because no navigation, input, recovery,
capability foundation, shared, server, or wire boundary changed.

**Deployment:** Skipped. Batch 30 is incomplete visual-system milestone work
behind a default-false server capability. No production environment, server or
client deployment, capability exposure, or legacy asset changed.

**Deviations:** No product-scope deviation. The pnpm Playwright wrapper
forwarded a literal separator and found no tests; the corrected installed shim
passed. Managed sandbox node-module reads required approved repository-local
execution. The targeted Vitest forwarding form expanded to the configured full
matrix, which passed and provided stronger lifecycle coverage. Mobile-
landscape compositor PNGs retain RFG-003's black-frame limitation, so passing
object/state assertions and direct-renderer sampling remain staged evidence;
desktop Chromium supplied both live and resized mobile-width visual references.

**Known issues:** No new bug-ledger entry was required. RFG-001 and RFG-002
remain closed historical proofs. RFG-003 remains gate-dispositioned and
unchanged. Batch 31 owns biome terrain/cover/prop production; Batch 32 owns
combat feedback; Batch 33 owns coherent Boot-through-Results cutover and
verified legacy retirement.

### Batch 31 — 2026-07-16 — Biome environment kit

**Shipped:** Added one original AI-assisted environment reference plus
deterministic project geometry for wasteland, overgrown, industrial, and
irradiated. Four canonical five-column 64px sheets provide 80 exact frames:
three seam-safe ground variants, horizontal/vertical/corner transitions,
intact/damaged full walls, low cover, two props, landmarks, three southeast
shadows, and navigation anchors per family. The unchanged Batch 26 packer emits
one separate deterministic 1024x512 RGBA8888 `biome-environment-art.core`
atlas, runtime-safe import JSON, and complete non-runtime provenance. Boot
validates/registers the grid. The `modernArt`-owned verification preview is the
only presentation path; live maps remain completely legacy until Batch 33.

**Verification:** Selected the camera/world/arena/visual tier augmented with
isolated client-rendering checks because executable changes are confined to
deterministic production art, Boot loading, a dormant runtime contract, and
focused browser instrumentation. The 25-test asset suite passed byte-identical
source/runtime/provenance rebuild, exact 80-frame metadata, seam edges,
transition compatibility, registration, collision-class mass, intact/damaged
pairing, prop footprint, landmark negative space, shadow direction, family
palette, grayscale value, runtime safety, and lineage checks. Five focused
Vitest contract tests passed exact import, frame roles, transition order,
dormancy, fallback, and full/reduced rules. Typecheck, lint, affected client
build, full production build, repository formatting, and `git diff --check`
passed. Targeted desktop Chromium and mobile-landscape evidence passed four
cases with one deliberate inverse-project skip: capability-on preview, live-map
dormancy, collision-grid stability, legacy chunk-tile use, capability-off/
old-server behavior, current small-world HUD/minimap, Results/rematch/recovery
restoration, and direct-renderer sampling. Inspected full, 844x390 mobile-width,
grayscale, seam-tiled, and gameplay-scale outputs remain readable. Broader unit
and three-project browser suites were omitted because no shared/server/wire,
map/collision/destruction lifecycle, navigation/input, or capability foundation
changed.

**Deployment:** Skipped. Batch 31 is incomplete visual-system milestone work
behind default-false capabilities. No production environment, server/client
deployment, capability exposure, or legacy asset changed.

**Deviations:** No product-scope deviation. The first browser probe inspected
only top-level scene children and missed legacy tiles nested in Batch 21 chunk
containers; the corrected recursive probe passed. The local `pnpm exec vitest`
shim failed resolution and the installed repository executable passed under the
required managed permission. Mobile compositor evidence remains subject to
RFG-003, so Chromium supplies live/mobile-sized pixels and staged mobile object
plus direct-renderer evidence remains paired with it.

**Known issues:** No new bug-ledger entry was required. RFG-001 and RFG-002
remain closed historical proofs. RFG-003 remains gate-dispositioned and
unchanged. Batch 32 owns modern combat feedback; Batch 33 owns coherent
Boot-through-Results visual cutover and verified legacy retirement.

## Batch 22 input prompt (historical)

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md and docs/REFORGED_CAPABILITIES.md before
implementation. Batch 21 — Dynamic world rendering is complete. Implement
Batch 22 — Responsive combat HUD exactly as specified and do not begin Batch
23 — Minimap foundation.

Rebuild health, armor, stamina, ammo, grenades, ability, score/mode status,
timer, kill feed, contracts, countdown/briefings, death/connection/event/combat
callouts, live-match menu, and touch actions as prioritized screen-space
overlays inside Batch 18's logical safe-area contract. Preserve each existing
authoritative snapshot/event source, mode-specific unit and visibility rule,
input action, menu confirmation, and challenge/standard journey. Use one
responsive HUD layout/model shared by desktop and mobile logical coordinates;
safe-area movement may not widen world visibility or derive gameplay state from
screen coordinates. Keep pointer, keyboard, standard gamepad, and touch paths
equivalent and retain readable priority when simultaneous messages compete.

Preserve Batch 21's map-derived world bounds, 8x8 chunks, live coordinate-
derived culling, chunk-local destruction-safe decals, viewport-derived lighting
and storms/X-ray resources, transformed shockwaves, pooled effects, and frozen
quality budgets. Preserve Batch 20's sole camera controller and composed follow/
kick/shake/zoom/roll, Batch 19's sole coordinate transform, and Batch 18's fixed
1280x720 logical 16:9 capability-owned gameplay view with equal desktop/mobile
visibility. Current maps remain 960x576 at `(0, 0)` with unchanged shared/server
physics, authoritative 20Hz simulation, gameplay rules, menus/challenges,
Results/rematches, compatibility scenes/messages, and production configuration.
Capability-off, old-server, and old-client paths must retain the exact
established 960x720 gameplay/Lobby behavior through Batch 54.

Do not begin Batch 23 minimap work: no minimap, tactical map, landmark/map
projection, larger arena authoring, camera change, rendering-resource redesign,
movement or balance tuning, modern art, or Battle Royale work. Do not change map
content/dimensions/origin, collision authority, physics, simulation, wire
contracts, capability defaults, or production configuration. Never enable a
capability by default or deploy without explicit authorization.

Batch 21 is complete and pushed on main as `feat(play): add dynamic world
rendering`. Actual map dimensions now feed the Batch 19/20 boundaries; current
maps produce six clipped/visible chunks and six seam-safe decal resources.
Authoritative destruction rebuilds affected masks/resources. Lighting and
shockwaves project through the coordinate service, storms/X-ray consume the
derived viewport/world extent, and pooled cosmetics use hysteretic full/reduced
budgets. Focused deterministic tests (36), typecheck, lint, affected/full
builds, enabled and default-false desktop Chromium/mobile-landscape object,
interaction, Results/recovery, performance-recorder, and inspected Chromium
visual evidence are green. The complete unit and three-project browser
inventories were omitted under the documented client-only world/performance/
visual tier. All capabilities remain default false, wire/server behavior is
intact, production has not been deployed, and HEAD matched origin/main with a
clean worktree at handoff.

Choose and document the risk tier for Batch 22. Add deterministic coverage for
safe-area prioritization, every combat resource and mode status, kill feed and
simultaneous callout lanes, touch actions, match menu, current small-world
behavior, equal desktop/mobile logical visibility, capability-off fallback,
Results/rematch, and recovery restoration. Run focused tests, `corepack pnpm
typecheck`, `corepack pnpm lint`, affected and full production builds, and
targeted desktop Chromium/mobile-landscape object, interaction, and visual
evidence. Escalate to full unit or three-project browser suites if shared,
server, wire, recovery, input foundations, or broader scene behavior changes.
Update roadmap acceptance evidence, architecture/baseline/capability docs when
contracts change, update the bug ledger only with proven evidence, and update
the Session Log. Run the complete end-of-batch ritual, commit and push directly
to main, and skip deployment unless explicitly authorized.

Carry-over warnings: RFG-001 and RFG-002 are fixed but Batch 24 owns their
regression gate. RFG-003 means headless Firefox/WebKit cannot use the live local
WebRTC practice path and staged gameplay screenshots are black; staged frame
numbers are not hardware-comparable. Use mobile-sized Chromium for visual
evidence while retaining staged WebKit object/input assertions. The Batch 21
recorder observed host-limited live Chromium at 3.658 FPS / 273.375ms mean at
full quality and staged mobile at 30.202 FPS / 33.110ms mean at reduced quality;
neither is a hardware gate. The Batch 2 live-loop sample recorded a 254.279ms
host scheduling drift reset and
15.932 effective Hz while simulation processing remained far below 50ms. Use
Corepack pnpm 10.33.0 if the local shim mismatches. Current maps remain smaller
than the 1280x720 logical viewport and anchor at origin. Batch 19 coordinates,
Batch 20 camera composition, and Batch 21 rendering are the only transform,
camera, and world-resource boundaries. Batch 22 owns responsive HUD migration;
Batch 23 owns the minimap.
```

## Batch 23 input prompt (historical)

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md and docs/REFORGED_CAPABILITIES.md before
implementation. Batch 22 — Responsive combat HUD is complete. Implement Batch
23 — Minimap foundation exactly as specified and do not begin Batch 24 — Camera
regression gate.

Project authoritative map bounds, solids, authored landmarks where available,
live objectives, the local player, and allies where applicable into a readable
safe-area minimap for capability-owned gameplay. The minimap must derive from
map/snapshot truth independently of camera culling and may not author gameplay,
infer teams, objectives, or visibility from screen coordinates, or use camera
resource state as map authority. Preserve every current mode's objective and
ally visibility rule, N-player behavior, map origin/dimensions, and the complete
challenge/standard journey. Keep pointer, keyboard, standard gamepad, and touch
paths equivalent; Batch 23 owns the minimap only, not a tactical map.

Preserve Batch 22's single responsive HUD model, exact safe-area priorities,
authoritative resource/mode/kill-feed/contract/callout sources, touch actions,
and confirmed live-match menu. Preserve Batch 21's map-derived world bounds,
8x8 chunks, coordinate-derived culling, chunk-local destruction-safe decals,
viewport-derived lighting/storm/X-ray resources, transformed shockwaves,
pooled effects, and frozen quality budgets. Preserve Batch 20's sole camera
controller and composed follow/kick/shake/zoom/roll, Batch 19's sole coordinate
transform, and Batch 18's fixed 1280x720 logical 16:9 capability-owned gameplay
view with equal desktop/mobile visibility. Current maps remain 960x576 at
`(0, 0)` with unchanged shared/server physics, authoritative 20Hz simulation,
gameplay rules, menus/challenges, Results/rematches, compatibility scenes/
messages, and production configuration. Capability-off, old-server, and old-
client paths must retain the exact established 960x720 gameplay/Lobby behavior
through Batch 54.

Do not begin Batch 24 gate work: no camera-controller changes, regression-gate
sign-off, larger arena authoring, rendering-resource redesign, movement or
balance tuning, modern art, Battle Royale work, or tactical map. Do not change
map content/dimensions/origin, collision authority, physics, simulation, wire
contracts, capability defaults, or production configuration. Never enable a
capability by default or deploy without explicit authorization.

Batch 22 is complete and pushed on main as `feat(play): add responsive combat
HUD`. `responsiveCombatHudLayout()` now places every combat resource/status,
kill feed, contract, briefing, death/connection/event/combat/contract callout,
touch action, and confirmed match menu inside the logical safe area while the
exact legacy 960x720 geometry remains frozen. Focused deterministic coverage
(78 tests across 19 files), typecheck, lint, affected/full builds, enabled and
default-false desktop Chromium/mobile-landscape object/interaction,
Results/rematch/recovery, equal-visibility/current-small-world, and inspected
desktop plus mobile-sized Chromium visual evidence are green. The complete unit
and three-project browser inventories were omitted under the documented
client-only world/visual plus focused input/menu tier. All capabilities remain
default false, wire/server behavior is intact, production has not been
deployed, and HEAD matched origin/main with a clean worktree at handoff.

Choose and document the risk tier for Batch 23. Add deterministic coverage for
projection from actual map bounds, solids and destruction, every supported
objective, local/allied markers, N-player and Crew visibility, independence
from camera culling/transients, safe-area HUD coexistence, current small-world
behavior, equal desktop/mobile logical visibility, capability-off fallback,
Results/rematch, and recovery restoration. Run focused tests, `corepack pnpm
typecheck`, `corepack pnpm lint`, affected and full production builds, and
targeted desktop Chromium/mobile-landscape object, interaction, and visual
evidence. Escalate to full unit or three-project browser suites if shared,
server, wire, recovery, input foundations, or broader scene behavior changes.
Update roadmap acceptance evidence, architecture/baseline/capability docs when
contracts change, update the bug ledger only with proven evidence, and update
the Session Log. Run the complete end-of-batch ritual, commit and push directly
to main, and skip deployment unless explicitly authorized.

Carry-over warnings: RFG-001 and RFG-002 are fixed but Batch 24 owns their
regression gate. RFG-003 means headless Firefox/WebKit cannot use the live local
WebRTC practice path and staged gameplay screenshots are black; staged frame
numbers are not hardware-comparable. Use mobile-sized Chromium for visual
evidence while retaining staged WebKit object/input assertions. The Batch 21
recorder observed host-limited live Chromium at 3.658 FPS / 273.375ms mean at
full quality and staged mobile at 30.202 FPS / 33.110ms mean at reduced quality;
neither is a hardware gate. The Batch 2 live-loop sample recorded a 254.279ms
host scheduling drift reset and 15.932 effective Hz while simulation processing
remained far below 50ms. Use Corepack pnpm 10.33.0 if the local shim mismatches.
Current maps remain smaller than the 1280x720 logical viewport and anchor at
origin. Batch 19 coordinates, Batch 20 camera composition, Batch 21 rendering,
and Batch 22 responsive HUD are the only transform, camera, world-resource, and
combat-overlay boundaries. Batch 23 owns the minimap; Batch 24 owns the camera
regression gate.
```

## Batch 24 input prompt (historical)

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md and docs/REFORGED_CAPABILITIES.md before
implementation. Batch 23 — Minimap foundation is complete. Implement Batch 24
— Camera regression gate exactly as specified and do not begin Batch 25 —
Style bible.

Run the complete scrolling-world/camera regression gate across Batch 18's
fixed 1280x720 logical gameplay surface and safe-area contract, Batch 19's sole
screen/world transform, Batch 20's sole composed camera controller, Batch 21's
dynamic world resources/quality tiers, Batch 22's responsive combat HUD, and
Batch 23's minimap. Verify exact local-player follow, respawn and spectator
targets, every world edge and corner, aim and touch while scrolled/zoomed/
rolled, screen-pinned effects and HUD, map/objective/player/ally minimap
accuracy independent of culling/transients, destruction, quality fallback,
Results/rematch/recovery restoration, and representative frame pacing. Retain
RFG-001 and RFG-002's repaired values as mandatory regression proofs. Resolve
or explicitly gate-disposition RFG-003 so non-Chromium object/input and visual
evidence are trustworthy enough for this verification milestone.

Preserve current map/snapshot authority, N-player and Crew visibility, all
eight modes, every challenge/standard journey, pointer, keyboard, standard
gamepad, and touch behavior. Current maps remain 960x576 at `(0, 0)` with
unchanged collision, shared/server physics, authoritative 20Hz simulation,
gameplay rules, wire contracts, menus, Results/rematches, and production
configuration. Capability-off, old-server, and old-client paths must retain the
exact established 960x720 gameplay/Lobby behavior through Batch 54. All
capabilities remain strict server-owned opt-ins and default false.

Do not begin Batch 25 or later work: no style-bible/reference generation,
modern art, asset pipeline, larger arena authoring, tactical map, movement or
balance tuning, Battle Royale work, capability exposure, or deployment. Do not
change camera/minimap/rendering/HUD behavior merely to make the gate easier;
fix only proven tightly coupled regressions, record evidence, and insert or log
larger blockers under the roadmap bug rules. Never enable a capability by
default or deploy without explicit authorization.

Batch 23 is complete and pushed on main as `feat(play): add minimap foundation`.
The capability-owned path now projects actual map bounds, the complete live
collision solids, surviving authored decoration landmarks, KOTH current/next
zones, Kill Confirmed tags, Core Run, Bounty Hunt, the local fighter, and exact
server-authored Crew allies into one non-interactive safe-area minimap. It is
independent of camera/chunk/resource authority; generic rivals remain hidden,
and authoritative destruction refreshes solids/landmarks. The exact legacy
path creates no minimap. Focused deterministic coverage (29 tests across five
files), typecheck, lint, affected/full builds, six enabled desktop Chromium/
mobile-landscape camera/minimap/Results/rematch/recovery cases, two exact
default-false fallback cases, and inspected 1280x720 plus 844x390 Chromium
frames are green. The complete unit and three-project browser inventories were
omitted under the documented isolated client camera/world/visual tier because
Batch 24 is the explicit full gate. Production has not been deployed.

Choose and document the Batch 24 verification-gate tier. Run the complete unit
and integration inventory, `corepack pnpm typecheck`, `corepack pnpm lint`,
affected and full production builds, the complete default-false three-project
Playwright inventory, the complete enabled camera/world/HUD/minimap journey
matrix across desktop Chromium, desktop Firefox, and mobile landscape, the
server/client recorders and representative performance probes, and inspected
desktop plus mobile-sized Chromium visual evidence. Exercise real/staged paths
according to the resolved RFG-003 disposition and escalate every focused
failure narrowly before rerunning the gate. Update roadmap acceptance, status,
bug ledger, architecture/baseline/capability docs, and Session Log. Run the
complete end-of-batch ritual, commit and push directly to main, verify a clean
worktree with HEAD exactly matching origin/main, and skip deployment unless
explicitly authorized.

Carry-over warnings: RFG-001 and RFG-002 are fixed but this gate owns their
historical sustained-scroll `(320, 144)` and sustained-zoom `0.9` proofs.
RFG-003 means headless Firefox/WebKit cannot use the live local WebRTC practice
path and staged gameplay screenshots are black; staged frame numbers are not
hardware-comparable. Mobile-sized Chromium remains the trusted visual source
until the gate records a stronger disposition. The Batch 21 recorder observed
host-limited live Chromium at 3.658 FPS / 273.375ms mean at full quality and
staged mobile at 30.202 FPS / 33.110ms mean at reduced quality; neither is a
hardware threshold. The Batch 2 live-loop sample recorded a 254.279ms host
scheduling drift reset and 15.932 effective Hz while simulation processing
remained far below 50ms. Use Corepack pnpm 10.33.0 if the local shim mismatches.
Current maps remain smaller than the logical viewport and anchor at origin.
Batch 24 is a verification gate, not authorization for larger maps or visual
cutover. When Batch 24 completes, stop the user-authorized chain and request
review; do not create Batch 25.
```

## Batch 27 input prompt (historical)

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md, docs/REFORGED_CAPABILITIES.md,
docs/REFORGED_STYLE_BIBLE.md, docs/REFORGED_ASSET_PIPELINE.md, and
docs/reforged/style-bible/PROVENANCE.md before implementation. Batch 26 — Asset
pipeline is complete. Implement Batch 27 — Modern UI assets exactly as
specified and do not begin Batch 28 — Fighter art I.

Produce the coherent modern tab, card, button, icon, typography, party, queue,
tactical-map-language, HUD-frame, and Results chrome owned by Batch 27 using
the approved UI/rarity golden and the Batch 26 source/manifest/provenance
contract. Keep Play/Fighters/Challenges/Records/Settings and the locked
no-economy language exact. Preserve strong teal focus, amber pressed/primary
actions, visible disabled states, red-only danger/leave emphasis, mobile-safe
touch targets, readable contrast, and pointer/keyboard/gamepad/touch parity.
Use the smallest production UI source/atlas set needed to complete this batch;
do not generate fighter, weapon, pickup, biome, or combat-effect art.

Preserve the complete Batch 25 style contract: all six established fighter
identities and silhouettes, four biome families, five-tab/no-economy UI
language, six-gun and six-rarity shape/color hierarchy, collision/objective
readability, lighting, line-weight, motion, and full/reduced cosmetic guidance.
Preserve Batch 26's canonical PNG, naming, exact frame-grid, deterministic
packing, mip-safe extrusion, byte-limit, runtime-metadata, provenance, and
third-party redistribution rules. Batch 25 goldens remain documentation
references and may not be copied into runtime output.
Preserve the completed Batch 18–24 viewport, coordinate, camera, dynamic
rendering, quality, responsive HUD, minimap, fallback, and regression-gate
contracts. Current maps remain 960x576 at `(0, 0)` with unchanged collision,
shared/server physics, authoritative 20Hz simulation, gameplay rules, wire
contracts, menus, Results/rematches, and production configuration. Capability-
off, old-server, and old-client paths retain the exact established 960x720
gameplay/Lobby behavior through Batch 54. All capabilities remain strict
server-owned opt-ins and default false.

Do not begin Batch 28 or later work: no Mighty Man/Bruce/Frost Wizard or other
fighter production art, fighter animation set, live fighter/weapon/environment
replacement, six-gun production set, biome kit, combat-feedback cutover,
larger arena authoring, tactical-map gameplay/input, movement or balance
tuning, Battle Royale gameplay, capability exposure, or deployment. Do not
change gameplay/camera/minimap/rendering authority or HUD values/visibility to
accommodate art. Never enable a capability by default or deploy without
explicit authorization.

Batch 26 is complete and pushed on main as `chore(assets): establish Reforged
asset pipeline`. `docs/REFORGED_ASSET_PIPELINE.md` and
`art/reforged/{sources,references,provenance}` now own production cleanup,
naming, source/reference separation, exact dimensions/frame grids, mip-safe
packing, deterministic RGBA8888 output, runtime-safe metadata, compression
ceilings, and complete non-runtime provenance. The dependency-free Node tool
and synthetic temp-only fixture passed 8 focused validators; typecheck, lint,
affected client build, full production build, formatting, diff, and provenance
review are green. No production art, generated runtime atlas, loader/runtime
source, capability default, production configuration, or deployment changed.
RFG-001/RFG-002 remain closed historical proofs; RFG-003 remains gate-
dispositioned and unchanged.

Choose and document the Batch 27 visual/client-UI verification tier. Run the
focused asset validators for every manifest and generated output, add focused
deterministic/import tests for atlas metadata and UI-state mapping, and verify
focus, contrast, touch targets, safe-area containment, full/reduced treatment,
current small-world behavior, capability-off/old-server fallback,
Results/rematch, and recovery restoration. Run repository formatting,
`git diff --check`, intended-diff/provenance review, `corepack pnpm typecheck`,
`corepack pnpm lint`, affected and full production builds, and targeted desktop
Chromium/mobile-landscape interaction and visual evidence. Escalate to full
unit or three-project browser suites if shared/server/wire, input/focus,
recovery, capability foundations, or broader scene behavior changes. Update
roadmap acceptance/status, architecture/pipeline/provenance documentation, bug
ledger only with proven evidence, and Session Log. Run the complete end-of-
batch ritual, commit and push directly to main, verify a clean worktree with
HEAD exactly matching origin/main, and skip deployment.

Carry-over warnings: use Corepack pnpm 10.33.0 if the local shim mismatches.
Do not overwrite, reinterpret, or atlas the Batch 25 goldens. Keep source
archives and full licensing/generation lineage out of runtime redistribution;
runtime output receives only generated atlas PNG and import metadata. Preserve
the retained legacy art/fallback until a verified gated replacement owns every
live use; Batch 33 owns the full-journey visual cutover. RFG-003 still requires
staged Firefox/WebKit object/input evidence and direct renderer pixels where
applicable, with Chromium as the live/compositor and mobile-sized visual
reference. Batch 27 owns modern UI assets; Batch 28 owns fighter art I.
```

## Batch 28 input prompt (historical)

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md, docs/REFORGED_CAPABILITIES.md,
docs/REFORGED_STYLE_BIBLE.md, docs/REFORGED_ASSET_PIPELINE.md, and
docs/reforged/style-bible/PROVENANCE.md before implementation. Batch 27 — Modern
UI assets is complete. Implement Batch 28 — Fighter art I exactly as specified
and do not begin Batch 29 — Fighter art II.

Produce coherent production art for Mighty Man, Bruce, and Frost Wizard across
the complete directional idle, movement, attack, ability, damage, and death
state sets required by their existing live identities. Preserve Mighty Man's
balanced human rifleman silhouette, amber scarf/bone face guard and cyan x-ray
cue; Bruce's compact stocky undead no-gun silhouette and ember fire-breath cue;
and Frost Wizard's slim human hood/wrap/wand no-gun silhouette and cyan/indigo
frost cue. Every state must preserve registration, aim/facing, carried-object or
no-gun truth, readable negative space, one dominant body mass, and gameplay-scale
recognition at 48–72 CSS pixels. Do not alter mechanics to fit animation.

Use the Batch 26 source/manifest/provenance contract and the smallest production
source/atlas sets that preserve exact frame grids and loading lifecycle. Keep
canonical PNG, lower-kebab names, exact declared dimensions/counts/columns,
deterministic sorting, no trim/rotation, mip-safe extrusion/padding, byte limits,
runtime-safe metadata, and complete non-runtime lineage. Batch 25 goldens remain
documentation references and may not be copied into runtime output. Record all
original/AI-assisted production lineage and inspect source plus packed output at
full, mobile-width, and gameplay scale before acceptance.

Preserve Batch 27's complete modern UI contract: the 48-frame `modern-ui.core`
atlas, Play/Fighters/Challenges/Records/Settings and no-economy language, teal
focus, amber primary/pressed, visible disabled, red-only danger, 48px modern
targets, party/queue, tactical-minimap language, HUD/Results chrome, typography,
full/reduced essential treatment, and procedural compatibility fallback. Do not
place fighter art into the UI atlas or change UI state mapping to accommodate it.

Preserve the complete Batch 18–24 viewport, coordinate, camera, dynamic
rendering, quality, responsive HUD, minimap, fallback, and regression-gate
contracts. Current maps remain 960x576 at `(0, 0)` with unchanged collision,
shared/server physics, authoritative 20Hz simulation, gameplay rules, wire
contracts, menus, Results/rematches, and production configuration. Capability-
off, old-server, and old-client paths retain the exact established 960x720
gameplay/Lobby behavior through Batch 54. All capabilities remain strict
server-owned opt-ins and default false.

Do not begin Batch 29 or later work: no Bubba, Jack, Rook, weapon/pickup set,
biome kit, combat-feedback cutover, full-journey visual cutover, larger arena,
tactical-map gameplay/input, movement or balance tuning, Battle Royale,
capability exposure, or deployment. Retain every legacy fighter asset/fallback
until a verified gated replacement owns each live use; Batch 33 still owns the
coherent Boot-through-Results cutover. Never enable a capability by default or
deploy without explicit authorization.

Batch 27 is complete and pushed on main as `feat(ui): add Reforged modern UI
assets`. One deterministic original geometry source emits two canonical sheets
with 32 chrome states and 16 icons; the Batch 26 tool packs a 48-frame 1024x256
RGBA8888 atlas plus runtime-safe import JSON and separate provenance. Ten asset
validators, three import/state/contrast tests, typecheck, lint, affected/full
builds, formatting, diff/provenance review, four modern desktop/mobile cases,
four capability-off/old-server cases, six modernArt-off fallback/recovery cases,
and inspected desktop/mobile-sized Chromium visuals are green. No shared/server/
wire/gameplay/capability-default/production/deployment behavior changed.

Choose and document the Batch 28 visual/client-rendering verification tier. Run
focused asset validators for every new manifest/output; add deterministic import,
frame-grid, registration/layer, state-selection, direction, fallback, and full/
reduced tests. Verify all required Mighty Man/Bruce/Frost Wizard states at full,
mobile, and gameplay scale, capability-on rendering, capability-off/old-server
fallback, current small-world behavior, HUD/minimap readability, Results/rematch,
death/respawn, and recovery restoration. Run repository formatting,
`git diff --check`, intended-diff/provenance review, `corepack pnpm typecheck`,
`corepack pnpm lint`, affected and full production builds, and targeted desktop
Chromium/mobile-landscape interaction and visual evidence. Escalate to full unit
or three-project browser suites if shared/server/wire, animation lifecycle,
recovery, capability foundations, or broader scene behavior changes. Update
roadmap acceptance/status, architecture/pipeline/provenance docs, bug ledger only
with proven evidence, and Session Log. Run the complete end-of-batch ritual,
commit and push directly to main, verify a clean worktree with HEAD exactly
matching origin/main, and skip deployment.

Carry-over warnings: use Corepack pnpm 10.33.0 if the local shim mismatches. Do
not overwrite, reinterpret, or atlas the Batch 25 goldens. Keep source archives
and full license/generation lineage out of runtime redistribution. Rook layers
and Jack axe/no-axe remain Batch 29 and must not be started. RFG-001/RFG-002
remain closed historical proofs. RFG-003 still requires staged Firefox/WebKit
object/input evidence and direct renderer pixels where applicable, with Chromium
as the live/compositor and mobile-sized visual reference. Batch 28 owns Mighty
Man, Bruce, and Frost Wizard production art; Batch 29 owns Bubba, Jack, and Rook.
```

## Batch 30 input prompt (historical)

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md, docs/REFORGED_CAPABILITIES.md,
docs/REFORGED_STYLE_BIBLE.md, docs/REFORGED_ASSET_PIPELINE.md, and
docs/reforged/style-bible/PROVENANCE.md before implementation. Batch 29 —
Fighter art II is complete. Implement Batch 30 — Weapons and pickups exactly as
specified and do not begin Batch 31 — Biome environment kit.

Produce coherent production art for the six-gun visual language: rifle, pistol,
shotgun, SMG, sniper rifle, and launcher. Preserve the locked silhouettes in
held/top-down, firing, ground-pickup, HUD/ammo, and container presentation:
rifle as the balanced middle-length baseline; pistol as the smallest compact
one-handed block; shotgun with a thick pump/front mass; SMG as a short box with
deep magazine; sniper as the longest narrow scoped shape; and launcher as the
broadest tube with the heaviest rear mass. The same base silhouette must remain
recognizable when dry, dropped, held, firing, or rarity-treated. Produce the
existing sustain pickup family—gun ammo, grenade, bandage, armor, and
overcharge—plus container/supply language without changing authoritative pickup
types, behavior, spawn timing, ammo, rarity, or inventory mechanics. Preserve
the existing bat/punch presentation and fallbacks; do not invent new melee
mechanics or silently treat them as members of the six-gun roster.

Implement the locked rarity language as production presentation only: Common
neutral/no aura, Uncommon one underline, Rare two orbit ticks, Epic four
faceted marks, Legendary three crown rays, and Mythical a narrow double-
chevron halo. Keep the compact badge/rim and shape code readable in grayscale;
never repaint the whole gun. Full quality may keep bounded facets, soft light,
and secondary motion, while reduced quality must retain the badge, rim, main
silhouette, timing, and pickup identity without bloom or extra particles. Do
not add rarity damage, weapon instances, Battle Royale inventory, containers,
or loot behavior; their later batches own mechanics and authority.

Use the Batch 26 source/manifest/provenance contract and the smallest production
source/atlas sets that preserve exact frame grids and loading lifecycle. Keep
canonical PNG, lower-kebab names, exact declared dimensions/counts/columns,
deterministic sorting, no trim/rotation, mip-safe extrusion/padding, byte limits,
runtime-safe metadata, and complete non-runtime lineage. Batch 25 goldens remain
documentation references and may not be copied into runtime output. Record all
original/AI-assisted production lineage and inspect source plus packed output at
full, mobile-width, and gameplay scale before acceptance.

Preserve Batch 29's complete `fighter-art-ii.core` contract: five canonical
sheets and 404 registered frames in one deterministic 2048x2048 atlas; Bubba,
Jack axe-present/axe-absent, and synchronized Rook body/helmet directional
idle/move/attack/ability/damage/death states; exact live death cycles; steel-
blue tank, rust-red axe, and green-helmet/teal-chevron identity cues; snapshot-
owned selection; full/reduced essential body/layer treatment; held-object
fallback; and literal server-owned `modernArt` gating. Preserve Batch 28's
separate 288-frame `fighter-art-i.core` contract unchanged. Do not rewrite,
merge, or place weapon/pickup pixels in either fighter atlas.

Preserve Batch 27's complete modern UI contract and the complete Batch 18–24
viewport, coordinate, camera, dynamic rendering, quality, responsive HUD,
minimap, fallback, and regression-gate contracts. Current maps remain 960x576
at `(0, 0)` with unchanged collision, shared/server physics, authoritative 20Hz
simulation, gameplay rules, wire contracts, menus, Results/rematches, and
production configuration. Capability-off, old-server, and old-client paths
retain the exact established 960x720 gameplay/Lobby behavior through Batch 54.
All capabilities remain strict server-owned opt-ins and default false.

Do not begin Batch 31 or later work: no biome terrain/cover/prop production set,
combat-feedback cutover, full-journey visual cutover, larger arena, tactical-map
gameplay/input, movement or balance tuning, Battle Royale mechanics, capability
exposure, or deployment. Do not add SMG/sniper/launcher mechanics merely because
their art exists. Retain every legacy weapon, pickup, fighter, and procedural
fallback until a verified gated replacement owns each live use; Batch 33 still
owns the coherent Boot-through-Results cutover. Never enable a capability by
default or deploy without explicit authorization.

Batch 29 is complete and pushed on main as `feat(art): add Reforged fighter art
II`. Three original AI-assisted references plus deterministic project cleanup
emit 88 Bubba, 88 Jack axe-absent, 76 Jack axe-present, 76 Rook body, and 76
Rook helmet frames. The Batch 26 tool packs a 404-frame 2048x2048 RGBA8888 atlas
plus runtime-safe import JSON and separate complete provenance. Focused
generation/asset/import/grid/registration/layer/state/direction/fallback/full-
reduced tests, typecheck, lint, affected/full builds, formatting, diff/
provenance review, targeted desktop Chromium/mobile-landscape state and visual
evidence, capability-off fallback, death/respawn/restoration, current small-
world HUD/minimap, Results/rematch, and recovery checks are green. No shared/
server/wire/mechanics/capability-default/production/deployment behavior changed.

Choose and document the Batch 30 visual/client-rendering verification tier. Run
focused asset validators for every new manifest/output; add deterministic
import, exact grid, registration, silhouette, held/firing/ground/HUD/ammo/
container, rarity-shape/grayscale, pickup identity, fallback, and full/reduced
tests. Verify all six gun identities, current live rifle/pistol/shotgun and
sustain-pickup presentation, future-art dormancy, capability-on rendering,
capability-off/old-server fallback, current small-world behavior, HUD/minimap
readability, Results/rematch, and recovery restoration at full, mobile-width,
and gameplay scale. Run repository formatting, `git diff --check`, intended-
diff/provenance review, `corepack pnpm typecheck`, `corepack pnpm lint`, affected
and full production builds, and targeted desktop Chromium/mobile-landscape
interaction and visual evidence. Escalate to full unit or three-project browser
suites if shared/server/wire, pickup/weapon lifecycle, recovery, capability
foundations, or broader scene behavior changes. Update roadmap acceptance/
status, architecture/pipeline/provenance docs, bug ledger only with proven
evidence, and Session Log. Run the complete end-of-batch ritual, commit and push
directly to main, verify a clean worktree with HEAD exactly matching origin/main,
and skip deployment.

Carry-over warnings: use Corepack pnpm 10.33.0 if the local shim mismatches. Do
not overwrite, reinterpret, or atlas the Batch 25 goldens. Keep source archives
and full license/generation lineage out of runtime redistribution. Preserve both
completed fighter atlases, Jack's complete axe bodies, and Rook's synchronized
layers. Keep future SMG/sniper/launcher and rarity presentation mechanically
dormant. RFG-001/RFG-002 remain closed historical proofs. RFG-003 still
requires staged Firefox/WebKit object/input evidence and direct renderer pixels
where applicable, with Chromium as the live/compositor and mobile-sized visual
reference. Batch 30 owns weapons and pickups; Batch 31 owns the biome kit.
```

## Next-session prompt

```text
Continue the Reforged build for Mighty Man's Revenge.

Read docs/REIMAGINING_ROADMAP.md and CLAUDE.md completely first. Read
docs/REFORGED_BASELINE.md, docs/REFORGED_CAPABILITIES.md,
docs/REFORGED_STYLE_BIBLE.md, docs/REFORGED_ASSET_PIPELINE.md, and
docs/reforged/style-bible/PROVENANCE.md before implementation. Batch 31 — Biome
environment kit is complete. Implement Batch 32 — Modern combat feedback
exactly as specified and do not begin Batch 33 — Full-journey visual cutover.

Produce the coherent modern combat-feedback set for every currently established
presentation family named by Batch 32: muzzle, scenery/player impact,
explosion, healing, armor, each fighter ability, rarity, zone, and elimination.
Preserve the style-bible reading order, event identity, hit point, direction,
radius/boundary, warning, timing, silhouette, and full/reduced contract. Full
quality may retain bounded secondary sparks, smoke, debris, facets, soft light,
and short trails. Reduced quality must retain the decisive event, confirmed
impact point, explosion radius cue, healing/armor identity, ability release,
rarity badge/shape, zone boundary, and elimination cue without bloom-dependent
readability or unbounded overdraw.

Keep feedback art pooled, bounded, deterministic to authoritative events, and
registered to the established rendering lifecycle. Presentation must consume
existing snapshot/event truth only; do not add damage, healing, armor, ability,
rarity, zone, elimination, projectile, hit-confirmation, collision, camera,
physics, input, or wire rules. Do not infer player hits from ray endpoints,
change explosion or hazard radii, add rarity mechanics, expose Battle Royale,
or let cosmetic quality affect gameplay. Retain every legacy effect and
procedural fallback until Batch 33 owns one coherent verified cutover.

Use the Batch 26 source/manifest/provenance contract and the smallest production
source/atlas sets that preserve exact grids and the established loading
lifecycle. Keep canonical PNG, lower-kebab names, exact declared dimensions,
counts, and columns, deterministic sorting, no trim/rotation, mip-safe
extrusion/padding, byte limits, runtime-safe metadata, and complete non-runtime
lineage. Batch 25 goldens remain documentation references and may not be copied
into runtime output. Record every original/AI-assisted production input and
inspect source plus packed output at full, mobile-width, grayscale, direct-
renderer, full/reduced, and gameplay scale before acceptance.

Preserve Batch 31's separate 80-frame 1024x512
`biome-environment-art.core` atlas, four exact 20-frame family grids, seam-safe
terrain/transitions, collision-class silhouettes, intact/damaged pairs, stable
footprints, southeast shadows, landmark negative space, navigation anchors,
full/reduced treatment, live-map dormancy, and literal server-owned `modernArt`
verification-preview gate. Preserve Batch 30's separate 158-frame weapon/pickup
atlas, Batch 29's 404-frame fighter II atlas, Batch 28's 288-frame fighter I
atlas, and Batch 27's 48-frame modern UI atlas unchanged. Do not merge combat-
feedback pixels into any completed atlas.

Preserve the complete Batch 18–24 viewport, coordinate, camera, dynamic
rendering, quality, responsive HUD, minimap, fallback, and regression-gate
contracts. Current maps remain 960x576 at `(0, 0)` with unchanged collision,
shared/server physics, authoritative 20Hz simulation, gameplay rules, wire
contracts, menus, Results/rematches, and production configuration.
Capability-off, old-server, and old-client paths retain the exact established
960x720 gameplay/Lobby behavior through Batch 54. All capabilities remain
strict server-owned opt-ins and default false.

Do not begin Batch 33 or later work: no coherent Boot-through-Results visual
cutover, legacy retirement, larger arena, tactical-map gameplay/input, movement
or balance tuning, Battle Royale mechanics, capability exposure, or deployment.
Do not add rarity damage, loot/container behavior, hazards, projectiles,
mechanics, or wire state merely because replacement feedback art exists. Batch
33 owns coherent cutover and Batch 34 owns larger-map authoring contracts.

Batch 31 is complete and pushed on main as `feat(art): add Reforged biome
environment kit`. One original AI-assisted reference plus deterministic project
geometry emits four 20-frame family sheets. The Batch 26 tool packs an 80-frame
1024x512 RGBA8888 atlas plus runtime-safe import JSON and separate complete
provenance. All 25 asset tests, five focused client contract tests, typecheck,
lint, affected/full builds, formatting, diff/provenance review, and targeted
desktop Chromium/mobile-landscape object, grayscale, direct-renderer, and visual
evidence are green. Current small-world tiles/collision, HUD/minimap,
capability-off/old-server fallback, Results/rematch, and recovery contracts
remain unchanged. No shared/server/wire/map/mechanics/capability-default/
production/deployment behavior changed.

Choose and document the Batch 32 visual/client-rendering verification tier. Run
focused validators for every new manifest/output and add deterministic import,
exact grid/registration, event coverage, direction/origin, timing, radius/
boundary, pooling/budget, palette, grayscale, fallback, and full/reduced tests.
Verify every current muzzle, scenery/player impact, explosion, heal, armor,
ability, rarity, zone, and elimination identity; confirmed-hit versus scenery
separation; mechanically dormant future rarity/zone art; capability-on preview/
presentation; capability-off/old-server fallback; current small-world behavior;
HUD/minimap readability; Results/rematch; and recovery restoration at full,
mobile-width, direct-renderer, and gameplay scale. Run repository formatting,
`git diff --check`, intended-diff/provenance review, `corepack pnpm typecheck`,
`corepack pnpm lint`, affected and full production builds, and targeted desktop
Chromium/mobile-landscape interaction and visual evidence. Escalate to full unit
or three-project browser suites if shared/server/wire, effect lifecycle,
recovery, capability foundations, or broader scene behavior changes. Update
roadmap acceptance/status, architecture/pipeline/provenance docs, bug ledger
only with proven evidence, and Session Log. Run the complete end-of-batch
ritual, commit and push directly to main, verify a clean worktree with HEAD
exactly matching origin/main, and skip deployment.

Carry-over warnings: use Corepack pnpm 10.33.0 if the local shim mismatches. Do
not overwrite, reinterpret, or atlas the Batch 25 goldens. Keep source archives
and full license/generation lineage out of runtime redistribution. Preserve all
five completed production atlases, including both fighter atlases' exact layer/
state contracts and the biome kit's live-map dormancy. Keep uncut combat-
feedback art mechanically dormant except for explicitly verified capability-
owned preview/presentation paths. RFG-001/RFG-002 remain
closed historical proofs. RFG-003 still requires staged Firefox/WebKit object/
input evidence and direct renderer pixels where applicable, with Chromium as
the live/compositor and mobile-sized visual reference. Batch 32 owns modern
combat feedback; Batch 33 owns coherent visual cutover.
```
