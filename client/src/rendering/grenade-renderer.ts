import Phaser from 'phaser';
import type { GrenadeState } from '@shared/types/projectile.js';

/**
 * Renders in-flight grenades. Server sends the authoritative list of
 * active grenades with each gameState; we mirror that list with Phaser
 * sprites, creating new ones as grenades appear and removing them as
 * they disappear (on explosion).
 */
export class GrenadeRenderer {
  private scene: Phaser.Scene;
  private sprites: Map<string, Phaser.GameObjects.Sprite> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  updateGrenades(grenades: GrenadeState[]): void {
    const currentIds = new Set<string>();

    for (const g of grenades) {
      currentIds.add(g.id);

      let sprite = this.sprites.get(g.id);
      if (!sprite) {
        sprite = this.scene.add.sprite(g.position.x, g.position.y, 'grenade');
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth(50);
        this.sprites.set(g.id, sprite);
      }

      sprite.setPosition(g.position.x, g.position.y);
    }

    for (const [id, sprite] of this.sprites) {
      if (!currentIds.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
  }
}
