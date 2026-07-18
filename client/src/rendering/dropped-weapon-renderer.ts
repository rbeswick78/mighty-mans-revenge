import Phaser from 'phaser';
import type {
  BattleRoyaleInventoryState,
  DroppedWeaponState,
  WeaponRarity,
} from '@shared/types/weapon.js';
import {
  REFORGED_WEAPON_PICKUP_TEXTURE_KEY,
  liveReforgedGunArtId,
  reforgedGunPresentationFrame,
  reforgedRarityFrame,
} from './reforged-weapon-pickup-contract.js';
import { reforgedWeaponPickupAtlasAvailable } from './reforged-weapon-pickup-runtime.js';
import type { WorldRenderQualityBudget } from './dynamic-world-rendering.js';

const RARITY_ORDER: readonly WeaponRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythical',
];

interface RenderedDrop {
  readonly root: Phaser.GameObjects.Container;
  readonly aura: Phaser.GameObjects.Graphics;
  readonly badge: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  readonly comparison: Phaser.GameObjects.Text;
}

/** Pure projection of server-owned ground guns; collection remains server-side. */
export class DroppedWeaponRenderer {
  private readonly sprites = new Map<string, RenderedDrop>();
  private readonly modernArtAvailable: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    modernArtEnabled: boolean,
    private readonly getBudget: () => WorldRenderQualityBudget,
  ) {
    this.modernArtAvailable = modernArtEnabled && reforgedWeaponPickupAtlasAvailable(this.scene);
  }

  updateDrops(drops: readonly DroppedWeaponState[], inventory?: BattleRoyaleInventoryState): void {
    const active = new Set<string>();
    for (const drop of drops) {
      active.add(drop.id);
      let rendered = this.sprites.get(drop.id);
      if (!rendered) {
        rendered = this.createDrop(drop);
        this.sprites.set(drop.id, rendered);
      }
      rendered.root.setPosition(drop.position.x, drop.position.y);
      const heldRarity = inventory?.equipped?.rarity;
      const comparison = heldRarity
        ? Math.sign(
            RARITY_ORDER.indexOf(drop.weaponInstance.rarity) - RARITY_ORDER.indexOf(heldRarity),
          )
        : 1;
      rendered.comparison
        .setText(comparison > 0 ? '▲' : comparison < 0 ? '▼' : '=')
        .setColor(comparison > 0 ? '#91db69' : comparison < 0 ? '#e83b3b' : '#fdcbb0');
      const full = this.getBudget().tier === 'full';
      rendered.aura.setAlpha(full ? 0.56 + Math.sin(this.scene.time.now / 180) * 0.12 : 0.48);
    }
    for (const [id, rendered] of this.sprites) {
      if (active.has(id)) continue;
      rendered.root.destroy(true);
      this.sprites.delete(id);
    }
  }

  getRenderState(): Readonly<{ resourceCount: number }> {
    return Object.freeze({ resourceCount: this.sprites.size });
  }

  private createDrop(drop: DroppedWeaponState): RenderedDrop {
    const artId = liveReforgedGunArtId(drop.weaponInstance.weaponId);
    const modern = this.modernArtAvailable && artId !== null;
    const rarityIndex = RARITY_ORDER.indexOf(drop.weaponInstance.rarity);
    const rarityColors = [0x9babb2, 0x91db69, 0x4d9be6, 0xa884f3, 0xf79617, 0xe83b3b];
    const aura = this.scene.add.graphics();
    aura.fillStyle(rarityColors[rarityIndex], 0.34).fillCircle(0, 0, 28 + rarityIndex * 1.5);
    aura.lineStyle(2, rarityColors[rarityIndex], 0.95).strokeCircle(0, 0, 24);
    const sprite = this.scene.add.sprite(
      0,
      0,
      modern ? REFORGED_WEAPON_PICKUP_TEXTURE_KEY : 'pickup_shotgun',
      modern ? reforgedGunPresentationFrame(artId, 'ground') : undefined,
    );
    sprite.setScale(modern ? 0.75 : 3);
    const badge = modern
      ? this.scene.add
          .image(
            -25,
            -25,
            REFORGED_WEAPON_PICKUP_TEXTURE_KEY,
            reforgedRarityFrame(drop.weaponInstance.rarity),
          )
          .setScale(0.34)
      : this.scene.add
          .text(-25, -25, String(rarityIndex + 1), {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffffff',
            backgroundColor: '#101019',
          })
          .setOrigin(0.5);
    const comparison = this.scene.add
      .text(26, -24, '▲', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#91db69',
        stroke: '#101019',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const root = this.scene.add.container(drop.position.x, drop.position.y, [
      aura,
      sprite,
      badge,
      comparison,
    ]);
    root.setDepth(45);
    return { root, aura, badge, comparison };
  }

  destroy(): void {
    for (const drop of this.sprites.values()) drop.root.destroy(true);
    this.sprites.clear();
  }
}
