import Phaser from 'phaser';
import type {
  BattleRoyaleContainerState,
  BattleRoyaleSupplyBundleState,
} from '@shared/types/weapon.js';
import {
  REFORGED_WEAPON_PICKUP_TEXTURE_KEY,
  reforgedSupplyFrame,
} from './reforged-weapon-pickup-contract.js';
import { reforgedWeaponPickupAtlasAvailable } from './reforged-weapon-pickup-runtime.js';

interface RenderedLoot {
  readonly root: Phaser.GameObjects.Container;
  readonly icon: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

/** Pure projection of attack-owned container and compact supply state. */
export class BattleRoyaleLootRenderer {
  private readonly containers = new Map<string, RenderedLoot>();
  private readonly supplies = new Map<string, RenderedLoot>();
  private readonly modernArtAvailable: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    modernArtEnabled: boolean,
  ) {
    this.modernArtAvailable = modernArtEnabled && reforgedWeaponPickupAtlasAvailable(scene);
  }

  update(
    containers: readonly BattleRoyaleContainerState[],
    supplies: readonly BattleRoyaleSupplyBundleState[],
  ): void {
    this.updateContainers(containers);
    this.updateSupplies(supplies);
  }

  private updateContainers(states: readonly BattleRoyaleContainerState[]): void {
    const active = new Set<string>();
    for (const state of states) {
      active.add(state.id);
      let rendered = this.containers.get(state.id);
      if (!rendered) {
        rendered = this.createLoot(state.position.x, state.position.y, 'container', 'ATTACK');
        rendered.root.setDepth(44);
        this.containers.set(state.id, rendered);
      }
      rendered.root.setPosition(state.position.x, state.position.y);
      rendered.label.setText(state.status === 'opened' ? 'OPEN' : 'ATTACK');
      if (rendered.icon instanceof Phaser.GameObjects.Image && this.modernArtAvailable) {
        rendered.icon.setFrame(
          reforgedSupplyFrame(state.status === 'opened' ? 'damaged-container' : 'container'),
        );
      } else if (rendered.icon instanceof Phaser.GameObjects.Rectangle) {
        rendered.icon.setFillStyle(state.status === 'opened' ? 0x6b3d2e : 0xb7683c, 1);
      }
    }
    this.retireMissing(this.containers, active);
  }

  private updateSupplies(states: readonly BattleRoyaleSupplyBundleState[]): void {
    const active = new Set<string>();
    for (const state of states) {
      active.add(state.id);
      let rendered = this.supplies.get(state.id);
      if (!rendered) {
        rendered = this.createLoot(state.position.x, state.position.y, 'supply', '');
        rendered.root.setDepth(46);
        this.supplies.set(state.id, rendered);
      }
      rendered.root.setPosition(state.position.x, state.position.y);
      const sustain = { bandage: 'HP', armor: 'AR', grenade: 'GR' }[state.sustainType];
      rendered.label.setText(`+${state.reserveAmmo} · ${sustain}`);
    }
    this.retireMissing(this.supplies, active);
  }

  private createLoot(
    x: number,
    y: number,
    frame: 'container' | 'supply',
    labelText: string,
  ): RenderedLoot {
    const icon = this.modernArtAvailable
      ? this.scene.add
          .image(0, 0, REFORGED_WEAPON_PICKUP_TEXTURE_KEY, reforgedSupplyFrame(frame))
          .setScale(0.82)
      : this.scene.add.rectangle(0, 0, frame === 'container' ? 44 : 28, 24, 0xb7683c, 1);
    const label = this.scene.add
      .text(0, 28, labelText, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#fdcbb0',
        stroke: '#101019',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const root = this.scene.add.container(x, y, [icon, label]);
    return { root, icon, label };
  }

  private retireMissing(map: Map<string, RenderedLoot>, active: ReadonlySet<string>): void {
    for (const [id, rendered] of map) {
      if (active.has(id)) continue;
      rendered.root.destroy(true);
      map.delete(id);
    }
  }

  destroy(): void {
    for (const rendered of [...this.containers.values(), ...this.supplies.values()]) {
      rendered.root.destroy(true);
    }
    this.containers.clear();
    this.supplies.clear();
  }
}
