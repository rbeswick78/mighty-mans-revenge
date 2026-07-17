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
