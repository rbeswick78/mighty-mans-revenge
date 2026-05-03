# Ideas Parking Lot

A scratchpad for ideas we don't want to lose but aren't acting on yet. Add freely; promote to issues / user stories when ready to actually build.

---

## Maps

- **Themed maps tied to palette/biome variants.** The first map will be Dusty Desert Wasteland. Once the engine and asset pipeline support it, additional maps could lean into other post-apocalyptic moods — e.g. wet urban decay (mildew + sodium lamps), nuclear winter (ash + steel blue), toxic/radioactive (sickly green + hazard orange). Each theme would get its own tile set, lighting tone, and possibly LUT.

## Polish backlog

- ~~**Recolor lobby and results scenes to the wasteland palette.**~~ **DONE 2026-05-03.** `lobby-scene.ts` and `results-scene.ts` now read every color from `Wasteland` slots via `cssHex()`. Brand accent unified on `LOADING_BAR_FILL` (hot orange) — same color the boot loading bar already uses, so boot → lobby reads as one continuous brand. Secondary buttons on `WALL_FILL` (concrete grey). Tunables grouped at the top of each scene file.
- **LUT (color-grading) shader for palette enforcement.** Originally sub-task of the palette step; deferred because all current art is procedural and already on-palette by construction. Pick this up when integrating real sprite assets — a small fragment shader that maps each rendered pixel to its nearest Resurrect-64 entry guarantees consistency even if a pack or AI-generated sprite ships slightly off. Implement as a Phaser pipeline shader using `RESURRECT_64` from `shared/src/config/palette.ts`.

## Art enrichment (deferred from asset integration v1)

V1 asset integration shipped a static-frame baseline: 4-direction idle sprites for player and enemy, one floor/wall/cover frame from the bleak-yellow tileset, and pickup crates. Lots of quality wins were intentionally left for later passes.

- ~~**Tile variants for visual noise.**~~ **DONE 2026-05-03** (with significant scope expansion). Shipped: random-variant pool with deterministic per-cell hash for floor + cover; outer-wall (perimeter) auto-tile against the new brick tileset (`tiles/brick-wall.png`, 6×3 frames); inner-wall directional auto-tile against the iron-fence tileset (`tiles/iron-fence.png`, 3×4 frames) with corners-by-neighbor-mask + edges-by-trace-for-corner + map-center fallback; grenade scorch as a single-tile frame swap (replaces the old `ScorchRenderer` soft RT overlay, which is unhooked but kept in the repo for easy revert); inner-wall cells render a floor variant FIRST then the iron-fence on top so the floor pattern continues through transparent fence gaps; map JSON edited to convert 8 diagonal `COVER_LOW` tiles to `WALL` and add 4 new corner walls in the spawn corners (intentional gameplay change — corners were previously walk-throughable). Architecture in `client/src/rendering/map-renderer.ts`. New debug tool: `client/src/scenes/tile-picker-scene.ts` displays any registered tileset with frame indices labeled — accessible via `?tilepicker`, `?tilepicker=brick`, `?tilepicker=iron`, `?tilepicker=fence`.
- **Iron-fence end-cap frame.** Currently 1-neighbor end-caps fall through to top/bottom-wall via the propagation rule, which works but isn't a "true" end-cap shape. Frames 4, 6, 7, 8 of `tiles_iron_fence` are unused — if any is a center/end-cap fill, wire it in.
- **Wire-fence destructible gate.** `tiles/wire-fence-closing-no-lock.png` is a 7-frame closing animation (21×22 frames). Loaded into `tiles_wire_fence_closing` and previewable via `?tilepicker=fence` but unused at gameplay layer. Could become a destructible/openable doorway feature — needs a new tile type and gameplay state machine.
- **Cover sprite proper.** `COVER_LOW` still uses bleak chunky-stone variants; the asset pack has dedicated cover/sandbag/barricade props that would read more like cover than wall.
- **Weapon overlays.** Pack ships layered weapon sprites (Pistol, Gun, Shotgun, Bat) in 4 directions with shoot/reload/idle animations. Combine with `Character/Main/*_no-hands` variants for proper "character holds gun" rendering.
- **Death animations.** 3 death variations per direction in `Character/Main/Death/` — way more impactful than the current red flash + alpha fade.
- **Muzzle flash sprites.** `Character/Guns/Fire/Fire_*-Sheet3.png` — 3-frame muzzle flash per direction. Replace the procedural circle in `effects-renderer.showMuzzleFlash`.
- **Map decoration.** Pack has rich props: cars (normal/rust/overgrown variants), barrels, fences, buildings, signs, nature (rocks, dead trees in bleak-yellow palette). Map data format would need to grow to support decorative props (non-collision overlays).
- **Custom AI-generated assets.** Long-term direction per user — once the integrated baseline is dialed in, generate Mighty Man-specific art via AI tooling (Stable Diffusion + Aseprite cleanup) for the player character, signature enemies, and unique map elements. Maintain palette compatibility via the deferred LUT shader.
