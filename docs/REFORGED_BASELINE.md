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

## Adjacent bug reproductions

`client/src/rendering/camera-baseline.test.ts` intentionally asserts current
broken composition behavior so later camera work has deterministic evidence:

- An idle `CameraKick.update()` changes a sustained base scroll of `(320, 144)`
  to `(0, 0)`.
- An idle `ZoomPulse.update()` changes a sustained base zoom of `0.9` to `1`.

Run `corepack pnpm exec vitest run client/src/rendering/camera-baseline.test.ts`;
both reproductions pass. They document behavior to replace in Batch 20, not
desired long-term behavior.

The baseline E2E helper also reproduced the existing non-Chromium headless
network limitation: Firefox and mobile WebKit did not obtain a local player ID
within 15 seconds on the live practice path. Their baseline path therefore
uses the same staged-scene strategy as existing composition tests. The black
non-Chromium staged screenshots remain unresolved and are not evidence that a
real Firefox or Safari user sees a black game.
