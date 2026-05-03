import Phaser from 'phaser';

import type { CollisionGrid } from '@shared/types/map.js';
import { MAP_HEIGHT_PX, MAP_WIDTH_PX } from '../ui/layout.js';
import { bakeGridMaskTexture } from './grid-mask.js';

/**
 * Persistent scorch decals on the floor at every grenade detonation.
 * Mirrors `DecalRenderer` (single playfield-size RenderTexture, baked
 * stamp texture, bitmap-mask clipping) but masked to FLOOR pixels (the
 * inverse of the wall mask) and tuned for a larger, softer dark blot.
 *
 * **Hard cap** of `MAX_SCORCH` stamps per match. Past the cap, new
 * detonations are silently ignored. Explosions are far rarer than bullet
 * impacts, so the cap is generous.
 *
 * **Depth ordering** is by display-list insertion (no `setDepth`):
 *   - Map tiles are added first (in `MapRenderer.renderMap`).
 *   - The bullet-hole `DecalRenderer` is added next.
 *   - This RT is added next, so scorch sits above bullet decals (which
 *     don't overlap anyway since the masks are inverses).
 *   - Player containers are added later (when network state arrives).
 */

// --- Tunables ---------------------------------------------------------------

const SCORCH_TEXTURE_KEY = 'scorch-blot';
const FLOOR_MASK_TEXTURE_KEY = 'scorch-floor-mask';

// Source texture geometry. Larger soft radial than the bullet hole — a
// scorch is a wide darkening, not a punctual hole. No center punch; the
// blot is uniformly soft.
const SCORCH_TEXTURE_RADIUS_PX = 28;
const SCORCH_GRADIENT_STEPS = 14;

// Visible blot radius. Roughly one tile wide (~22 px ≈ tile/2).
const SCORCH_RENDER_RADIUS_PX = 22;

const SCORCH_ALPHA_MIN = 0.45;
const SCORCH_ALPHA_MAX = 0.65;
const SCORCH_SCALE_MIN = 0.85;
const SCORCH_SCALE_MAX = 1.15;

// Dark on-palette tints (RESURRECT_64 darks). Same family as bullet holes
// so the world has a consistent "burn/wear" tone.
const SCORCH_TINTS: readonly number[] = [0x2e222f, 0x3e3546, 0x45293f];

const MAX_SCORCH = 64;

// --- Class ------------------------------------------------------------------

export class ScorchRenderer {
  private readonly scene: Phaser.Scene;
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly stampImage: Phaser.GameObjects.Image;
  private readonly maskImage: Phaser.GameObjects.Image | null;
  private stampCount = 0;
  private readonly baseScale: number;

  constructor(scene: Phaser.Scene, grid: CollisionGrid | null) {
    this.scene = scene;
    bakeScorchTexture(
      scene,
      SCORCH_TEXTURE_KEY,
      SCORCH_TEXTURE_RADIUS_PX,
      SCORCH_GRADIENT_STEPS,
    );

    this.rt = scene.add.renderTexture(0, 0, MAP_WIDTH_PX, MAP_HEIGHT_PX);
    this.rt.setOrigin(0, 0);

    this.stampImage = scene.make.image(
      { x: 0, y: 0, key: SCORCH_TEXTURE_KEY, add: false },
      false,
    );
    this.baseScale = SCORCH_RENDER_RADIUS_PX / SCORCH_TEXTURE_RADIUS_PX;

    if (grid) {
      // wantSolid = false → mask covers floor pixels; scorch is hidden
      // wherever a wall is, so it never bleeds onto walls.
      bakeGridMaskTexture(scene, FLOOR_MASK_TEXTURE_KEY, grid, false);
      this.maskImage = scene.make.image(
        { x: 0, y: 0, key: FLOOR_MASK_TEXTURE_KEY, add: false },
        false,
      );
      this.maskImage.setOrigin(0, 0);
      this.rt.setMask(this.maskImage.createBitmapMask());
    } else {
      this.maskImage = null;
    }
  }

  /**
   * Stamp a scorch blot at a detonation point. No-op past the per-match
   * cap. The floor mask hides any portion that would land on a wall.
   */
  addScorch(x: number, y: number): void {
    if (this.stampCount >= MAX_SCORCH) return;

    const scale =
      this.baseScale *
      (SCORCH_SCALE_MIN + Math.random() * (SCORCH_SCALE_MAX - SCORCH_SCALE_MIN));
    const alpha =
      SCORCH_ALPHA_MIN + Math.random() * (SCORCH_ALPHA_MAX - SCORCH_ALPHA_MIN);

    this.stampImage.setRotation(Math.random() * Math.PI * 2);
    this.stampImage.setScale(scale);
    this.stampImage.setAlpha(alpha);
    this.stampImage.setTint(
      SCORCH_TINTS[Math.floor(Math.random() * SCORCH_TINTS.length)],
    );

    this.rt.draw(this.stampImage, x, y);
    this.stampCount++;
  }

  destroy(): void {
    this.rt.clearMask(true);
    this.stampImage.destroy();
    if (this.maskImage) {
      this.maskImage.destroy();
    }
    this.rt.destroy();
    if (this.scene.textures.exists(SCORCH_TEXTURE_KEY)) {
      this.scene.textures.remove(SCORCH_TEXTURE_KEY);
    }
    if (this.scene.textures.exists(FLOOR_MASK_TEXTURE_KEY)) {
      this.scene.textures.remove(FLOOR_MASK_TEXTURE_KEY);
    }
  }
}

// --- Helpers ----------------------------------------------------------------

function bakeScorchTexture(
  scene: Phaser.Scene,
  key: string,
  radius: number,
  steps: number,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Quadratic radial fade — soft edge, no center punch (a scorch is a
  // smooth darkening, not a sharp hole).
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const alpha = (1 - t) * (1 - t);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(radius, radius, radius * t);
  }
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
}
