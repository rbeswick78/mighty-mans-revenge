import Phaser from 'phaser';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { ABILITY, MAP } from '@shared/config/game.js';

const FIRE_DEPTH = 40;
const FIRE_RANGE = ABILITY.BRUCE_FIRE_BREATH.RANGE_TILES * MAP.TILE_SIZE;

interface ActiveCone {
  phase: number;
}

/**
 * Draws Bruce's fire-breath cone for any player whose abilityActiveSeconds
 * is currently positive and characterId === 'bruce'. Three stacked layers
 * (hot core, mid orange, outer red) plus a per-frame flicker on length and
 * tip-width sell the flame motion. Stateless across players: cleared and
 * rebuilt from the snapshot every frame.
 */
export class FireBreathFx {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly active: Map<string, ActiveCone> = new Map();

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(FIRE_DEPTH);
  }

  update(players: SerializedPlayerState[], deltaMs: number): void {
    this.graphics.clear();
    const seen = new Set<string>();
    const dt = deltaMs / 1000;

    for (const p of players) {
      if (p.characterId !== 'bruce') continue;
      if (p.abilityActiveSeconds <= 0) continue;
      seen.add(p.id);

      let entry = this.active.get(p.id);
      if (!entry) {
        entry = { phase: 0 };
        this.active.set(p.id, entry);
      }
      entry.phase += dt;

      this.drawCone(p.position.x, p.position.y, p.aimAngle, entry.phase);
    }

    for (const id of [...this.active.keys()]) {
      if (!seen.has(id)) this.active.delete(id);
    }
  }

  private drawCone(originX: number, originY: number, aim: number, phase: number): void {
    const dirX = Math.cos(aim);
    const dirY = Math.sin(aim);
    const perpX = -dirY;
    const perpY = dirX;

    // Four stacked layers: hot white core → orange → red → outer dark-red
    // halo. Higher alphas than v1 so the cone reads even under bloom + CRT
    // post-FX. Tip widths grow per layer so the outer halo bleeds beyond
    // the hot core, which is what sells the "flame fanning out" silhouette.
    const layers = [
      { color: 0xffffff, alpha: 1.0, scale: 0.45, tipW: 12 },
      { color: 0xfff4d6, alpha: 0.95, scale: 0.65, tipW: 20 },
      { color: 0xfca72a, alpha: 0.85, scale: 0.85, tipW: 28 },
      { color: 0xff3a1e, alpha: 0.65, scale: 1.05, tipW: 36 },
    ];

    const baseHalfWidth = 7;

    for (const layer of layers) {
      const flicker = 0.88 + 0.12 * Math.sin(phase * 24 + layer.scale * 7);
      const length = FIRE_RANGE * layer.scale * flicker;
      const tipW = layer.tipW * flicker;

      this.graphics.fillStyle(layer.color, layer.alpha);
      this.graphics.beginPath();
      this.graphics.moveTo(
        originX + perpX * baseHalfWidth,
        originY + perpY * baseHalfWidth,
      );
      this.graphics.lineTo(
        originX - perpX * baseHalfWidth,
        originY - perpY * baseHalfWidth,
      );
      this.graphics.lineTo(
        originX + dirX * length - perpX * tipW,
        originY + dirY * length - perpY * tipW,
      );
      this.graphics.lineTo(
        originX + dirX * length + perpX * tipW,
        originY + dirY * length + perpY * tipW,
      );
      this.graphics.closePath();
      this.graphics.fillPath();
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.active.clear();
  }
}
