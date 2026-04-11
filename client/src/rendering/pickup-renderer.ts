import Phaser from 'phaser';
import type { PickupState } from '@shared/types/pickup.js';
import { PickupType } from '@shared/types/pickup.js';

interface PickupSprite {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  wasActive: boolean;
  bobTween: Phaser.Tweens.Tween | null;
}

export class PickupRenderer {
  private scene: Phaser.Scene;
  private pickups: Map<string, PickupSprite> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  updatePickups(pickups: PickupState[]): void {
    const currentIds = new Set<string>();

    for (const state of pickups) {
      currentIds.add(state.id);

      let pickup = this.pickups.get(state.id);
      if (!pickup) {
        pickup = this.createPickup(state);
        this.pickups.set(state.id, pickup);
      }

      pickup.container.setPosition(state.position.x, state.position.y);

      if (state.isActive && !pickup.wasActive) {
        // Becoming active: fade in
        pickup.container.setVisible(true);
        pickup.container.setAlpha(0);
        this.scene.tweens.add({
          targets: pickup.container,
          alpha: 1,
          duration: 300,
        });
        pickup.bobTween = this.createBobTween(pickup.sprite);
      } else if (!state.isActive && pickup.wasActive) {
        // Becoming inactive: hide
        if (pickup.bobTween) {
          pickup.bobTween.stop();
          pickup.bobTween = null;
        }
        pickup.container.setVisible(false);
      } else if (state.isActive) {
        pickup.container.setVisible(true);
      }

      pickup.wasActive = state.isActive;
    }

    // Remove pickups no longer in the state
    for (const [id, pickup] of this.pickups) {
      if (!currentIds.has(id)) {
        if (pickup.bobTween) {
          pickup.bobTween.stop();
        }
        pickup.container.destroy();
        this.pickups.delete(id);
      }
    }
  }

  private createPickup(state: PickupState): PickupSprite {
    const textureKey =
      state.type === PickupType.GUN_AMMO ? 'pickup_ammo' : 'pickup_grenade';

    const sprite = this.scene.add.sprite(0, 0, textureKey);
    sprite.setOrigin(0.5, 0.5);

    const container = this.scene.add.container(state.position.x, state.position.y, [
      sprite,
    ]);

    container.setVisible(state.isActive);

    const bobTween = state.isActive ? this.createBobTween(sprite) : null;

    return {
      container,
      sprite,
      wasActive: state.isActive,
      bobTween,
    };
  }

  private createBobTween(sprite: Phaser.GameObjects.Sprite): Phaser.Tweens.Tween {
    return this.scene.tweens.add({
      targets: sprite,
      y: { from: -3, to: 3 },
      duration: 600,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  destroy(): void {
    for (const pickup of this.pickups.values()) {
      if (pickup.bobTween) {
        pickup.bobTween.stop();
      }
      pickup.container.destroy();
    }
    this.pickups.clear();
  }
}
