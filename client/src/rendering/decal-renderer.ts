import Phaser from 'phaser';

import type { CollisionGrid } from '@shared/types/map.js';
import { MAP_HEIGHT_PX, MAP_WIDTH_PX } from '../ui/layout.js';
import { bakeGridMaskTexture } from './grid-mask.js';
import { sampleIsWall } from './wall-sample.js';

/**
 * Persistent bullet-hole decals on walls. A single RenderTexture covers
 * the playfield; every wall impact stamps one bullet-hole sprite onto it
 * with random rotation, tint, and scale for variety. Stamps are never
 * cleared during a match.
 *
 * **Wall clipping** uses a baked `BitmapMask` whose alpha mirrors the
 * collision grid — solid tiles are opaque, everything else transparent.
 * Stamps may spill across the wall edge into the RT, but the mask hides
 * the spillage at render time. Bake cost is paid once at construction;
 * per-stamp cost is unaffected.
 *
 * **Hard cap** of `MAX_DECALS` stamps per match. Past the cap, new impacts
 * are silently ignored — the visible state stays whatever the wall looked
 * like at cap. A 1v1 deathmatch with even very busy fire stays well under
 * 512 wall hits, so visible loss is unlikely; the cap is a safety belt
 * against pathological cases (long matches, ammo pickup spam).
 *
 * **Depth ordering** is by display-list insertion, not explicit setDepth:
 *   - Map tiles are added first (in `MapRenderer.renderMap`).
 *   - This RT is added next, so it renders above the tiles.
 *   - Player containers are added later (when network state arrives), so
 *     they render above this RT.
 * Anything that needs to render between map and players in the future
 * should also rely on insertion order (or all three should switch to
 * explicit depths together).
 */

// --- Tunables ---------------------------------------------------------------

const BULLET_HOLE_TEXTURE_KEY = 'decal-bullet-hole';
const WALL_MASK_TEXTURE_KEY = 'decal-wall-mask';

// Source texture geometry. The bake produces a soft dark radial with a
// small fully-opaque center punch so the stamp reads as "hole + chipped
// material around it" rather than a flat dot.
const BULLET_HOLE_TEXTURE_RADIUS_PX = 8;
const BULLET_HOLE_GRADIENT_STEPS = 8;
const BULLET_HOLE_CENTER_PUNCH_RATIO = 0.22;

// Visible size on screen — at MAP.TILE_SIZE = 48 px, a 5 px hole reads
// well without dominating the wall.
const BULLET_HOLE_RENDER_RADIUS_PX = 5;

// Per-stamp randomness.
const BULLET_HOLE_ALPHA_MIN = 0.7;
const BULLET_HOLE_ALPHA_MAX = 0.95;
const BULLET_HOLE_SCALE_MIN = 0.85;
const BULLET_HOLE_SCALE_MAX = 1.15;

// Dark palette tints (all from RESURRECT_64) so decals stay on-palette.
const BULLET_HOLE_TINTS: readonly number[] = [0x2e222f, 0x3e3546, 0x45293f];

const MAX_DECALS = 512;

// --- Class ------------------------------------------------------------------

export class DecalRenderer {
  private readonly scene: Phaser.Scene;
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly stampImage: Phaser.GameObjects.Image;
  private readonly maskImage: Phaser.GameObjects.Image | null;
  private stampCount = 0;
  private readonly baseScale: number;

  constructor(scene: Phaser.Scene, grid: CollisionGrid | null) {
    this.scene = scene;
    bakeBulletHoleTexture(
      scene,
      BULLET_HOLE_TEXTURE_KEY,
      BULLET_HOLE_TEXTURE_RADIUS_PX,
      BULLET_HOLE_GRADIENT_STEPS,
      BULLET_HOLE_CENTER_PUNCH_RATIO,
    );

    this.rt = scene.add.renderTexture(0, 0, MAP_WIDTH_PX, MAP_HEIGHT_PX);
    this.rt.setOrigin(0, 0);
    // No setDepth — see class doc for the insertion-order ordering scheme.

    // Off-display image used only as the stamp source. Positioned and
    // styled per stamp. Re-used forever — never destroyed except on
    // teardown.
    this.stampImage = scene.make.image(
      { x: 0, y: 0, key: BULLET_HOLE_TEXTURE_KEY, add: false },
      false,
    );
    this.baseScale = BULLET_HOLE_RENDER_RADIUS_PX / BULLET_HOLE_TEXTURE_RADIUS_PX;

    if (grid) {
      bakeGridMaskTexture(scene, WALL_MASK_TEXTURE_KEY, grid, true);
      // BitmapMask reads alpha from the source's rendered framebuffer at
      // the source's transform. Origin (0,0) at world (0,0) aligns the
      // mask with the RT pixel-for-pixel since the camera doesn't scroll.
      this.maskImage = scene.make.image(
        { x: 0, y: 0, key: WALL_MASK_TEXTURE_KEY, add: false },
        false,
      );
      this.maskImage.setOrigin(0, 0);
      this.rt.setMask(this.maskImage.createBitmapMask());
    } else {
      this.maskImage = null;
    }
  }

  /**
   * Stamp a bullet hole at the impact point if it landed on a wall. No-op
   * when off-wall or once the per-match cap is reached.
   */
  addBulletHoleIfWall(
    x: number,
    y: number,
    bulletAngle: number,
    grid: CollisionGrid | null,
  ): void {
    if (this.stampCount >= MAX_DECALS) return;
    if (!sampleIsWall(grid, x, y, bulletAngle)) return;

    const scale =
      this.baseScale *
      (BULLET_HOLE_SCALE_MIN +
        Math.random() * (BULLET_HOLE_SCALE_MAX - BULLET_HOLE_SCALE_MIN));
    const alpha =
      BULLET_HOLE_ALPHA_MIN +
      Math.random() * (BULLET_HOLE_ALPHA_MAX - BULLET_HOLE_ALPHA_MIN);

    this.stampImage.setRotation(Math.random() * Math.PI * 2);
    this.stampImage.setScale(scale);
    this.stampImage.setAlpha(alpha);
    this.stampImage.setTint(
      BULLET_HOLE_TINTS[Math.floor(Math.random() * BULLET_HOLE_TINTS.length)],
    );

    this.rt.draw(this.stampImage, x, y);
    this.stampCount++;
  }

  destroy(): void {
    // clearMask(true) destroys the BitmapMask object itself.
    this.rt.clearMask(true);
    this.stampImage.destroy();
    if (this.maskImage) {
      this.maskImage.destroy();
    }
    this.rt.destroy();
    if (this.scene.textures.exists(BULLET_HOLE_TEXTURE_KEY)) {
      this.scene.textures.remove(BULLET_HOLE_TEXTURE_KEY);
    }
    if (this.scene.textures.exists(WALL_MASK_TEXTURE_KEY)) {
      this.scene.textures.remove(WALL_MASK_TEXTURE_KEY);
    }
  }
}

// --- Helpers ----------------------------------------------------------------

function bakeBulletHoleTexture(
  scene: Phaser.Scene,
  key: string,
  radius: number,
  steps: number,
  centerPunchRatio: number,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Soft dark radial: concentric circles outer→inner with quadratic
  // alpha so the edge feathers without a visible ring.
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const alpha = (1 - t) * (1 - t);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(radius, radius, radius * t);
  }
  // Center punch — small opaque disk for the actual "hole".
  g.fillStyle(0xffffff, 1);
  g.fillCircle(radius, radius, Math.max(1, radius * centerPunchRatio));
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
}
