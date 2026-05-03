# Graphics Modernization Plan

Living plan for the Mighty Man's Revenge graphics overhaul. **All 6 main tracks complete (1–6).** Further graphics work — real death/muzzle/weapon sprites, map decoration, LUT shader, themed maps, AI-generated assets — lives in `IDEAS.md` (the polish backlog and art-enrichment sections). Menu recolor and tile-variant work shipped 2026-05-03; see `IDEAS.md` for what landed and the auto-memory's `project_graphics_roadmap.md` for the post-roadmap architecture (multi-tileset walls, iron-fence directional auto-tile, tile-picker debug scene, grenade-tile scorch swap). This file remains the source of truth for everything the 6 main tracks decided so we don't re-litigate.

## Process

The user wants **step-by-step pacing for visual work**: one decision at a time, opinionated recommendations (not menus), execute end-to-end within a step, stop at visual checkpoints, wait for "looks good" before advancing. This applies even when auto mode is active. (Also captured as feedback memory at `feedback_step_by_step_planning.md`.)

## Roadmap status

### Step 1: Color palette — DONE

- **Adopted Resurrect-64** by Kerrie Lake (https://lospec.com/palette-list/resurrect-64).
- Defined in `shared/src/config/palette.ts`:
  - `RESURRECT_64` — full 64-color frozen array (for future LUT shader)
  - `Wasteland` — semantic slots like `PLAYER_TINT`, `FLOOR_FILL`, `HEALTH_GOOD`, mapped to specific palette entries for the **dusty desert wasteland** theme
  - `cssHex(n)` — converts `0xRRGGBB` to `'#rrggbb'` for Phaser.Text
  - `healthColor(ratio)` — deduped HP color ramp (used by HUD and overhead bars)
- All in-game procedural color sites recolored: boot-scene, HUD, effects, players, map, touch-input, main canvas bg.
- **Out of scope for this pass:** lobby and results scenes still use the old `#e94560` and `#444466` UI colors — parked in `IDEAS.md` under "Polish backlog."
- LUT shader for palette enforcement was deferred — only useful once off-palette art arrives. Parked in `IDEAS.md`.

### Step 2: Real pixel art (v1 baseline) — DONE

- **Integrated TheLazyStone's "Post-Apocalyptic Pixel Art Asset Pack" v1.1.2.**
  - Source: https://thelazystone.itch.io/post-apocalyptic-pixel-art-asset-pack
  - License: free non-commercial, $2 USD for commercial, no redistribution. See `client/public/assets/ATTRIBUTION.md`.
  - Source zip and `.asset-inspect/` temp folder are gitignored. Only the curated subset is checked in.
- Curated subset at `client/public/assets/{player,enemies,tiles,pickups}/`.
- **Architectural choice: 4-direction sprites, not free rotation.** Aim angle is bucketed via `client/src/rendering/sprite-direction.ts:bucketAimAngle(angle)` into one of `'up' | 'down' | 'side' | 'side-left'`. The player renderer swaps texture by direction; no `setRotation()`.
- Sprite scale = **3×** (16px source → 48px rendered, matching `MAP.TILE_SIZE`).
- Enemy uses Zombie_Small sprites (more visually distinct than tinted player).

### Step 2b: Idle and run animations — DONE

- 8 spritesheets per character: 4 directions × {idle, run}, 6 frames each.
- Animations created in `boot-scene.ts:createCharacterAnimations()`, looping at 6 FPS (idle) / 12 FPS (run).
- `player-renderer.ts` tracks position delta between frames (`MOVING_THRESHOLD_SQ = 1.0` px²) and switches between idle/run anim accordingly. Direction × state combine to pick the anim key (e.g. `player_down_run`, `enemy_side_idle`).

### Step 3: Lighting — DONE

- **Approach:** "Darkness with cut-outs" (additive light overlay) — render-texture covering the playfield, filled with ambient dim each frame, soft radial cut-outs erased through it. Same technique as Don't Starve / Darkwood / Hotline Miami 2 / Hyper Light Drifter. **Phaser Light2D was ruled out** — needs per-sprite normal maps, which TheLazyStone's pack doesn't ship; auto-generating normals for 13–16px sprites produces poor results.
- `client/src/rendering/lighting-renderer.ts` owns it. RenderTexture sized to `MAP_WIDTH_PX × MAP_HEIGHT_PX`, depth 100, alpha = `AMBIENT_DARKNESS_ALPHA = 0.20`.
- One master radial gradient texture is baked once (radius 128, 24 quadratic-falloff steps) and reused for every light kind via `setScale`/`setAlpha` on a single off-display Image used as the erase source.
- **Player aura was tried and removed** — too much contrast at the desired ambient level. Players read fine against the 0.20 dim without a dedicated aura.
- Three light kinds shipped:
  - **Muzzle flash** — 60px, 80ms linear decay. Hooked from `game-scene.onBulletTrail` next to the procedural muzzle flash.
  - **Explosion flash** — 150px, 200ms linear decay. Hooked from `game-scene.onGrenadeExploded`.
  - **Pickup glow** — 40px, sinusoidal pulse (base 0.45 ± 0.20, 1.2s period). Driven by `networkManager.getPickups()` filtered to `isActive`.
- Timed lights tracked in an array with in-place compaction (no per-frame allocations after warmup).
- All tunables at the top of `lighting-renderer.ts`.

### Step 4: Post-processing pipeline — DONE

All four sub-effects shipped. Effect order on the main camera: **bloom (postFX) → CrtPipeline (postPipeline)** — Phaser runs `postFX` before `postPipeline`. CRT pipeline does chromatic aberration → vignette → scanlines in a single fragment shader.

- **4a — vignette + scanlines.** `client/src/rendering/post-fx/crt-pipeline.ts` — `CrtPipeline` extends `PostFXPipeline`. Single fragment shader with smoothstep vignette (UV distance from center) and sin² scanlines (over `gl_FragCoord.y`). Registered at runtime in `GameScene.installCrtPipeline()` because Phaser's `pipeline` GameConfig field types reject PostFX subclasses. Tunables: `VIGNETTE_STRENGTH = 0.55`, `VIGNETTE_FALLOFF = 0.55`, `SCANLINE_INTENSITY = 0.08`, `SCANLINE_PERIOD_PX = 3.0`.
- **4b — bloom.** Phaser's built-in `camera.postFX.addBloom()` rather than a custom pipeline — gets ~90% of the visual win for ~10% of the cost, well-tuned for mobile. Tunables in `client/src/rendering/post-fx/bloom-config.ts`. **The user tightened it after first pass** — settled on `BLOOM_OFFSET_X/Y = 0.6`, `BLOOM_BLUR_STRENGTH = 1.0`, `BLOOM_STRENGTH = 0.7`, `BLOOM_STEPS = 4`. Defaults made the whole map feel blurry; current values give visible halo on bright pixels without softening the rest.
- **4c — kill juice (flash + freeze-frame).** `client/src/rendering/kill-juice.ts` — `KillJuice.trigger()` spawns a 120ms white screen-fade rectangle (depth 1900) and zeroes `tweens.timeScale` + `anims.globalTimeScale` for 50ms. **Freeze pauses tweens/animations only**, not the scene update loop or networking — client prediction stays in sync with the server. Detection: `GameScene.prevDeadStates: Map<string, boolean>` tracks each player's last-known `isDead`; on the false→true edge in the per-frame iteration, fire. Map is pruned for disconnected players. **No shared/server changes** — visual juice doesn't need to round-trip.
- **4d — chromatic aberration on hits.** Baked into `CrtPipeline` (3 texture samples instead of 1) rather than a second pipeline — keeps it to one render pass. New uniform `uChromaticUv` (computed from pixel-space offset divided by renderer width). `GameScene` tracks `prevLocalHealth` and `aberrationPixels`; on local-player health decrease, kicks `aberrationPixels` to `CHROMATIC_INITIAL_PIXELS = 6.0`; decays linearly to 0 over `CHROMATIC_DECAY_MS = 250`. Pushed to `crtPipeline.setChromaticPixels()` at the end of each `update()`.

### Step 5: Effects/particles overhaul — DONE

Layered/lingering smoke, gravity debris, ground scorch decals, shockwave shader, bullet tracers + impact sparks + dust puffs + persistent bullet-hole decals. Pool aggressively.

Sequencing:

- **5a — bullet impact sparks + dust puffs — DONE.** New module `client/src/rendering/impact-fx.ts` exporting `ImpactFx`. Two preallocated pools of `Phaser.GameObjects.Image` (sparks: cap 96; dust: cap 48), both back-to-FIFO recycle when full. Two textures baked once at construction (`impact-spark` 4×4 white quad, `impact-dust` 24px soft radial). Hooked from `game-scene.ts:onBulletTrail` after the existing trail/muzzle-flash/lighting calls — bullet angle is computed from `start→end`, then `spawnBulletImpact(x, y, angle, grid)` fires. Wall vs air detected by sampling `collisionGrid.solid` 2 px past the endpoint along the bullet direction. Wall hits get 10 sparks + 4 dust; air hits (player hit, max range) get 5 sparks + no dust. Sparks fan out in a ±100° cone around the reflected (180°) direction with exponential drag; dust drifts in any direction with mild upward bias and damping. Per-frame `update(delta)` driven from `GameScene.update()` after lighting. Destroyed in `cleanup()`. **Zero per-frame allocations** in the hot path — all positions/scales/alphas mutate preallocated images. Depth = 30 (above players, below lighting overlay so ambient still tints them).
  - **Tunables (top of file):** `IMPACT_FX_DEPTH`, `MAX_SPARKS`, `MAX_DUST`, `SPARK_COUNT_WALL`/`SPARK_COUNT_AIR`, `DUST_COUNT_WALL`/`DUST_COUNT_AIR`, `SPARK_LIFE_*`, `SPARK_SPEED_*`, `SPARK_LENGTH_PX`, `SPARK_THICKNESS_PX`, `SPARK_DRAG_PER_S`, `SPARK_SPREAD_RAD`, `DUST_LIFE_*`, `DUST_INITIAL_RADIUS_PX`, `DUST_MAX_RADIUS_PX`, `DUST_INITIAL_ALPHA`, `DUST_RISE_VY`, `DUST_DRIFT_SPEED`, `DUST_DAMPING`, `WALL_SAMPLE_NUDGE_PX`, `SPARK_TINTS`, `DUST_TINTS`.
  - **Decisions diverged from the sketch:** went with custom pooled `Image`s rather than reusing Phaser's `ParticleEmitter` — emitters allocate Particle objects internally and `effects-renderer` already creates a fresh emitter per call (`showHitEffect`, `showExplosion`), which Step 5 explicitly wants to move away from. Wall-vs-air classification done client-side via the collision grid rather than threading new server data through `BulletTrail` (Critical Rule #1: no shared/server changes for visual juice).
- **5b — persistent bullet-hole decals — DONE.** New module `client/src/rendering/decal-renderer.ts` exporting `DecalRenderer`. Single `Phaser.GameObjects.RenderTexture` covering the full playfield (`MAP_WIDTH_PX × MAP_HEIGHT_PX`). One bullet-hole texture baked at construction (16×16 — soft dark radial with a small center punch for the "hole"). One reusable off-display `Image` is the stamp source — re-positioned/rotated/tinted/scaled per stamp, drawn into the RT via `rt.draw(image, x, y)`. Per-stamp randomness on rotation (full 360°), scale (±15%), alpha (0.7–0.95), and tint (3 dark palette colors: `0x2e222f`, `0x3e3546`, `0x45293f`). Hard cap `MAX_DECALS = 512` per match — past the cap, new impacts are silently ignored (no rolling redraw, no removal). Hooked from `game-scene.ts:onBulletTrail` next to the `ImpactFx` call; both use the same shared `sampleIsWall` helper. Destroyed in `cleanup()` (RT teardown clears all decals, which is correct — match ended).
  - **Wall-edge clipping:** decals are clipped to wall pixels via a baked `BitmapMask`. At construction, a `MAP_WIDTH_PX × MAP_HEIGHT_PX` mask texture is generated from the collision grid — white rects on every solid tile, transparent elsewhere — and applied as a bitmap mask on the RT. Stamps near a wall edge still spill into the RT, but the mask hides the spill so they appear clipped to the wall surface. Mask source is an off-display `Image` at origin (0,0). Bake cost paid once; per-stamp cost unaffected. The grid is now passed into the constructor (`new DecalRenderer(scene, grid)`); if grid is null the mask is skipped and decals fall back to unmasked behavior (and `sampleIsWall(null, …)` returns false anyway, so no stamps land).
  - **Tunables (top of file):** `BULLET_HOLE_TEXTURE_RADIUS_PX`, `BULLET_HOLE_GRADIENT_STEPS`, `BULLET_HOLE_CENTER_PUNCH_RATIO`, `BULLET_HOLE_RENDER_RADIUS_PX`, `BULLET_HOLE_ALPHA_MIN`/`MAX`, `BULLET_HOLE_SCALE_MIN`/`MAX`, `BULLET_HOLE_TINTS`, `MAX_DECALS`.
  - **Depth ordering note:** the RT uses no `setDepth` — display-list insertion order does the work. `DecalRenderer` is constructed in `GameScene.create()` immediately after `MapRenderer.renderMap()` and before any player container exists. So at the same default depth, render order is map → decals → players. Documented in the `DecalRenderer` class doc; anything new that needs to slot between map and players in the future should follow the same convention or all three should switch to explicit depths together.
  - **Refactor:** the wall-detection helper `sampleIsWall(grid, x, y, bulletAngle)` was extracted from `impact-fx.ts` into `client/src/rendering/wall-sample.ts` so both renderers share it. `WALL_SAMPLE_NUDGE_PX = 2` lives there.
  - **Decisions diverged from the sketch:** went with a hard cap + drop instead of a rolling buffer. Erasing the oldest stamp from the RT requires a full clear + redraw of all surviving stamps (RT.draw isn't reversible). With deathmatch length bounded and per-match wall-hit count typically <200, a cap of 512 with silent drop is plenty without the redraw cost.
- **5c — explosion debris + scorch decal — DONE.** Two new modules and one extracted helper:
  - **`client/src/rendering/explosion-fx.ts`** — `ExplosionFx` class. Pooled `Phaser.GameObjects.Image` debris (cap 96, FIFO recycle). Single 3×3 white quad texture baked at construction; per-particle random rotation, rotation speed, scale, tint, life. Mixed warm/cold tint palette so the burst reads as hot embers + kicked rubble. `spawnExplosion(x, y)` emits 16 chunks per call. Per-frame `update(deltaMs)` integrates position with exponential drag (slower than spark drag — debris travels further before settling), continuous tumble rotation, alpha decay by life ratio. Replaces the old per-explosion `Phaser.GameObjects.Particles.ParticleEmitter` from `effects-renderer.showExplosion` (that path created/destroyed an emitter per call — main per-explosion alloc source). Depth = 30 (same band as `ImpactFx`).
  - **`client/src/rendering/scorch-renderer.ts`** — `ScorchRenderer` class. Mirrors `DecalRenderer`: single playfield-size `RenderTexture`, baked stamp texture, bitmap-mask clipping. Mask is the **inverse** of the wall mask (floor pixels only) so scorch never bleeds onto walls. Stamp is a larger soft radial than the bullet hole (~22 px visible radius, no center punch — just a smooth darkening). Per-stamp randomness: rotation, scale (±15%), alpha (0.45–0.65), 3 dark palette tints (`0x2e222f`, `0x3e3546`, `0x45293f`). Hard cap `MAX_SCORCH = 64` per match.
  - **`client/src/rendering/grid-mask.ts`** — extracted shared helper `bakeGridMaskTexture(scene, key, grid, wantSolid)`. Used by both `DecalRenderer` (`wantSolid: true` → wall mask) and `ScorchRenderer` (`wantSolid: false` → floor mask). The previous private `bakeWallMaskTexture` in `decal-renderer.ts` was replaced by a call to this helper.
  - **Wiring:** in `game-scene.ts`, `ScorchRenderer` constructed right after `DecalRenderer` (display-list slot: tiles → bullet decals → scorch decals → players). `ExplosionFx` constructed alongside `ImpactFx`. `onGrenadeExploded` now fires four things: existing ring/flash/shake (`effectsRenderer.showExplosion`), existing lighting flash (`lightingRenderer.addExplosionFlash`), new debris burst (`explosionFx.spawnExplosion`), new scorch stamp (`scorchRenderer.addScorch`). `explosionFx.update(delta)` driven from `GameScene.update()` next to `impactFx.update`. Both destroyed in `cleanup()`.
  - **Decisions diverged from the sketch:** kept the existing ring + flash + screen shake in `effects-renderer.showExplosion` and just removed its old `ParticleEmitter` block — those are tween-based one-shots that fit the old "EffectsRenderer" pattern; the new `ExplosionFx` is strictly the pooled-debris piece. Scorch RT depth ordering uses the same insertion-order convention as bullet decals rather than explicit `setDepth`, so future renderers slotting between map and players keep following one consistent rule.
- **5d — layered/lingering smoke — DONE.** New module `client/src/rendering/smoke-fx.ts` exporting `SmokeFx`. Pooled `Phaser.GameObjects.Image` puffs (cap 64, FIFO recycle, 8 puffs per detonation). One soft cubic-falloff puff texture baked at construction (32 px radius, 16 gradient steps — softer than the dust/scorch quadratic so big puffs don't ring at the edge). Each puff: random spawn jitter (±14 px), random outward drift (8–30 px/s) + constant upward bias (`SMOKE_RISE_VY = -10`), exponential drag (`SMOKE_DRAG_PER_S = 0.6`, slower than debris so puffs barely move), slow tumble rotation (±0.4 rad/s), random life 1.4–2.4 s, random tint from a warm tan + cool grey palette. **Asymmetric alpha curve** — fast fade-in to `SMOKE_PEAK_ALPHA = 0.4` over the first 18% of life, then linear fade-out for the rest. **Additive blend** (`Phaser.BlendModes.ADD`) per the plan note — reads as atmospheric dust catching the explosion's afterglow rather than dense opaque smoke. Conservative peak alpha keeps it from blowing out under the bloom postFX. Hooked from `onGrenadeExploded` next to `explosionFx.spawnExplosion`/`scorchRenderer.addScorch`. Per-frame `update(delta)` driven from `GameScene.update()` next to the other particle updates. Destroyed in `cleanup()`. Depth = 28 (just below debris at 30, well below lighting at 100 so ambient still tints).
  - **Tunables (top of file):** `SMOKE_FX_DEPTH`, `SMOKE_TEXTURE_RADIUS_PX`, `SMOKE_GRADIENT_STEPS`, `MAX_SMOKE`, `SMOKE_PUFFS_PER_EXPLOSION`, `SMOKE_LIFE_MIN_MS`/`MAX_MS`, `SMOKE_INITIAL_RADIUS_PX`/`FINAL_RADIUS_PX`, `SMOKE_PEAK_ALPHA`, `SMOKE_ALPHA_PEAK_T`, `SMOKE_DRIFT_SPEED_MIN`/`MAX`, `SMOKE_RISE_VY`, `SMOKE_DRAG_PER_S`, `SMOKE_ROTATION_SPEED_MAX`, `SMOKE_SPAWN_JITTER_PX`, `SMOKE_TINTS`.
  - **Decisions diverged from the sketch:** went with additive blend + warm tints rather than normal-blend dark grey because the dusty wasteland palette and existing bloom postFX make additive read as "dust catching warm light" — atmospheric for the wasteland — while opaque dark smoke would just look muddy. If the bloom interaction ends up too bright in practice, lower `SMOKE_PEAK_ALPHA` first; if you actually want occluding smoke, change the puff `setBlendMode` call to `Phaser.BlendModes.NORMAL` and bump alpha.
- **5e — shockwave shader — DONE.** Radial UV displacement ring on detonation, **baked into the existing `CrtPipeline`** rather than a second post pipeline — same precedent as 4d's chromatic aberration ("3 samples in one pass beats two passes"). Shader extension and a small CPU-side controller:
  - **`client/src/rendering/post-fx/crt-pipeline.ts`** — added uniform arrays `uShockOrigins[4]` (vec2 pixel coords), `uShockRadii[4]` (px), `uShockStrengths[4]` (px), plus `uShockThickness` and `uResolution`. Loop bound is hard-coded `4` to match `MAX_SHOCKWAVES` exported from JS (WebGL ES 1.0 requires constant loop bounds; comment flags the coupling). Fragment shader runs the displacement loop **first** so chromatic aberration / vignette / scanlines all sample at the displaced UV — keeps the CRT treatment coherent across the warp. Inactive slots carry `strength = 0` so the loop runs in constant time on every pixel without branching. Pipeline pre-allocates three `Float32Array` staging buffers (8/4/4 floats) and exposes `setShockwaves(originsXY, radii, strengths)` to refill them in place. Pushed in `onPreRender()` via `set2fv` / `set1fv` next to the existing chromatic-aberration uniform push. `MAX_SHOCKWAVES = 4` and `SHOCKWAVE_THICKNESS_PX = 24` exported as the public knobs.
  - **`client/src/rendering/post-fx/shockwave-controller.ts`** — new `ShockwaveController` class. Pre-allocated pool of 4 shockwave slots (FIFO recycle when full so the most recent detonation always lands). `trigger(x, y)` registers a new wave; `update(deltaMs, pipeline)` ages every slot, computes per-wave radius (lerp 0 → 192 px with ease-out cubic) and strength (linear fade from 12 px peak), packs the staging Float32Arrays, and calls `pipeline.setShockwaves(...)`. Inactive slots get `strength = 0` and `radius = 0`. Zero per-frame allocations.
  - **Wiring:** in `game-scene.ts`, controller constructed alongside the other particle subsystems, triggered from `onGrenadeExploded` next to the smoke / debris / scorch calls, updated each frame next to `crtPipeline.setChromaticPixels(...)`. Cleanup just nulls the reference (no Phaser objects own; the pipeline is torn down by the existing `cameras.main.resetPostPipeline()` in `cleanup()`).
  - **Tunables (top of `shockwave-controller.ts`):** `SHOCKWAVE_DURATION_MS`, `SHOCKWAVE_FINAL_RADIUS_PX`, `SHOCKWAVE_PEAK_STRENGTH_PX`. Plus `MAX_SHOCKWAVES`, `SHOCKWAVE_THICKNESS_PX` in `crt-pipeline.ts`.
  - **Decisions diverged from the sketch:** explicitly rejected the built-in `addBarrel` swept route — barrel distortion is whole-screen and uniform, not a traveling ring; not the right effect. Bake-into-CrtPipeline chosen over a second post pipeline because it's the project's established precedent (4d) and saves a render pass on mobile. Constant-time loop with strength = 0 sentinel chosen over conditional `continue` to avoid branch divergence on older mobile GPUs.
  - **Bug fix (caught during Step 6):** the displacement ring was rendering at the vertical mirror of the explosion location — a grenade in the upper playfield warped the lower half of the screen, and vice versa. Phaser's PostFX vertex buffer maps `outTexCoord.y = 0` to the screen BOTTOM and `= 1` to the TOP (verified in `node_modules/.../PostFXPipeline.js` vertex array), but the game/world Y has 0 at the TOP. The shader did `pixelPos = outTexCoord * uResolution` and then compared `pixelPos` against `uShockOrigins` (world coords), so the Y axes were flipped. The other CRT effects all masked the bug — vignette uses `outTexCoord - 0.5` (symmetric), scanlines use `sin²` (symmetric), chromatic aberration only does `texture2D` sampling (which Phaser sets up correctly). Fix is one shader line in `crt-pipeline.ts`: `vec2 pixelPos = vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uResolution;`. X axis is consistent (left = 0 in both spaces) so only Y gets flipped.

Pooling strategy: every per-frame allocator for transient particles (sparks, debris, dust, smoke) goes through a typed pool. No new allocations in the hot path after warmup.

### Step 6: Camera/game-feel juice — DONE

Directional camera kick on shooting, zoom-pulse on explosions, camera roll on heavy damage. **Hit-stop is already shipped as part of Step 4c** (the kill-juice freeze) — Step 6 won't re-add it.

**N/A for this game — "smoothed follow with deadzone":** the original Step 6 sketch listed it, but the playfield (`MAP_WIDTH_PX × MAP_HEIGHT_PX = 960 × 576`) fits entirely in the viewport, so the camera doesn't scroll and there's nothing to follow. `lighting-renderer.ts` comments confirm "camera doesn't scroll, so screen and world coords coincide" — that assumption is load-bearing across multiple modules (lighting RT positioning, decal RT positioning, all in-world particle x/y math). Skip this sub-step; if a larger map ever ships, revisit then.

**Critical constraint for all 6x:** every camera tweak must be a transient visual offset/zoom/rotation that decays back to neutral. Do **not** introduce sustained camera mode changes (no permanent zoom, no `cameras.main.startFollow`, no fixed offset). Many modules assume world coords == screen coords; a sustained transform would silently break lighting, decals, and particle alignment.

Sequencing:

- **6a — directional camera kick on shooting — DONE.** New module `client/src/rendering/camera-kick.ts` exporting `CameraKick`. State is three numbers — `elapsedMs`, `dirX`, `dirY` — and the class owns no Phaser objects. `trigger(reverseAngle)` snaps `elapsedMs` back to 0 and stores the unit direction; `update(deltaMs, camera)` advances elapsed, computes `(1 - t)²` ease-out, and pushes `camera.setScroll(dirX * peak * remaining, dirY * peak * remaining)` each frame until `elapsedMs >= KICK_DURATION_MS`, at which point it forces scroll back to (0, 0) once and short-circuits. `reset(camera)` is called from `cleanup()` to guarantee scroll is zeroed across scene transitions. Wired in `game-scene.ts`: constructed alongside `ShockwaveController` in `create()`, updated each frame next to `shockwaveController.update(...)`, triggered from `onBulletTrail` only when `trail.shooterId === networkManager.getPlayerId()` (so remote shots don't jitter your view). The kick angle is `bulletAngle + Math.PI` — recoil pushes the camera back toward the shooter, opposite the bullet's travel.
  - **Tunables (top of file):** `KICK_DURATION_MS = 100`, `KICK_PEAK_PIXELS = 4`.
  - **Typing cleanup:** the `onBulletTrail` handler ref in `game-scene.ts` was previously typed `(trail: any)` with an eslint-disable; it's now properly `(trail: BulletTrail)` (imported from `@shared/types/projectile.js`). The handler param type was already a structural subset; this just tightens the field declaration to match and grants access to `shooterId` without a cast.
  - **HUD anchoring confirmed:** `client/src/ui/hud.ts` calls `.setScrollFactor(0)` on the HUD container plus every text element, so the kick's scroll change passes under the HUD without dragging it.
  - **Decisions diverged from the sketch:** went with `camera.setScroll` rather than a custom transform — the camera doesn't scroll for any other reason in this game, and Phaser's `shake()` (used by `effects-renderer.showExplosion`) operates on a separate render-time offset, so there's no conflict. Each new shot overrides the in-flight kick (resets `elapsedMs` to 0, replaces direction) rather than accumulating, which keeps the 3-round burst snappy instead of stacking into a sustained drift.
- **6b — zoom-pulse on explosions — DONE.** New module `client/src/rendering/zoom-pulse.ts` exporting `ZoomPulse`. Single-number state (`elapsedMs`); `trigger()` resets to 0; `update(deltaMs, camera)` advances and pushes `camera.setZoom(1 + (peak - 1) * pulse)`. Pulse curve is asymmetric: linear ramp 0 → 1 over the first `ZOOM_PULSE_ATTACK_T = 0.15` of duration (snap attack), then ease-out quad 1 → 0 over the remaining 85% (settle). Reads as a punch, not a wobble. `reset(camera)` zeros zoom from `cleanup()`. Wired in `game-scene.ts`: instantiated alongside `CameraKick` in `create()`, triggered from `onGrenadeExploded` next to the other detonation effects, updated each frame in `update()` next to `cameraKick.update(...)`.
  - **Tunables (top of file):** `ZOOM_PULSE_DURATION_MS = 200`, `ZOOM_PULSE_PEAK = 1.04`, `ZOOM_PULSE_ATTACK_T = 0.15`.
  - **Composition with existing `cameras.main.shake(200, 0.01)`** from `effects-renderer.showExplosion`: confirmed clean — Phaser's shake adds a separate render-time positional jitter (`_shakeOffsetX/Y` internal), independent of `setZoom`. Both run their own decay simultaneously.
- **6c — camera roll on heavy damage — DONE.** New module `client/src/rendering/camera-roll.ts` exporting `CameraRoll` and the `ROLL_DAMAGE_THRESHOLD = 20` constant. State is `elapsedMs` + `signedPeak`; `trigger()` picks a random sign per hit (so consecutive heavy hits don't always rock the same direction), stores `±ROLL_PEAK_RADIANS`, and resets elapsed. `update(deltaMs, camera)` advances elapsed and pushes `camera.setRotation(signedPeak * (1 - t)²)` until done, then idempotently snaps to 0 once. Detection extends the existing `prevLocalHealth` block in `GameScene.update()` — same conditional that drives chromatic aberration. Tiny chip damage gets only the aberration; HP loss ≥ `ROLL_DAMAGE_THRESHOLD` in one tick adds the roll.
  - **Tunables (top of file):** `ROLL_DURATION_MS = 250`, `ROLL_PEAK_RADIANS` (= 2.5°), `ROLL_DAMAGE_THRESHOLD = 20`. The threshold is exported because the trigger condition lives in `game-scene.ts`.
  - **TS quirk:** Phaser's `Camera` class type doesn't expose a readable `rotation` property (only `setRotation` / `setAngle` setters), so the idempotent guard tracks `signedPeak !== 0` internally instead of reading `camera.rotation`. Same outcome, no type cast.

Pooling: not relevant — these are zero-allocation tween-style effects on `cameras.main` itself. Phaser's tween system is fine here; not on the hot path.

Hook-point inventory (already in `game-scene.ts`):
- `onBulletTrail` — fires for every bullet, local + remote. The local-player check is `trail.shooterId === networkManager.getPlayerId()`. Use this to gate the kick.
- `onGrenadeExploded` — fires for every detonation. Already drives 4 effects (ring/flash/shake, lighting flash, debris, smoke, scorch, shockwave); zoom-pulse just adds one more.
- Local-health decrease detection — already in `update()`, kicks `aberrationPixels`. Extend the same conditional for the roll.

## Key files

**Already in place (read first to understand the current state):**

- `shared/src/config/palette.ts` — palette source of truth
- `client/src/scenes/boot-scene.ts` — loads sprite sheets, creates animations, generates procedural fallbacks for grenade/bullet/explosion/particle
- `client/src/rendering/player-renderer.ts` — directional sprites, idle/run anim switching, scale 3×
- `client/src/rendering/map-renderer.ts` — tileset slicing (`TILE_FRAMES` indices are TUNABLE — guesses for floor=32, wall=4, cover=100)
- `client/src/rendering/sprite-direction.ts` — `bucketAimAngle()` helper
- `client/src/rendering/effects-renderer.ts` — muzzle flash, explosion, hit flash, damage numbers, pickup sparkle (THIS IS WHERE STEP 5 PARTICLES HOOK IN)
- `client/src/rendering/lighting-renderer.ts` — additive darkness overlay + radial light cut-outs (Step 3)
- `client/src/rendering/kill-juice.ts` — kill flash + freeze-frame (Step 4c)
- `client/src/rendering/impact-fx.ts` — bullet impact sparks + dust puffs, pooled (Step 5a)
- `client/src/rendering/decal-renderer.ts` — persistent bullet-hole decals on a single RenderTexture, hard cap 512/match (Step 5b)
- `client/src/rendering/wall-sample.ts` — `sampleIsWall(grid, x, y, bulletAngle)` shared by impact-fx and decal-renderer (extracted in Step 5b)
- `client/src/rendering/explosion-fx.ts` — pooled debris burst on grenade detonation (Step 5c)
- `client/src/rendering/scorch-renderer.ts` — persistent floor scorch decals on detonation, hard cap 64/match (Step 5c)
- `client/src/rendering/grid-mask.ts` — shared `bakeGridMaskTexture(scene, key, grid, wantSolid)` used by both decal renderers (extracted in Step 5c)
- `client/src/rendering/smoke-fx.ts` — pooled lingering smoke puffs on detonation, additive blend (Step 5d)
- `client/src/rendering/post-fx/shockwave-controller.ts` — CPU lifecycle for shockwave displacement; pushes uniforms into `CrtPipeline` (Step 5e)
- `client/src/rendering/camera-kick.ts` — transient directional camera offset on local-player shots; decays back to (0, 0) over 100 ms (Step 6a)
- `client/src/rendering/zoom-pulse.ts` — transient zoom punch on grenade detonation; snap attack + ease-out decay, peak 1.04 over 200 ms (Step 6b)
- `client/src/rendering/camera-roll.ts` — transient camera rotation on heavy local-player damage (≥ 20 HP in a tick); ±2.5° peak, ease-out decay over 250 ms (Step 6c)
- `client/src/rendering/post-fx/crt-pipeline.ts` — chromatic aberration + vignette + scanlines shader (Steps 4a, 4d)
- `client/src/rendering/post-fx/bloom-config.ts` — Phaser built-in bloom tunables (Step 4b)
- `client/src/scenes/game-scene.ts` — owns the game update loop; lighting renderer / kill juice / pipeline lifecycle plug in here
- `client/src/ui/layout.ts` — `MAP_WIDTH_PX`, `MAP_HEIGHT_PX` for overlay sizing

**Don't touch unless necessary:**
- `shared/**` — Critical Rule #1 from CLAUDE.md: shared physics are sacred. Visual effects are client-only.
- Anything under `server/`.

**Reference:**
- `IDEAS.md` (project root) — parking lot of deferred work, polish backlog, AI-asset future direction
- `CLAUDE.md` (project root) — project conventions, tech stack, critical rules

## Constraints to respect

- **Don't break the tick loop** (CLAUDE.md). Effects run at frame rate not tick rate, but stay under frame budget.
- **Mobile is first-class.** Touch joysticks, responsive layout, mobile GPU constraints. Verify in Chrome devtools mobile emulation before declaring done.
- **No 'any', strict TypeScript.** Discriminated unions for new types.
- **Visual juice stays client-side.** Don't add server events for things the client can detect from existing snapshots (kill juice and chromatic aberration both detect from `isDead` and `health` transitions in already-streamed player state).

## Long-term direction

User wants to eventually replace TheLazyStone assets with custom Mighty Man-specific art generated via AI (Stable Diffusion + Aseprite cleanup). Maintain palette compatibility via the deferred LUT shader. The current pack is a stepping-stone baseline.
