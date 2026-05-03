import Phaser from 'phaser';

import type { Vec2 } from '@shared/types/common.js';
import { Wasteland } from '@shared/config/palette.js';
import { MAP_WIDTH_PX, MAP_HEIGHT_PX } from '../ui/layout.js';

const AMBIENT_DARKNESS_ALPHA = 0.20;

// Above gameplay sprites (0–50) and below the death/countdown overlays at
// 2000. The HUD strip sits below the playfield rect, so its 500–2000 depth
// range never composites against this overlay.
const LIGHTING_DEPTH = 100;

// One master radial-gradient texture is baked at construction; each light
// kind reuses it via setScale/setAlpha. Bake big so the largest light
// (explosion) doesn't visibly upscale.
const LIGHT_TEXTURE_KEY = 'lighting-light';
const LIGHT_TEXTURE_RADIUS = 128;
const LIGHT_GRADIENT_STEPS = 24;

const MUZZLE_FLASH_RADIUS = 60;
const MUZZLE_FLASH_DURATION_MS = 80;

const EXPLOSION_FLASH_RADIUS = 150;
const EXPLOSION_FLASH_DURATION_MS = 200;

const PICKUP_GLOW_RADIUS = 40;
const PICKUP_GLOW_BASE_ALPHA = 0.45;
const PICKUP_GLOW_PULSE_AMPLITUDE = 0.20;
const PICKUP_GLOW_PULSE_PERIOD_MS = 1200;

interface TimedLight {
  x: number;
  y: number;
  radius: number;
  durationMs: number;
  elapsedMs: number;
}

/**
 * Additive darkness overlay over the playfield. A render texture is filled
 * with an ambient dark tint each frame, then light sources erase soft
 * cut-outs through it so the underlying scene shows brightly. Camera doesn't
 * scroll, so screen and world coords coincide.
 */
export class LightingRenderer {
  private rt: Phaser.GameObjects.RenderTexture;
  private lightImage: Phaser.GameObjects.Image;
  private timedLights: TimedLight[] = [];
  private elapsedMs = 0;

  constructor(scene: Phaser.Scene) {
    this.rt = scene.add.renderTexture(0, 0, MAP_WIDTH_PX, MAP_HEIGHT_PX);
    this.rt.setOrigin(0, 0);
    this.rt.setDepth(LIGHTING_DEPTH);
    this.rt.setAlpha(AMBIENT_DARKNESS_ALPHA);

    bakeLightTexture(scene, LIGHT_TEXTURE_KEY, LIGHT_TEXTURE_RADIUS, LIGHT_GRADIENT_STEPS);
    // Off-display image used only as the erase source. Re-positioned and
    // re-scaled per light per frame.
    this.lightImage = scene.make.image(
      { x: 0, y: 0, key: LIGHT_TEXTURE_KEY, add: false },
      false,
    );
  }

  addMuzzleFlash(x: number, y: number): void {
    this.timedLights.push({
      x,
      y,
      radius: MUZZLE_FLASH_RADIUS,
      durationMs: MUZZLE_FLASH_DURATION_MS,
      elapsedMs: 0,
    });
  }

  addExplosionFlash(x: number, y: number): void {
    this.timedLights.push({
      x,
      y,
      radius: EXPLOSION_FLASH_RADIUS,
      durationMs: EXPLOSION_FLASH_DURATION_MS,
      elapsedMs: 0,
    });
  }

  update(activePickupPositions: Vec2[], deltaMs: number): void {
    this.elapsedMs += deltaMs;

    this.rt.clear();
    this.rt.fill(Wasteland.CANVAS_BG, 1);

    // Decay & emit timed lights; drop expired ones via in-place compaction.
    let writeIdx = 0;
    for (let i = 0; i < this.timedLights.length; i++) {
      const light = this.timedLights[i];
      light.elapsedMs += deltaMs;
      const t = light.elapsedMs / light.durationMs;
      if (t >= 1) continue;
      const alpha = 1 - t;
      this.eraseLight(light.x, light.y, light.radius, alpha);
      this.timedLights[writeIdx++] = light;
    }
    this.timedLights.length = writeIdx;

    // Pickup glow — sinusoidal pulse so they read as "alive".
    const pulse =
      PICKUP_GLOW_BASE_ALPHA +
      PICKUP_GLOW_PULSE_AMPLITUDE *
        Math.sin((this.elapsedMs / PICKUP_GLOW_PULSE_PERIOD_MS) * Math.PI * 2);
    for (const pos of activePickupPositions) {
      this.eraseLight(pos.x, pos.y, PICKUP_GLOW_RADIUS, pulse);
    }
  }

  private eraseLight(x: number, y: number, radius: number, alpha: number): void {
    this.lightImage.setScale(radius / LIGHT_TEXTURE_RADIUS);
    this.lightImage.setAlpha(alpha);
    this.rt.erase(this.lightImage, x, y);
  }

  destroy(): void {
    const scene = this.rt.scene;
    this.lightImage.destroy();
    this.rt.destroy();
    if (scene?.textures.exists(LIGHT_TEXTURE_KEY)) {
      scene.textures.remove(LIGHT_TEXTURE_KEY);
    }
  }
}

function bakeLightTexture(
  scene: Phaser.Scene,
  key: string,
  radius: number,
  steps: number,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Concentric circles from outer (faint) to inner (opaque) form a radial
  // gradient. Quadratic falloff keeps the feather soft without a visible
  // ring at the edge.
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const alpha = (1 - t) * (1 - t);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(radius, radius, radius * t);
  }
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
}
