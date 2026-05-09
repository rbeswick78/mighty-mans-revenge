import Phaser from 'phaser';
import type { SerializedPlayerState } from '@shared/types/network.js';

const AURA_DEPTH = 12;
const BRUCE_COLOR = 0xff7b2a;
const MIGHTY_MAN_COLOR = 0x4ad8e8;

/**
 * Per-player floor aura that fires whenever a player's ability is active.
 * Two stacked rings + a soft inner disk that pulse together — bright,
 * obvious, drawn at world-space under the player sprite so it reads as
 * "this character is powered up right now".
 *
 * Drawn for every player with abilityActiveSeconds > 0 (not just the
 * local one) so opponents also visibly telegraph that their ability is
 * firing — important counterplay information when an enemy Mighty Man
 * is mid-x-ray or a Bruce is winding up a fire breath.
 */
export class AbilityAura {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private elapsedMs = 0;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(AURA_DEPTH);
  }

  update(players: SerializedPlayerState[], deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.graphics.clear();

    const phase = this.elapsedMs / 1000;
    // Two pulses overlaid 180° apart so the ring never fully dims.
    const pulseA = 0.65 + 0.35 * Math.abs(Math.sin(phase * 4));
    const pulseB = 0.5 + 0.5 * Math.abs(Math.sin(phase * 6 + 1.5));

    for (const p of players) {
      if (p.abilityActiveSeconds <= 0) continue;
      if (p.isDead) continue;
      const color = p.characterId === 'bruce' ? BRUCE_COLOR : MIGHTY_MAN_COLOR;
      this.drawAura(p.position.x, p.position.y, color, pulseA, pulseB);
    }
  }

  private drawAura(
    x: number,
    y: number,
    color: number,
    pulseA: number,
    pulseB: number,
  ): void {
    const innerRadius = 22 + 4 * pulseA;
    const outerRadius = 36 + 6 * pulseB;

    // Soft fill disk — sits under the sprite, low alpha so it doesn't
    // wash the character out.
    this.graphics.fillStyle(color, 0.18 * pulseA);
    this.graphics.fillCircle(x, y, innerRadius);

    // Bright stroke ring — the load-bearing visual cue.
    this.graphics.lineStyle(4, color, 0.95 * pulseA);
    this.graphics.strokeCircle(x, y, innerRadius);

    // Outer halo ring, half-counter-phase, makes the aura feel alive.
    this.graphics.lineStyle(2, color, 0.55 * pulseB);
    this.graphics.strokeCircle(x, y, outerRadius);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
