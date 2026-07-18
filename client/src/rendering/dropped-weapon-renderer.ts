import Phaser from 'phaser';
import type { DroppedWeaponState } from '@shared/types/weapon.js';
import {
  REFORGED_WEAPON_PICKUP_TEXTURE_KEY,
  liveReforgedGunArtId,
  reforgedGunPresentationFrame,
} from './reforged-weapon-pickup-contract.js';
import { reforgedWeaponPickupAtlasAvailable } from './reforged-weapon-pickup-runtime.js';

/** Pure projection of server-owned ground guns; collection remains server-side. */
export class DroppedWeaponRenderer {
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly modernArtAvailable: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    modernArtEnabled: boolean,
  ) {
    this.modernArtAvailable = modernArtEnabled && reforgedWeaponPickupAtlasAvailable(this.scene);
  }

  updateDrops(drops: readonly DroppedWeaponState[]): void {
    const active = new Set<string>();
    for (const drop of drops) {
      active.add(drop.id);
      let sprite = this.sprites.get(drop.id);
      if (!sprite) {
        const artId = liveReforgedGunArtId(drop.weaponInstance.weaponId);
        const modern = this.modernArtAvailable && artId !== null;
        sprite = this.scene.add.sprite(
          drop.position.x,
          drop.position.y,
          modern ? REFORGED_WEAPON_PICKUP_TEXTURE_KEY : 'pickup_shotgun',
          modern ? reforgedGunPresentationFrame(artId, 'ground') : undefined,
        );
        sprite.setScale(modern ? 0.75 : 3).setDepth(45);
        this.sprites.set(drop.id, sprite);
      }
      sprite.setPosition(drop.position.x, drop.position.y);
    }
    for (const [id, sprite] of this.sprites) {
      if (active.has(id)) continue;
      sprite.destroy();
      this.sprites.delete(id);
    }
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
  }
}
