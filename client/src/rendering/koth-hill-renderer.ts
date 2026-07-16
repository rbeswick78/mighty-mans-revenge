import Phaser from 'phaser';
import { KOTH, MAP } from '@shared/config/game.js';
import type { KothHudState } from '@shared/types/network.js';
import { Wasteland } from '@shared/config/palette.js';
import { declareWorldSpace, worldPoint } from './gameplay-coordinate-space.js';

/**
 * Draws the King of the Hill zone on the gameboard: a pulsing filled
 * square with corner brackets over the live hill, colored by occupancy
 * (bone = empty, mint = the local player is capturing, blood red = an
 * enemy is, orange = contested), plus a blinking amber outline over the
 * NEXT hill during the relocation warning window.
 *
 * Create right after the map/decals so display-list order stacks it above
 * tiles and below player containers. Redrawn from scratch every frame
 * from the latest snapshot — no state of its own.
 */
export class KothHillRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    declareWorldSpace(this.gfx);
  }

  update(state: KothHudState | null, localPlayerId: string | null, timeMs: number): void {
    this.gfx.clear();
    // Guard .hill too: JSON serialization drops undefined fields, so a
    // malformed snapshot must degrade to "no hill", never a per-frame throw.
    if (!state?.hill) return;

    const size = KOTH.HILL_SIZE_TILES * MAP.TILE_SIZE;
    const hill = worldPoint(state.hill.x * MAP.TILE_SIZE, state.hill.y * MAP.TILE_SIZE);
    const { x, y } = hill;

    let color: number = Wasteland.TEXT_PRIMARY;
    if (state.contested) {
      color = Wasteland.TEXT_LOADING;
    } else if (state.occupantId !== null) {
      color = state.occupantId === localPlayerId ? Wasteland.HEALTH_GOOD : Wasteland.TEXT_DEATH;
    }

    // Soft pulsing fill + steady border.
    const pulse = 0.12 + 0.06 * Math.sin(timeMs / 300);
    this.gfx.fillStyle(color, pulse);
    this.gfx.fillRect(x, y, size, size);
    this.gfx.lineStyle(2, color, 0.85);
    this.gfx.strokeRect(x + 1, y + 1, size - 2, size - 2);

    // Corner brackets sell the "capture zone" read at a glance.
    const arm = 12;
    this.gfx.lineStyle(3, color, 1);
    this.gfx.beginPath();
    // top-left
    this.gfx.moveTo(x + 1, y + 1 + arm);
    this.gfx.lineTo(x + 1, y + 1);
    this.gfx.lineTo(x + 1 + arm, y + 1);
    // top-right
    this.gfx.moveTo(x + size - 1 - arm, y + 1);
    this.gfx.lineTo(x + size - 1, y + 1);
    this.gfx.lineTo(x + size - 1, y + 1 + arm);
    // bottom-right
    this.gfx.moveTo(x + size - 1, y + size - 1 - arm);
    this.gfx.lineTo(x + size - 1, y + size - 1);
    this.gfx.lineTo(x + size - 1 - arm, y + size - 1);
    // bottom-left
    this.gfx.moveTo(x + 1 + arm, y + size - 1);
    this.gfx.lineTo(x + 1, y + size - 1);
    this.gfx.lineTo(x + 1, y + size - 1 - arm);
    this.gfx.strokePath();

    // Relocation warning: blink an amber outline where the hill lands next.
    if (state.nextHill) {
      const blink = Math.floor(timeMs / 250) % 2 === 0;
      if (blink) {
        const nextHill = worldPoint(
          state.nextHill.x * MAP.TILE_SIZE,
          state.nextHill.y * MAP.TILE_SIZE,
        );
        const { x: nx, y: ny } = nextHill;
        this.gfx.lineStyle(2, Wasteland.TEXT_RELOAD_WARNING, 0.9);
        this.gfx.strokeRect(nx + 1, ny + 1, size - 2, size - 2);
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
