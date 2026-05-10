import Phaser from 'phaser';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { ABILITY, MAP } from '@shared/config/game.js';

const FIRE_DEPTH = 40;
const FIRE_RANGE = ABILITY.BRUCE_FIRE_BREATH.RANGE_TILES * MAP.TILE_SIZE;

// Screen-space size of one cone "pixel". Matches the SPRITE_SCALE used by
// player/effects renderers (3) so cone pixels visually line up with the
// character sprite pixels.
const PIXEL = 3;
const COLS = Math.ceil(FIRE_RANGE / PIXEL);
const ROWS = 14;
const HALF_ROWS = ROWS / 2;

// Internal flame animation steps at ~12.5 fps, matching the cadence of
// the existing fire_* muzzle flash sheets and giving the cone discrete
// pixel-art frames instead of a smooth sine fade.
const FRAME_STEP_MS = 80;

// Cone silhouette in cells: narrow at the mouth, fans out at the tip.
const BASE_HW_CELLS = 1.5;
const TIP_HW_CELLS = 6;

// Resurrect-64 warm ramp: cream → yellow → orange → red. Same family as
// the muzzle-flash and explosion palette so the breath reads as part of
// the same visual vocabulary.
const TIERS = [0xfbff86, 0xf9c22b, 0xfb6b1d, 0xea4f36] as const;
const EMPTY = 4;

interface ActiveCone {
  elapsedMs: number;
  lastStep: number;
  grid: Uint8Array;
}

/**
 * Draws Bruce's fire-breath cone for any player whose abilityActiveSeconds
 * is currently positive and characterId === 'bruce'.
 *
 * Renders on a chunky pixel grid (3×3 screen px per cell) in cone-local
 * space, then rotates to the player's aim. Hard-edged cells + a 4-tier
 * Resurrect-64 color ramp + ~12 fps stepped flame animation make it
 * match the rest of the game's pixel art instead of looking like a
 * vector gradient.
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

    for (const p of players) {
      if (p.characterId !== 'bruce') continue;
      if (p.abilityActiveSeconds <= 0) continue;
      seen.add(p.id);

      let entry = this.active.get(p.id);
      if (!entry) {
        entry = {
          elapsedMs: 0,
          lastStep: -1,
          grid: new Uint8Array(COLS * ROWS),
        };
        this.active.set(p.id, entry);
      }
      entry.elapsedMs += deltaMs;

      const step = Math.floor(entry.elapsedMs / FRAME_STEP_MS);
      if (step !== entry.lastStep) {
        regenerateGrid(entry.grid, step);
        entry.lastStep = step;
      }

      this.drawCone(p.position.x, p.position.y, p.aimAngle, entry.grid);
    }

    for (const id of [...this.active.keys()]) {
      if (!seen.has(id)) this.active.delete(id);
    }
  }

  private drawCone(originX: number, originY: number, aim: number, grid: Uint8Array): void {
    const dirX = Math.cos(aim);
    const dirY = Math.sin(aim);
    const perpX = -dirY;
    const perpY = dirX;
    const half = PIXEL / 2;

    for (let col = 0; col < COLS; col++) {
      const uLocal = (col + 0.5) * PIXEL;
      for (let row = 0; row < ROWS; row++) {
        const tier = grid[col * ROWS + row];
        if (tier === EMPTY) continue;

        const vLocal = (row - HALF_ROWS + 0.5) * PIXEL;
        const wx = originX + dirX * uLocal + perpX * vLocal;
        const wy = originY + dirY * uLocal + perpY * vLocal;

        this.graphics.fillStyle(TIERS[tier], 1);
        this.graphics.fillRect(wx - half, wy - half, PIXEL, PIXEL);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.active.clear();
  }
}

function regenerateGrid(grid: Uint8Array, step: number): void {
  for (let col = 0; col < COLS; col++) {
    const u = col / COLS;
    const halfW = BASE_HW_CELLS + (TIP_HW_CELLS - BASE_HW_CELLS) * u;
    const edgeJitter = (hash(col, 0, step) - 0.5) * 3;
    const widened = halfW + edgeJitter;

    for (let row = 0; row < ROWS; row++) {
      const idx = col * ROWS + row;
      const v = row - HALF_ROWS + 0.5;
      const dist = Math.abs(v) / Math.max(0.5, widened);
      if (dist > 1) {
        grid[idx] = EMPTY;
        continue;
      }
      const tierJitter = hash(col, row, step) * 0.6 - 0.3;
      const combined = u * 0.6 + dist * 0.4 + tierJitter;
      const tier = Math.floor(combined * 4);
      grid[idx] = tier < 0 ? 0 : tier > 3 ? 3 : tier;
    }
  }
}

function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}
