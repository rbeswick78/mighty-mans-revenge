import Phaser from 'phaser';
import type { PickupState } from '@shared/types/pickup.js';
import { PickupType } from '@shared/types/pickup.js';
import { pickupPresentation } from './pickup-presentation.js';
import {
  REFORGED_WEAPON_PICKUP_TEXTURE_KEY,
  reforgedPickupFrame,
} from './reforged-weapon-pickup-contract.js';
import { reforgedWeaponPickupAtlasAvailable } from './reforged-weapon-pickup-runtime.js';

const PICKUP_SCALE = 3;
const REFORGED_PICKUP_SCALE = 0.75;

const PICKUP_TEXTURES: Record<PickupType, string> = {
  [PickupType.GUN_AMMO]: 'pickup_ammo',
  [PickupType.GRENADE]: 'pickup_grenade',
  [PickupType.WEAPON_SHOTGUN]: 'pickup_shotgun',
  [PickupType.WEAPON_PISTOL]: 'pickup_pistol',
  [PickupType.WEAPON_BAT]: 'pickup_bat',
  [PickupType.BANDAGE]: 'pickup_bandage',
  [PickupType.ARMOR]: 'pickup_armor',
  [PickupType.OVERCHARGE]: 'pickup_overcharge',
};

interface PickupSprite {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  wasActive: boolean;
  bobTween: Phaser.Tweens.Tween | null;
  auraHalo: Phaser.GameObjects.Arc | null;
  auraLabel: Phaser.GameObjects.Text | null;
}

export class PickupRenderer {
  private scene: Phaser.Scene;
  private pickups: Map<string, PickupSprite> = new Map();
  private readonly modernArtAvailable: boolean;

  constructor(scene: Phaser.Scene, modernArtEnabled = false) {
    this.scene = scene;
    this.modernArtAvailable = modernArtEnabled && reforgedWeaponPickupAtlasAvailable(scene);
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
      const presentation = pickupPresentation(state, this.scene.time.now);
      pickup.container.setScale(presentation.scale);
      pickup.sprite.setAlpha(presentation.alpha);
      pickup.auraHalo?.setAlpha(presentation.alpha * 0.55);
      pickup.auraLabel?.setAlpha(presentation.alpha);
      if (presentation.tint !== null) {
        pickup.sprite.setTint(presentation.tint);
      } else {
        pickup.sprite.clearTint();
      }

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
    const modernFrame = this.modernArtAvailable ? reforgedPickupFrame(state.type) : null;
    const textureKey = modernFrame
      ? REFORGED_WEAPON_PICKUP_TEXTURE_KEY
      : (PICKUP_TEXTURES[state.type] ?? 'pickup_ammo');

    const sprite = this.scene.add.sprite(0, 0, textureKey, modernFrame ?? undefined);
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(modernFrame ? REFORGED_PICKUP_SCALE : PICKUP_SCALE);

    let auraHalo: Phaser.GameObjects.Arc | null = null;
    let auraLabel: Phaser.GameObjects.Text | null = null;
    const children: Phaser.GameObjects.GameObject[] = [];
    const isOvercharge = state.type === PickupType.OVERCHARGE;
    if (state.isScavengerRushDrop || isOvercharge) {
      const auraColor = state.isScavengerRushDrop ? 0x5ce1e6 : 0xc77dff;
      auraHalo = this.scene.add.circle(0, 0, 18, auraColor, 0.16);
      auraHalo.setStrokeStyle(2, auraColor, 0.9);
      children.push(auraHalo);
    }
    children.push(sprite);
    if (state.isScavengerRushDrop || isOvercharge) {
      const auraColor = state.isScavengerRushDrop ? '#5ce1e6' : '#e0aaff';
      auraLabel = this.scene.add.text(0, -24, state.isScavengerRushDrop ? 'SUPPLY' : 'CHARGE', {
        fontFamily: 'Courier, monospace',
        fontSize: '8px',
        color: auraColor,
        stroke: '#1a1a1a',
        strokeThickness: 2,
      });
      auraLabel.setOrigin(0.5, 0.5);
      children.push(auraLabel);
    }

    const container = this.scene.add.container(state.position.x, state.position.y, children);

    container.setVisible(state.isActive);

    const bobTween = state.isActive ? this.createBobTween(sprite) : null;

    return {
      container,
      sprite,
      wasActive: state.isActive,
      bobTween,
      auraHalo,
      auraLabel,
    };
  }

  getReforgedPresentationStates(): readonly Readonly<{
    id: string;
    textureKey: string;
    frameName: string | number;
  }>[] {
    return Object.freeze(
      [...this.pickups.entries()].map(([id, pickup]) =>
        Object.freeze({
          id,
          textureKey: pickup.sprite.texture.key,
          frameName: pickup.sprite.frame.name,
        }),
      ),
    );
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
