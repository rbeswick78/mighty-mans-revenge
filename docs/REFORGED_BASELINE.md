# Reforged Baseline Evidence

Batch 2 captured the current behavior before Reforged capabilities, navigation,
camera, large-world, or art work begins. The behavior baseline is commit
`d136b1694c789055fe161fbec94c9ee8548eda7c` on Windows with Node `v24.13.0`
and pnpm `10.33.0`. Measurements are local headless-run evidence, not production
service-level objectives or hardware certification.

## Quality status

The unchanged Batch 1 runtime passed the following checks on 2026-07-15:

| Check                | Command                                             | Result                                  |
| -------------------- | --------------------------------------------------- | --------------------------------------- |
| TypeScript           | `corepack pnpm typecheck`                           | Passed                                  |
| ESLint               | `corepack pnpm lint`                                | Passed                                  |
| Unit/integration     | `corepack pnpm test`                                | 105 files, 1,331 tests passed in 50.89s |
| Chromium E2E         | `corepack pnpm test:e2e --project=desktop-chromium` | 47 passed, 1 skipped in 9.2m            |
| Firefox E2E          | `corepack pnpm test:e2e --project=desktop-firefox`  | 39 passed, 9 skipped/fixme in 7.6m      |
| Mobile-landscape E2E | `corepack pnpm test:e2e --project=mobile-landscape` | 40 passed, 8 skipped in 4.0m            |

The skipped/fixme coverage is deliberate current harness behavior, not a newly
introduced Batch 2 regression. In particular, Firefox two-context WebRTC
pair-up and the mobile two-context touch-driver path are explicitly fixed out
in `e2e/tests/character-select.test.ts`.

## Server and network baseline

Run `corepack pnpm baseline:server` to build real active `Match` instances,
serialize representative state, execute 2,000 warmed four-player simulation
ticks, and sample the real `GameLoop`. The recorder prints one
`BASELINE_EVIDENCE` JSON line for machine comparison.

| Measurement                                   |                 2026-07-15 result |
| --------------------------------------------- | --------------------------------: |
| Configured server rate / tick budget          |                       20Hz / 50ms |
| Live-loop rolling measured rate               |                              20Hz |
| Live-loop effective rate                      | 15.932Hz (36 ticks / 2,259.636ms) |
| Live-loop callback EMA                        |                           0.108ms |
| Four-player simulation mean / p95 / p99 / max |   0.017 / 0.035 / 0.110 / 1.087ms |
| Two-player active Deathmatch snapshot         |                       2,481 bytes |
| Four-player active Deathmatch snapshot        |                       3,762 bytes |

Snapshots are UTF-8 JSON for active Wasteland Outpost Deathmatch state and
include the current player, pickup, mutator, event, objective, projectile, and
effect fields. They are a repeatable representative shape, not a maximum-size
packet. The live-loop sample logged one 254.279ms host event-loop drift reset;
the simulation callback itself remained far below the 50ms budget. Retain both
facts when comparing future measurements rather than treating the rolling 20Hz
counter as proof of uninterrupted wall-clock pacing.

## Client frame and visual baseline

Run `corepack pnpm baseline:client`. Set `BASELINE_ARTIFACT_DIR` to retain PNGs
outside Playwright's result directory. The helper samples three seconds of
`requestAnimationFrame`, attaches a screenshot, and prints one
`BASELINE_CLIENT_FRAME` JSON line per project.

| Project                    | Scene source        |     FPS |      Mean |     p95 |     p99 | Visual result                                          |
| -------------------------- | ------------------- | ------: | --------: | ------: | ------: | ------------------------------------------------------ |
| desktop-chromium, 1280x720 | Live local practice |   4.389 | 227.864ms |   300ms |   300ms | Full 960x720 game and HUD visible with 160px side bars |
| desktop-firefox, 1280x720  | Staged `GameScene`  | 122.925 |   8.135ms | 13.32ms | 16.66ms | Captured canvas is black                               |
| mobile-landscape, 844x390  | Staged `GameScene`  |  16.639 |    60.1ms |   115ms |   132ms | 520x390 canvas area is black with 162px side bars      |

These figures are recorder output, not pass/fail gates. Headless engines may
use different software renderers; the live Chromium workload and staged
non-Chromium workload are not directly comparable. The low Chromium/mobile
figures establish the local headless floor that later optimization sessions
must annotate, not a claim about a real GPU or device.

Current visual tests contain 32 screenshot calls but no `toHaveScreenshot`
pixel-diff assertions. Manual inspection of the live Chromium capture found the
entire arena and bottom HUD readable with no clipping at the current 4:3
logical size. The canvas consumes only 520 of 844 mobile-landscape pixels
because Phaser FIT preserves the 960x720 aspect ratio. Firefox and mobile
staged gameplay captures are black even though scenes are active and animation
frames advance; Phaser-object assertions still run. This harness limitation is
recorded in the roadmap bug ledger and must be resolved before those engines
can provide trustworthy gameplay pixel baselines.

## Camera and coordinate inventory

The present implementation works because every arena fits the unscrolled
logical viewport. These assumptions must be addressed deliberately in Batches
18-24:

| Area                      | Current assumption                                                                                                                                                                              | Evidence / owner                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Logical layout            | World board is 960x576; HUD is y=576-720; total canvas is 960x720 (4:3).                                                                                                                        | `client/src/ui/layout.ts`, `client/src/main.ts`                                             |
| Map dimensions            | Every registered arena is 20x12 at 48px, exactly 960x576.                                                                                                                                       | `shared/src/maps/registry.test.ts`                                                          |
| Base camera               | No follow or world bounds are configured; ordinary scroll is `(0, 0)`, zoom is `1`, and world pixels therefore equal board-screen pixels.                                                       | `client/src/scenes/game-scene.ts`                                                           |
| Authoritative world state | Players, projectiles, pickups, effects, hazards, and objective entities use pixel world positions; KOTH hill anchors are tile coordinates converted with `MAP.TILE_SIZE`.                       | shared network types and `client/src/rendering/koth-hill-renderer.ts`                       |
| Mouse aim                 | Pointer coordinates already pass through `camera.getWorldPoint`, the one explicit screen-to-world transform in gameplay input.                                                                  | `client/src/input/keyboard-mouse-input.ts`                                                  |
| Touch aim/UI              | Right-stick aim is a direction vector, while joystick/action nodes are fixed with `setScrollFactor(0)` and board input is rejected at the hard-coded `MAP_HEIGHT_PX` boundary.                  | `client/src/input/touch-input.ts`                                                           |
| HUD/menu overlays         | HUD, match menu, briefing, death, contract, and callout placement use fixed 960/576/720 coordinates and screen pinning.                                                                         | `client/src/ui/hud.ts`, `client/src/ui/match-menu.ts`, `client/src/scenes/game-scene.ts`    |
| Persistent render targets | Decals and lighting allocate a full fixed 960x576 render texture; the retained scorch renderer has the same assumption.                                                                         | `client/src/rendering/decal-renderer.ts`, `lighting-renderer.ts`, `scorch-renderer.ts`      |
| Screen effects            | Radiation wash/warning, scrapstorm warning, and X-ray tint/borders use fixed map dimensions and zero scroll factor.                                                                             | `radiation-storm-renderer.ts`, `scrapstorm-renderer.ts`, `xray-fx.ts`                       |
| Transient camera effects  | Kick writes absolute scroll, zoom pulse writes absolute zoom, roll writes absolute rotation, and several impact paths call Phaser shake directly. There is no base/transient composition layer. | `camera-kick.ts`, `zoom-pulse.ts`, `camera-roll.ts`, `effects-renderer.ts`, `game-scene.ts` |

World-space rendering that consumes authoritative entity positions can remain
world-space, but fixed render targets and screen overlays need actual world or
viewport bounds. HUD/touch elements must stay screen-space through a safe-area
API. Aiming must preserve the existing mouse transform and give every future
pointer/marker/effect path an explicit domain.

### Batch 18 viewport cutover evidence

Batch 18 preserves the table above as the fixed-world inventory while adding a
capability-owned outer surface. Literal normalized `largeWorlds: true` selects
a 1280x720 logical 16:9 `GameScene` with a 32px logical safe-area overlay
boundary; false, absent, partial, malformed, reconnecting, disconnected, and
old-server paths remain exactly 960x720. Both 1280x720 desktop and 844x390
mobile-landscape FIT evidence report the same 1280x720 camera world view.

This cutover deliberately leaves every registered map at 960x576 and origin
`(0, 0)`, camera scroll `(0, 0)`, zoom `1`, full-map render targets, and the
transitional HUD coordinates unchanged. The resulting unused large-world
surface is expected until Batches 19-22 add explicit coordinate domains,
camera ownership, dynamic rendering, and responsive HUD placement. Mobile-
sized Chromium is the trusted visual source; staged WebKit remains object/input
evidence under RFG-003.

### Batch 19 coordinate separation evidence

`client/src/rendering/gameplay-coordinate-space.ts` now owns branded logical
screen and world points, Phaser-camera screen-to-world conversion, the exact
inverse affine world-to-screen path, transformed screen direction/aim helpers,
fixed-world bounds checks, and explicit screen/world object declarations.
Keyboard pointer aim and touch-stick aim use this boundary; touch admission
converts screen input to world Y before preserving the current 576px board
limit. The crosshair, touch controls, radiation/scrapstorm/X-ray/full-screen
warnings, fighters and their markers, KOTH/Core Run/Kill Confirmed objectives,
and aim/trail/impact/explosion particles now declare their domain.

Deterministic tests cover camera-origin identity, transformed round trips,
scroll/zoom/rotation/viewport-offset affine matrices, pointer and touch aim,
desktop/mobile logical equivalence, fixed-map bounds, and screen-pinned versus
world-space placement. Live Phaser evidence confirms those domains and identity
conversions on the retained 960x720 fallback and capability-owned 1280x720
surface. No base camera, transient camera layer, map origin/dimension, render
target, HUD, physics, simulation, wire, or server behavior changed. Mobile-
sized Chromium remains the trusted visual source; staged mobile WebKit remains
black under RFG-003.

### Batch 20 camera controller evidence

`client/src/rendering/camera-controller.ts` is the sole gameplay-camera
mutation boundary. It calculates exact world-space target follow and clamps
the base view on all edges, including deterministic origin anchoring when a
world is smaller than the logical viewport. Local-player, respawn, and
spectator targets are explicit. Recoil kick, shake, zoom pulse, and roll are
sampled separately and composed over base scroll/zoom once per frame; every
former direct Phaser shake call now requests the controller's shake layer.

The former RFG-001 and RFG-002 reproduction file now proves the repairs: idle
recoil preserves sustained base scroll `(320, 144)`, and idle zoom pulse
preserves a sustained base zoom of `0.9`. Deterministic controller coverage
also proves center follow, all eight edge/corner clamps, current small-world
behavior, respawn/spectator changes, simultaneous transient composition,
equal desktop/mobile logical visibility, and identity restoration. Targeted
Phaser evidence exercises screen/world round trips and aim while synthetically
scrolled and zoomed through the Batch 19 coordinate service, then restores the
real fixed-map contract. Current maps, render targets, HUD, physics,
simulation, wire state, capability defaults, and production remain unchanged.

### Batch 21 dynamic world rendering evidence

`client/src/rendering/dynamic-world-rendering.ts` now derives world bounds,
8x8-tile clipped chunks, viewport/world-intersection resources, visible chunk
sets, frozen full/reduced cosmetic budgets, hysteretic quality selection, and
deterministic FIFO pool exhaustion. `GameScene` selects the map before creating
the Batch 19 coordinate service and Batch 20 camera controller so both consume
the actual map bounds. The current six 20x12 maps still resolve to 960x576 at
origin and therefore preserve exact small-world anchoring on both logical
surfaces.

Map tiles, underlays, decorations, and spawn presentation now live in culled
chunk containers while the full mutable collision grid stays resident for
shared prediction/reconciliation. Decals use six chunk-local masked resources
on current maps, replay seam-crossing stamps, and rebuild every affected mask
and ledger after authoritative destruction. Lighting is screen-pinned to the
derived 960x576 current-world/viewport intersection and projects world lights
through `GameplayCoordinateSpace`; storm washes/warnings, X-ray framing, and
shader shockwaves likewise consume derived dimensions or the live transform.
Impact sparks/dust, explosion debris, smoke, lights, decals, and shockwaves
consume automatic full/reduced cosmetic budgets without changing gameplay.
The obsolete unused fixed-size `ScorchRenderer` was removed; live scorch
remains the map-derived tile-frame mutation.

Focused desktop Chromium/mobile-landscape evidence proves current dimensions,
six resources/chunks, exact seam destruction rebuilds, edge culling, reduced-
quality transition, transformed lighting, equal logical visibility, fallback,
Results, and recovery restoration. The Batch 21 frame recorder observed a
host-limited live Chromium 3.658 FPS / 273.375ms mean sample at full quality and
staged mobile 30.202 FPS / 33.110ms mean sample at reduced quality. These remain
non-hardware pass thresholds; the mobile staged PNG is still black under
RFG-003, while inspected live and mobile-sized Chromium gameplay captures
remain the visual evidence.

### Batch 22 responsive combat HUD evidence

`responsiveCombatHudLayout()` now owns one immutable logical screen-space
model for the complete combat HUD, touch action cluster, and confirmed
live-match menu. The capability-owned path places health/armor, stamina,
rifle/special ammo, grenades, ability, score/mode/timer status, active events,
kill feed, contracts, countdown/briefings, death, and separate combat/contract/
event callout lanes inside Batch 18's safe area. Desktop and mobile FIT surfaces
consume identical 1280x720 logical coordinates; safe-area movement changes no
camera or world visibility.

The exact 960x720 fallback geometry remains frozen for capability-off and old-
server paths. Every display value still comes from its established snapshot,
event, and pure presentation helper, while touch buttons retain their ordinary
input edges and the non-pausing live-match menu retains its consequence-specific
confirmation. Results, rematch re-entry, and recovery restore their owning
logical layouts. Focused deterministic and desktop Chromium/mobile-landscape
evidence covers all resources and mode statuses, simultaneous callout lanes,
kill feed, contracts, touch actions, menu confirmation, current small-world
anchoring, equal logical visibility, fallback, rematch, and recovery. Mobile-
sized Chromium remains the trusted mobile visual source under RFG-003.

### Batch 23 minimap foundation evidence

`minimapLayoutForGameplay()` and the pure static/dynamic projection helpers now
own the capability path's non-interactive map overlay. The static projection
uses the selected registered map's actual 960x576 current bounds, complete live
collision grid, and authored decorations rather than camera-visible chunks or
viewport resources. Reliable tile destruction refreshes the projection so
destroyed solids and their no-longer-backed landmarks disappear together.

The dynamic projection consumes only owning-mode snapshot state: live KOTH and
next-hill zones, every Kill Confirmed tag, Core Run position, Bounty Hunt target
position, the local gameplay position, and exact server-authored Crew team
assignments. It hides generic rivals, supports any number of allies, and never
infers teams, objectives, or visibility from callsigns, player order, screen
coordinates, camera state, or culling. Modes without a live world objective
show none. The 216x154 panel stays screen-pinned inside the same logical safe
area while reserving Batch 22's five-row kill feed, menu, touch controls, and
vitals; desktop and mobile retain one 1280x720 logical view.

Focused deterministic and desktop Chromium/mobile-landscape evidence covers
actual bounds, complete solids, authored landmarks, authoritative destruction,
all supported objective projections, local/Crew/N-player visibility, camera and
culling independence, safe-area coexistence, equal logical visibility, exact
legacy no-minimap fallback, Results/rematch, and recovery. Inspected attached
1280x720 and resized 844x390 Chromium frames are readable and unclipped. Staged
mobile WebKit remains object evidence rather than trusted pixels under RFG-003.

### Batch 24 camera regression gate evidence

Batch 24 selected the complete camera/world/performance verification-gate tier.
The final deterministic inventory passed 133 files and 1,563 tests, including
exact local/respawn/spectator follow, all edge/corner clamps, transformed aim
and touch, current small-world origin anchoring, dynamic chunks/resources,
destruction, full/reduced quality, responsive HUD priorities, minimap truth,
Results/rematch/recovery, and the repaired RFG-001 `(320, 144)` scroll plus
RFG-002 `0.9` zoom values. Typecheck, lint, affected/full production builds,
the complete default-false three-project browser inventory, and the complete
enabled camera/world/HUD/minimap matrix passed.

The final default-false Playwright inventory passed 139 cases with 68 documented
capability/project skips in 23.8 minutes. With `largeWorlds` enabled, the
three-project gameplay-viewport matrix passed 17 cases with four expected
inverse/project skips in 3.3 minutes. Retained 1280x720 and resized 844x390
Chromium frames show the complete current arena, HUD, minimap, objective/Crew
markers, and callout layers without clipping. Direct Phaser renderer snapshots
from desktop Firefox and mobile WebKit are non-black, visually complete, and
pair with their staged object/input assertions. This gate-dispositions RFG-003
for the milestone: live local WebRTC remains unavailable in those headless
engines and WebKit compositor screenshots may remain black, but renderer-
extracted engine pixels are trusted; Chromium remains the live/compositor and
mobile-sized visual reference.

The server recorder measured 0.027ms mean, 0.051ms p95, 0.223ms p99, and
4.009ms max across 2,000 warmed four-player simulation ticks. Active two/four-
player snapshots remained 2,481/3,762 bytes. The live loop recorded 15.981
effective Hz, 0.104ms mean processing, and one 253.572ms host scheduling drift
reset while its rolling counter remained 20Hz. The enabled client recorder
observed live Chromium at 3.227 FPS / 309.930ms mean, staged Firefox at 109.392
FPS / 9.141ms mean, and staged mobile WebKit at 21.046 FPS / 47.516ms mean.
These remain host/software-renderer observations rather than hardware pass
thresholds. All capabilities remain default false and production was not
deployed.

### Batch 34 map authoring contract evidence

Batch 34 adds a shared document-loading and authoring-validation boundary but
does not change the current registry or any runtime map consumer. The
`compatible` profile accepts all six unchanged 20x12 JSON maps without an
`authoring` block; their names, 48px tiles, 960x576 bounds, `(0, 0)` origin,
collision/destruction grids, spawns, pickups, KOTH anchors, decoration
semantics, dynamic chunks, camera clamps, HUD, minimap projection, modern biome
projection, and fallback paths remain the Batch 24/33 baseline.

The separate `standard-40x24` profile validates future map documents before
registration. Its deterministic positive fixture proves 40x24 dimensions,
complete regions, landmark/minimap identity, walkable connectivity, KOTH/Core
Run anchors, four identified spawns, reachable identified pickups, existing
shootable gates and explosive barrels, and rotational review. Negative fixtures
prove stable coded failures for every owned authoring surface. The CLI validates
file and directory inputs in stable order. No recorder threshold, browser
layout, capability default, authoritative 20Hz behavior, snapshot shape, or
production state changes in this batch.

### Batch 35 first successor-arena evidence

Wasteland Outpost and Overgrown Suburb now each have one deterministic strict
40x24, 48px-tile successor document. Both retain the exact public arena name,
one `(0, 0)`-origin 1920x1152 world, four quadrant spawns, three KOTH anchors,
the centered Core Run anchor, reachable ten-pickup economy, one connected
walkable component, minimap metadata, destructible cover, two shootable gates,
two existing explosive barrels, and explicit asymmetric transform review.
Wasteland keeps badlands/watchtower/command-post routes; Overgrown keeps ruined
rowhome/cul-de-sac/park routes and parked-car cover.

The six-map public registry, registry order, persistence keys, draft/schedule
names, and wire payloads remain unchanged. With the literal server capability
false or absent, both names return their byte-identical 20x12 legacy documents;
the four Batch 36-37 arenas always remain legacy. With `largeWorlds: true`, the
server resolves either successor for every authoritative launch/rematch path
and the client consumes the same normalized handshake. No viewport, map-name,
local-config, or art inference participates, and no capability is exposed or
enabled by default.

The preserved Batch 18 logical resource envelope stays 960x576 while actual
successor world truth is 1920x1152 in the dynamic render plan, camera bounds,
collision grid, and minimap projection. Targeted desktop Chromium live pixels
and staged Firefox/mobile direct-renderer evidence cover both biome layouts,
four camera edges, objectives, gate destruction/barrel preservation, HUD/
minimap, Results/rematch, recovery, and legacy restoration. RFG-003 remains the
evidence disposition; simulation remains authoritative at 20Hz and production
is unchanged.

### Batch 36 second successor-arena evidence

Scrapyard and Collapsed Overpass now each have one deterministic strict 40x24,
48px-tile successor document. Both retain the exact public arena name, one
`(0, 0)`-origin 1920x1152 world, four quadrant spawns, three KOTH anchors, the
centered Core Run anchor, a reachable ten-pickup economy, one connected walkable
component, complete minimap metadata, destructible cover, shootable-gate
shortcuts, existing explosive-barrel hazards, and explicit asymmetric transform
review. Scrapyard preserves compressed-car, container, salvage, fenced-sort,
and processing-yard lanes; Collapsed Overpass preserves broken road decks,
underpass channels, stranded vehicles, heavy supports, and divided concrete
approaches.

The public six-map registry, registry order, persistence keys, draft/schedule
names, and wire payloads remain unchanged. With the literal server capability
false or absent, all four successor-owned names return their byte-identical
20x12 legacy documents; Checkpoint Zero and Rusted Refinery remain legacy-only.
With `largeWorlds: true`, the server resolves any of the four authored
successors for every authoritative launch/rematch path and the client consumes
the same normalized handshake. No viewport, map-name, local-config, or art
inference participates, and no capability is exposed or enabled by default.

The preserved Batch 18 logical resource envelope remains 960x576 while actual
successor world truth is 1920x1152 in the dynamic render plan, camera bounds,
collision grid, and minimap projection. The Batch 36 authored-layout/runtime-
loading tier covers both new industrial layouts, all four camera edges and
spawn quadrants, objectives, gate destruction and barrel preservation, HUD and
minimap, Results/rematch, recovery, and legacy restoration. RFG-003 continues
to require Chromium live/compositor pixels plus staged Firefox/mobile object,
input, and direct-renderer evidence; simulation remains authoritative at 20Hz
and production remains unchanged.

### Batch 37 final successor-arena evidence

Checkpoint Zero and Rusted Refinery now each have one deterministic strict
40x24, 48px-tile successor document. Both retain the exact public arena name,
one `(0, 0)`-origin 1920x1152 world, four quadrant spawns, three KOTH anchors,
the centered Core Run anchor, a reachable ten-pickup economy, one connected
walkable component, complete minimap metadata, destructible cover, two
shootable-gate shortcuts, two existing explosive-barrel hazards, and explicit
asymmetric transform review. Checkpoint Zero preserves dense horizontal and
vertical barricade control lanes, paired inspection chokepoints, gates, and
props. Rusted Refinery preserves the red-roof central power vault, open north
and south approaches, side gates, pipe routes, tanks, and processing lanes.

The public six-map registry, registry order, persistence keys, draft/schedule
names, and wire payloads remain unchanged. With the literal server capability
false or absent, all six names return their byte-identical 20x12 legacy
documents. With `largeWorlds: true`, the server resolves any of the six strict
successors for every authoritative launch/rematch path and the client consumes
the same normalized handshake. No viewport, map-name, local-config, or art
inference participates, and no capability is exposed or enabled by default.

The preserved Batch 18 logical resource envelope remains 960x576 while actual
successor world truth is 1920x1152 in the dynamic render plan, camera bounds,
collision grid, and minimap projection. The Batch 37 authored-layout/runtime-
loading tier covers both final industrial layouts, all camera edges and spawn
quadrants, objectives, gate destruction and barrel preservation, HUD and
minimap, Results/rematch, recovery, and legacy restoration. RFG-003 continues
to require Chromium live/compositor pixels plus staged Firefox/mobile object,
input, and direct-renderer evidence; simulation remains authoritative at 20Hz
and production remains unchanged.

### Batch 38 cross-arena balance evidence

The deterministic balance inventory is 624 legal products: six strict
successors multiplied by every compatible standard mode and every legal
Duel/Rumble/Crew human/bot composition. The maximum-participant regulation
inventory is 48 runs (six arenas by eight modes) at the authoritative 20Hz
step. Every run reached Results without overtime and generated combat activity;
all legal products started with the correct strict map, 173-second regulation,
mode-owned pickup count, team shape, and sequenced bot input.

The shared six-arena bounds are now evidence: four quadrant spawns have 17-21
tiles of minimum pairwise path separation; path diameter is 58 tiles/13.92
seconds; KOTH maximum access is 8.88-10.8 seconds with 5.76-7.92 seconds of
spawn spread; centered Core Run access is 5.76 seconds with zero spread;
nearest pickup access is 2.16-3.36 seconds; pickup density is 1.34-1.45 per
hundred walkable tiles; gate access is at most 8.4 seconds; explosive-barrel
access is at most 8.88 seconds. All documents retain ten declared pickups,
20-80 destructible-cover tiles, two or four shootable gates, and two existing
explosive barrels.

The only evidence-proven correction is shared bot unsticking. A clear center
ray could still let the fighter-sized collision box catch a cover corner.
Progress below 80 px/s for 0.75 seconds now clears the waypoint and forces the
existing collision-grid path for 1.5 seconds. Base movement remains 200 px/s;
stamina, mode/spawn/pickup parameters, map bytes, and regulation remain
unchanged. The 20Hz performance probe retained a 50ms budget and measured
synthetic four-player mean/p95/p99/max work of
0.010/0.020/0.058/0.582ms.

## Adjacent bug reproductions

`client/src/rendering/camera-baseline.test.ts` now asserts the repaired
composition behavior at the original deterministic reproduction values:

- An idle recoil layer preserves sustained base scroll `(320, 144)`.
- An idle zoom-pulse layer preserves sustained base zoom `0.9`.

Run `corepack pnpm exec vitest run client/src/rendering/camera-baseline.test.ts`;
both repair assertions pass. The roadmap retains RFG-001 and RFG-002 as
resolved historical evidence for the Batch 24 regression gate.

The baseline E2E helper still reproduces the non-Chromium headless network
limitation: Firefox and mobile WebKit do not obtain a local player ID within 15
seconds on the live practice path. Their recorder path therefore uses the same
staged real scene as the composition tests. Batch 24 now extracts pixels
directly from Phaser's renderer and proves varied, non-black Firefox/WebKit
frames, so black WebKit compositor screenshots are classified as a headless
compositor limitation rather than game pixels. Pair those renderer frames with
staged object/input assertions and keep Chromium as the live/compositor visual
reference until real-device coverage at the release gate.

### Batch 39 release-gate disposition

RFG-004 was traced to a stale `GameScene.minimapRenderer` reference retained
across same-instance scene restarts. Clearing that per-run owner in `init()`
restores the complete legacy baseline after coherent successor play:
`largeWorlds:false` now yields legacy viewport mode, 960x576 bounds, no
successor resources, and no minimap. The strict all-six-arena reproduction,
complete coherent-enabled inventory, default-false inventory plus exact
cold-client rerun, and RFG-003 visual evidence pass. Automated evidence is
green; production and every default remain unchanged pending explicit human
tester/release approval.

### Batch 40 Battle Royale lifecycle baseline

The dormant `battle_royale` format adds no queue, route, capability exposure,
or production state. A server-only lifecycle ledger records each immutable
entrant's first combat elimination or active departure. One living survivor is
the unique winner and placement 1; earlier eliminations receive stable reverse
event-order placements; only final fighters eliminated by combat in the same
simulation step share placement 1 with no winner. All departures and the
no-survivor defensive terminal shape are explicit and deterministic.

Battle Royale dead players remain dead with `respawnTimer: 0`. The format never
enters standard sudden-death overtime and never schedules either mutator slot,
including FORCE-pinned diagnostics. The eight registered `GameMode` classes,
ordinary combat attribution, abilities, grenades, healing, armor, standard
snapshots, and every standard result shape remain unchanged. The optional
Results payload is server authored; clients present up to eight placements,
provide only the existing leave-to-lobby action, keep future spectating false,
and show `PLACEMENTS UNAVAILABLE` when an older server omits the field.

Deterministic focused evidence covers one survivor, a mutually eliminated final
pair, all departures, mixed disconnect/elimination order, duplicate departure
after death, one-life enforcement, no overtime/mutators, eight entrants,
winner/placement coherence, and absent fields on standard results. The complete
145-file/1,644-test unit matrix, typecheck, lint, all builds, targeted Results
and old-server fallback across desktop Chromium, desktop Firefox, and mobile
landscape, and the authoritative server baseline passed. The baseline retained
the configured/rolling 20 Hz contract, 50 ms tick budget, and synthetic
four-player mean/p95/p99/max work of 0.017/0.027/0.082/1.352 ms.

### Batch 41 Battle Royale queue baseline

The dormant Battle Royale entry path is a dedicated solo queue and is consumed
only when the server advertises literal `battleRoyale:true`. Eight humans launch
immediately. A cohort of one through seven humans retains its initial
server-owned deadline and is filled with deterministic ordinary bots to exactly
eight at 15 seconds. Cancellation, duplicate/capacity rejection, standard-queue
mutual exclusion, pre-launch disconnect removal, nonempty deadline preservation,
and empty-cohort reset are authoritative.

The launch roster retains stable human join order and selected fighters,
prelocks all eight participants, and proceeds directly to countdown. Existing
bot behavior and Wasteland Outpost remain temporary lifecycle foundations;
rarity, weapon instances, inventory, loot, the four-biome arena, safe zones,
Battle Royale bot behavior, spectating, and records remain later-batch work.
Active departures are eliminations. Results cleanup releases queue bots and
keeps the established leave foundation without standard rematch or persistence.

Queue status and Battle Royale match-found details are optional server-authored
fields. New clients validate capability, total/human/bot arithmetic, and the
complete seven-opponent launch before routing. Old-server clients suppress the
entry, old clients ignore the fields, malformed projections fail closed, and
standard match-found serialization omits the undefined addition. The complete
146-file/1,662-test unit matrix, typecheck, lint, all builds, and focused entry
journeys on desktop Chromium, desktop Firefox, and mobile landscape passed. The
server baseline retained configured/rolling 20 Hz, its 50 ms budget, synthetic
four-player mean/p95/p99/max work of 0.018/0.028/0.156/1.118 ms, and unchanged
2,481/3,762-byte standard snapshots.

### Batch 42 Battle Royale weapon baseline

Battle Royale now has an exact six-gun instance vocabulary: rifle, pistol,
shotgun, SMG, sniper rifle, and launcher. Common through mythical rarity uses
shared deterministic weights and multipliers, with ordinary distance falloff
resolved first. Instance IDs and gun/rarity coherence normalize fail closed.
The server alone owns new-gun access, burst/cadence/ammo, launcher flight,
collision, line of sight, blast damage, world interaction, and kill attribution.

The client consumes optional equipped-instance and rocket arrays as projection
state. It displays the six locked rarity label/shape/color identities and
server positions, clears state when an old server omits it, and never infers a
hit or rarity. Standard formats cannot fire the new guns even if incoherent
state is injected. Their weapon registry, Weapon Roulette order, pickups,
damage, modes, mutators, stats/persistence, and exact active snapshot sizes are
unchanged.

The complete 148-file/1,684-test unit matrix, typecheck, lint, all builds, and
three-project focused browser proof passed. The authoritative baseline retained
configured/rolling 20 Hz, the 50 ms budget, synthetic four-player
mean/p95/p99/max work of 0.023/0.043/0.211/2.095 ms, and exact 2,481/3,762-byte
standard snapshots. No capability default, production state, or deployment changed.

### Batch 43 Battle Royale inventory baseline

Battle Royale entrants now begin with fists and one server-owned gun slot. A
held gun carries its immutable instance and loaded ammo; one bounded universal
reserve stays with the fighter. Unarmed fighters automatically collect the
nearest legal drop, while armed fighters only receive a server-authored nearby
comparison and must use reload to swap. Stable player-ID processing and drop-ID
tie-breaking resolve simultaneous collection deterministically.

Reload transfers reserve into the current magazine. A swap places the old gun
at the fighter's position with its exact instance, rarity, and surviving loaded
ammo, without moving universal reserve. Spending the final loaded round discards
the empty gun to fists. Elimination and departure clear held state without
creating the compact loot piles owned by Batch 44. Standard authored weapon
pickups are suppressed only inside the Battle Royale lifecycle; sustain and
grenade behavior remain available, and no container or loot source exists yet.

Inventory and ground guns are additive optional snapshot state. Clients validate
slot/outer-instance coherence and ammo bounds, clear old-server omissions, fail
an entire malformed drop projection closed, and only render authoritative state.
The nearby comparison is server selected. Keyboard R, standard-gamepad X, and a
Battle Royale-only touch button all emit the same existing reload input; standard
touch layouts keep the new button absent.

The complete 149-file/1,696-test unit matrix, typecheck, lint, all builds, and
three-project focused browser proof passed. The authoritative baseline retained
configured/rolling 20 Hz, the 50 ms budget, synthetic four-player
mean/p95/p99/max work of 0.018/0.031/0.123/0.867 ms, and exact
2,481/3,762-byte standard snapshots. RFG-005's three-fighter self-explosion
reproduction now records the missing lifecycle event without inventing kill
credit. No capability default, production state, or deployment changed.

### Batch 44 Battle Royale container and loot baseline

Battle Royale now has a server-owned container and compact-loot manager beside
the one-slot inventory manager. A registered solid container opens once through
the existing authoritative attack/destruction paths, clears collision, retains
a short opened projection, and deterministically authors exactly one full-mag
gun plus one small bundle containing 18 universal reserve and one bandage,
armor, or grenade sustain pickup. Match/container hashing consumes none of the
gameplay RNG, and repeated attacks cannot duplicate either component.

Elimination and departure author one idempotent, source-linked compact pile. It
contains the exact held instance, rarity, surviving loaded ammo, the fighter's
universal reserve, and exactly one deterministic sustain bundle; an unarmed or
dry fighter still leaves the bundle but no invented gun. Gun and bundle
collection remain independent, use stable player-ID and nearest-ID processing,
and support eight simultaneous contenders. Standard scenery, caches, pickups,
death drops, melee, snapshots, modes, mutators, stats, and persistence retain
their established paths because the loot manager is absent.

Containers, supply bundles, and optional loot-source links are additive
snapshot state. New clients validate each complete array atomically, clear it
when an old server omits it, and render only server-owned positions/status.
Modern art uses the existing container, damaged-container, supply, gun, and
six-shape rarity frames; fallback uses code-native silhouettes, while reduced
quality keeps the static rim/badge/comparison and removes only the secondary
pulse. Collection, open state, contents, rarity, and comparison outcomes never
originate on the client.

The focused 170-test matrix and complete 150-file/1,704-test matrix passed with
typecheck, lint, all builds, the Batch 44 allowlist format check, and the final
Chromium/Firefox/mobile projection and pointer/keyboard/gamepad/touch case. The
repository-wide Prettier inventory retains 96 inherited files outside the
Batch 44 allowlist. The authoritative baseline retained
configured/rolling 20 Hz and the 50 ms budget; synthetic four-player
mean/p95/p99/max work was 0.017/0.030/0.094/1.324 ms, while standard active
snapshots remained exactly 2,481/3,762 bytes. The mobile check resolved RFG-006
by measuring coordinates against the active 960-wide fallback viewport; no
product input code changed. No capability default, production state, or
deployment changed.

### Batch 45 Battle Royale arena baseline

Battle Royale now selects one private `Shatterlands` document: exactly 56×34
at 48px and 2,688×1,632 world pixels. Four complete regions, authored
transitions/routes/landmarks, 16 sustain pickups, 16 solid one-cell containers,
and eight two-candidate spawn groups validate through the deterministic
`battle-royale-56x34` profile. One candidate from each group is selected by the
server's match RNG, and all containers enter the established Batch 44
attack/open boundary. The standard six-map registry, public names, schedules,
Draft, Practice, Arena Mastery, rematches, persistence, and 624-product balance
inventory do not include the private arena.

The client consumes the server-selected name and renders per-cell wasteland,
overgrown, industrial, and irradiated families through the approved atlas or
procedural fallback. The existing non-interactive minimap projects named
regions, landmarks, mutable collision, 16 explicit intact-container identities,
and permitted player truth; authoritative tile destruction removes an opened
container. No map, spawn, route, transition, container, or visibility decision
moves client-side, and no zone or tactical-map state exists yet.

The complete 152-file/1,714-test matrix, typecheck, lint, all builds,
deterministic map regeneration, 13-map compatible validation, strict map CLI,
asset contracts, standard balance matrix, and focused Chromium/Firefox/mobile
browser proof passed. The authoritative baseline retained configured/rolling
20 Hz and the 50 ms budget; synthetic four-player mean/p95/p99/max work was
0.067/0.039/0.190/44.646 ms, and standard active snapshots remained exactly
2,481/3,762 bytes. All capabilities remain default false and unexposed;
production remains on Batch 33 and no deployment, restart, or live smoke
occurred.

### Batch 46 Battle Royale safe-zone baseline

Battle Royale now owns a deterministic eight-segment circle plan generated
from the stable match seed and private arena dimensions without consuming
gameplay RNG. Preview, closing, hold, and final phases carry exact durations;
closing centers and radii interpolate from strictly nested bounded circles,
holds remain fixed, and the final closure reaches radius zero. One-second
outside pulses escalate from 2 through 16 damage, honor invulnerability and
Iron Hide, drain armor before health, create no attacker or kill credit, and
can eliminate in stable player-ID order. Same-simulation-step combat/zone final
cohorts retain coherent mutual-elimination placement, while departures remain
separately ordered and one-life respawn stays disabled.

`battleRoyaleSafeZone` is an additive optional snapshot containing only the
current/next circle, phase index/name, phase time remaining, and pulse damage.
The client validates the complete object atomically, clears old-server
omission, and projects it without advancing a gameplay clock. Standard
snapshots omit the field and remain exactly 2,481/3,762 UTF-8 JSON bytes. The
existing Radiation Storm state and nonlethal standard-mutator path are
unchanged.

World boundary/wash/status, the compact minimap, and the Battle Royale-only
tactical map all consume the same normalized state. The tactical map exposes
authored regions, landmarks, containers, current/next circles, and the local
fighter only; its input foundation supports keyboard M, standard-gamepad
D-pad Up, and the MAP touch launcher, and its render-state contract proves zero
generic rival markers. Closed tactical maps do not redraw their large static
projection.

The complete 155-file/1,730-test matrix, typecheck, lint, all builds, map and
asset validation, the unchanged 624-product balance matrix, and focused
Chromium/Firefox/mobile browser proof passed. The authoritative baseline
retained configured/rolling 20 Hz and its 50 ms budget; synthetic four-player
mean/p95/p99/max work was 0.014/0.027/0.071/0.814 ms, and standard active
snapshots remained exactly 2,481/3,762 bytes. All capabilities remain default
false and unexposed; production remains on Batch 33 and no deployment,
restart, or live smoke occurred.

### Batch 47 Battle Royale bot baseline

Battle Royale bot-fill fighters now use a pure server planner over the
existing authoritative player, inventory, ground-gun, container, supply,
collision, and current/next circle state. The planner returns only movement,
aim, and contextual-swap intentions; `BotController` emits ordinary sequenced
`PlayerInput`, and the established Match, CombatManager, inventory, and loot
managers remain the only code that opens containers, rolls contents, collects,
equips, reloads, heals, damages, attributes, or eliminates.

Unarmed or low-ammo bots route to intact containers and attack their solid
tiles through ordinary combat. They compare candidate guns by the weapon's
normal trigger output after the locked damage-only rarity multiplier, then use
readiness, distance, and stable entity ID only as deterministic ties. Useful
universal ammo, bandage, armor, and grenade bundles are prioritized without
consuming wasteful sustain. A bot steps outside the contextual radius of the
inferior gun created by its own upgrade swap before requesting a reload, so the
one-input swap/reload contract remains intact.

Current-circle danger preempts every target and detour. Next-circle geometry,
authoritative phase time, ordinary fighter speed, and a shared travel buffer
determine proactive rotation; unsafe loot is rejected and no future phase is
simulated. Living targets use distance/player-ID ordering over N-player maps.
Final closure suppresses loot and shortens only approach/trigger decision
cadence. It changes no weapon, physics, damage, zone, lifecycle, placement, or
client rule.

Focused planner, standard-controller, inventory, loot, and lifecycle coverage
passed 64 tests. Two independent eight-bot 20 Hz Shatterlands runs reproduced
all player/inventory/loot state through active tick 400 or the same legal early
terminal state. The complete matrix passed 156 files and 1,738 tests;
typecheck, lint, all builds, all 13 compatible map documents, four strict map
tests, 30 asset-contract tests, and the unchanged 624-product standard balance
matrix passed. Browser evidence was not selected because Batch 47 adds no wire,
scene, HUD, route, presentation, or player-facing input surface.
The repository-wide Prettier inventory retains 95 inherited files outside the
formatted Batch 47 allowlist.

The final authoritative baseline retained configured/rolling 20 Hz and the
50 ms budget. Synthetic four-player mean/p95/p99/max work was
0.014/0.024/0.069/0.775 ms, and standard active snapshots remained exactly
2,481/3,762 bytes. The host wall-clock probe reset one scheduler drift window
while average processing remained 0.066 ms; no tick-budget product defect was
proven. All capabilities remain default false and unexposed; production remains
on Batch 33 and no deployment, restart, or live smoke occurred.

### Batch 48 Battle Royale spectator baseline

Eliminated connected Battle Royale fighters now remain read-only match
participants. The server publishes an optional format-only projection with the
stable living target list, alive count, current/final standings, eliminator,
and elimination cause. The client validates that object atomically and uses it
only for target cycling, camera/tactical-map focus, and spectator copy. Missing
or malformed optional state clears the projection. Standard snapshots omit the
field and retain their previous bytes and behavior.

Keyboard, standard gamepad, and touch cycle only through the projected living
list. Eliminated local gameplay input remains ineffective and respawn remains
disabled. The selected fighter owns spectator camera and tactical-map focus;
the tactical map continues to reveal no generic rivals. A validated eliminated
fighter can leave to reliable provisional Results, while the legal terminal
event still sends one coherent final Results payload to every connected
entrant. Disconnect/reconnect preserves the safe-lobby fallback.

Focused lifecycle, matchmaking, network, presentation, Results, and spectator
coverage passed 178 tests. Focused Chromium, Firefox, and mobile-landscape
journeys proved keyboard, standard gamepad, and touch cycling plus target-owned
camera/tactical-map focus and leave-to-Results. The complete matrix passed
1,750 tests; typecheck, ESLint, production builds, and the unchanged 624-product
standard balance matrix passed.

The final authoritative baseline retained configured/rolling 20 Hz and the
50 ms budget. Synthetic four-player mean/p95/p99/max work was
0.016/0.029/0.081/0.837 ms, and standard active snapshots remained exactly
2,481/3,762 bytes. One host scheduler drift window reset while average live
processing remained 0.065 ms; no product tick-budget defect was proven. All
capabilities remain default false and unexposed; production remains on Batch 33
and no deployment, restart, or live smoke occurred.

### Batch 49 Battle Royale records baseline

The version-1 persistent file now includes a separate per-callsign Battle
Royale map. Its matches, unique wins, top-three finishes, opponent eliminations,
rounded opponent damage, and best placement never enter existing PvP lifetime,
head-to-head, streak, fighter/arena mastery, contracts, Daily boards, or the
all-time leaderboard. Old files backfill an empty map, malformed additive rows
are discarded independently, and queued atomic writes retain their existing
restart behavior.

Exactly one terminal update includes every human entrant, including eliminated,
departed, and disconnected fighters, while excluding bot fill. Unique winners,
mutual-final draws, top-three placement, opponent/self/zone/departure credit,
repeated matches, best improvement, and restart retention have deterministic
coverage. A capability-owned validated callsign request receives one reliable
server record or null; malformed, stale, wrong-callsign, capability-off, and
old-peer shapes fail closed. The Records tab renders the six totals without
writing or inferring them.

Focused store, lifecycle, match-end, route, network, cache, and Records coverage
passed 205 tests. Desktop Chromium and mobile-landscape journeys proved the
archive, explicit zero state, stale-response rejection, callsign refresh, and
responsive presentation. The complete matrix passed 1,759 tests; typecheck,
ESLint, all production builds, and the unchanged 624-product standard balance
matrix passed. The client bundle transformed 232 modules and retained the
inherited large-chunk warning.

The final authoritative baseline retained configured/rolling 20 Hz and the
50 ms budget. Synthetic four-player mean/p95/p99/max work was
0.012/0.021/0.053/0.900 ms, and standard active snapshots remained exactly
2,481/3,762 bytes. One host scheduler drift window reset while average live
processing remained 0.070 ms; no product tick-budget defect was proven. All
capabilities remain default false and unexposed; production remains on Batch 33
and no deployment, restart, or live smoke occurred.

### Batch 50 Battle Royale performance baseline

The deterministic eight-entrant stress harness exercises four humans, four
bots, eight fighters, concurrent grenades and rockets, sixteen authored
containers, loose weapons, supply bundles, safe-zone state, transient combat
effects, spectator projection, snapshot construction, full-human fanout,
settled heap, and terminal cleanup. It fails closed against the existing 50 ms
tick budget plus additive 64 KiB snapshot, 10 MiB/s aggregate-traffic, and
32 MiB settled-heap-growth regression ceilings.

The final GC-enabled sample recorded synthetic mean/p95/p99/max work of
0.198/0.374/0.595/8.573 ms. Representative/stressed snapshots measured
13,961/17,948 bytes; stressed 20 Hz traffic measured 358,960 bytes/s per client
and 2,871,680 bytes/s across eight recipients. One encoding produced all eight
human deliveries, while bot-only fanout produced none. Settled heap grew
340,680 bytes after warmup and cleanup left zero active matches. The ordinary
baseline retained configured/rolling 20 Hz, the 50 ms budget, and exact
2,481/3,762-byte two/four-player active snapshots.

Focused desktop Chromium and mobile-landscape evidence rendered exact stressed
object counts and bounded cosmetic resources. The slow headless software
renderer entered the documented reduced tier without moving gameplay state or
decisive objects out of the server-owned projection. Desktop Chromium supplied
the inspected readable pixels; the mobile WebKit compositor remained black
under RFG-003 and therefore supplied object/state evidence only.

The complete unit matrix passed 550 suites and 1,764 tests. Typecheck, ESLint,
all production builds, focused browser evidence, deterministic baseline, and
the unchanged 624-product standard balance matrix passed. RFG-007 closed the
quality-governor blind spot for sustained deltas above 250 ms while retaining
isolated-stall hysteresis. All capabilities remain default false and unexposed;
production remains on Batch 33 and no deployment, restart, or live smoke
occurred.

### Batch 51 Battle Royale automated release baseline

The complete cumulative gate passed 550 suites and 1,764 tests, all 13
compatible map documents, the strict Shatterlands profile, four map CLI tests,
30 asset-pipeline tests, typecheck, ESLint, all production builds, and the
unchanged 624-product standard balance matrix. Standard active snapshots remain
exactly 2,481/3,762 bytes. The final ordinary baseline retained configured and
rolling 20 Hz, the 50 ms authority budget, 0.068 ms average live processing,
and 0.014/0.029/0.078/0.789 ms synthetic mean/p95/p99/max work. One host
scheduler drift reset did not prove a processing-budget defect.

The repeated eight-entrant profile measured 0.274/0.482/0.907/4.473 ms
mean/p95/p99/max tick work, 13,551/17,892-byte representative/stressed
snapshots, 357,840 bytes/s per client, 2,862,720 bytes/s for eight recipients,
one encoding for all eight deliveries, 404,720 bytes settled heap growth, and
zero active matches after cleanup. Every value remains within the existing
50 ms, 64 KiB, 10 MiB/s, and 32 MiB fail-closed ceilings.

The default-false and coherent test-only browser inventories each exercised
279 cases across desktop Chromium, desktop Firefox, and mobile landscape. The
final coherent run passed 203 tests with 75 intentional skips. Stale
hidden-reload and scene-transition fixture assumptions were corrected; focused
post-correction evidence passed across all three projects. Isolated long-run
Firefox pointer, Chromium Party click, and Chromium synthetic reload-key flakes
each passed fresh focused reproduction and did not prove product defects.
Chromium remains the trusted pixel source; native headless WebKit black output
retains RFG-003's paired object/input disposition.

No runtime, authority, wire, balance, persistence, production configuration,
or capability changed. Human and production release checks remain held, every
capability remains default false and unexposed, and production remains on Batch
33 without deployment, restart, health probe, or live smoke.

### Batch 52 production-canary correction baseline

The first owner-authorized live Battle Royale smoke used one human plus seven
server bots and reached a legal terminal event, but Results contained only two
rows. Server combat had marked six victims dead before `Match.onKill`; the
Battle Royale branch incorrectly used that actor flag as a duplicate-elimination
test even though no lifecycle row existed. The Battle Royale-only flag was
rolled back immediately, leaving the four coherent Reforged Arena flags live.

RFG-008 changes only the Battle Royale duplicate authority: its lifecycle
ledger decides whether an elimination has already been recorded. Standard
formats retain the former `isDead` guard and continue omitting Battle Royale
wire fields. Deterministic three- and eight-entrant tests reproduce the real
combat ordering by pre-marking victims dead, then require one complete unique
placement row per entrant. A pure presentation test keeps every standard mode
briefing byte-for-value identical while Battle Royale displays its own name and
one-life objective instead of the internal deathmatch adapter.

The correction requires the complete Batch 52 production-rollout matrix and a
repeat live eight-placement terminal smoke before `battleRoyale` can return to
true. Owner real-device and 6–8 minute canary acceptance remains pending and is
not replaced by automated or agent-driven browser evidence.
