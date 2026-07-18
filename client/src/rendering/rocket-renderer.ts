import Phaser from 'phaser';
import type { RocketState } from '@shared/types/projectile.js';
import type { WeaponRarity } from '@shared/types/weapon.js';

const RARITY_COLORS: Readonly<Record<WeaponRarity, number>> = Object.freeze({
  common: 0x9babb2,
  uncommon: 0x91db69,
  rare: 0x4d9be6,
  epic: 0xa884f3,
  legendary: 0xf79617,
  mythical: 0xe83b3b,
});

/** Pure projection of server-owned launcher flight; no client collision. */
export class RocketRenderer {
  private readonly sprites = new Map<string, Phaser.GameObjects.Graphics>();

  constructor(private readonly scene: Phaser.Scene) {}

  updateRockets(rockets: readonly RocketState[]): void {
    const active = new Set<string>();
    for (const rocket of rockets) {
      active.add(rocket.id);
      let graphic = this.sprites.get(rocket.id);
      if (!graphic) {
        const color = RARITY_COLORS[rocket.weaponInstance.rarity];
        graphic = this.scene.add.graphics().setDepth(52);
        graphic.fillStyle(0x2b2b35, 1).fillCircle(0, 0, 6);
        graphic.lineStyle(3, color, 1).strokeCircle(0, 0, 6);
        graphic.fillStyle(color, 0.9).fillTriangle(-10, -3, -10, 3, -4, 0);
        this.sprites.set(rocket.id, graphic);
      }
      graphic.setPosition(rocket.position.x, rocket.position.y).setRotation(rocket.angle);
    }
    for (const [id, graphic] of this.sprites) {
      if (active.has(id)) continue;
      graphic.destroy();
      this.sprites.delete(id);
    }
  }

  getRenderState(): Readonly<{ resourceCount: number }> {
    return Object.freeze({ resourceCount: this.sprites.size });
  }

  destroy(): void {
    for (const graphic of this.sprites.values()) graphic.destroy();
    this.sprites.clear();
  }
}
