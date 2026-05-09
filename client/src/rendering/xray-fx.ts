import Phaser from 'phaser';
import type { SerializedPlayerState } from '@shared/types/network.js';
import type { CollisionGrid } from '@shared/types/map.js';
import { PLAYER } from '@shared/config/game.js';
import { raycastAgainstGrid } from '@shared/utils/collision.js';
import { MAP_HEIGHT_PX, MAP_WIDTH_PX } from '../ui/layout.js';

const TINT_DEPTH = 1500;
const SILHOUETTE_DEPTH = 35;
const TINT_COLOR = 0x4ad8e8;
const TINT_ALPHA = 0.10;
const SILHOUETTE_COLOR = 0x4ad8e8;
const SILHOUETTE_ALPHA = 0.55;

/**
 * Mighty Man's x-ray vision client VFX:
 *   1. Cyan camera tint while the local player has the ability active.
 *   2. Silhouettes drawn over wall tiles for any opponent the local player
 *      doesn't have line-of-sight to. Drawn only for the local Mighty Man,
 *      so the opponent can't tell they're being seen through walls.
 *
 * Pure visual layer — gameplay piercing is server-authoritative; this just
 * gives the local player something to aim at.
 */
export class XrayFx {
  private readonly scene: Phaser.Scene;
  private readonly tintRect: Phaser.GameObjects.Rectangle;
  private readonly silhouettes: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.tintRect = scene.add.rectangle(
      0,
      0,
      MAP_WIDTH_PX,
      MAP_HEIGHT_PX,
      TINT_COLOR,
      TINT_ALPHA,
    );
    this.tintRect.setOrigin(0, 0);
    this.tintRect.setScrollFactor(0);
    this.tintRect.setDepth(TINT_DEPTH);
    this.tintRect.setVisible(false);
  }

  update(
    localState: SerializedPlayerState | null,
    allPlayers: SerializedPlayerState[],
    grid: CollisionGrid | null,
  ): void {
    const active =
      localState !== null &&
      localState.characterId === 'mighty_man' &&
      localState.abilityActiveSeconds > 0;

    this.tintRect.setVisible(active);

    if (!active || !localState || !grid) {
      for (const rect of this.silhouettes.values()) rect.setVisible(false);
      return;
    }

    const seen = new Set<string>();
    for (const other of allPlayers) {
      if (other.id === localState.id) continue;
      if (other.isDead) continue;

      // LOS check: if there's an unbroken line, the regular sprite is already
      // visible — no silhouette needed.
      const dx = other.position.x - localState.position.x;
      const dy = other.position.y - localState.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const ray = raycastAgainstGrid(
        grid,
        localState.position.x,
        localState.position.y,
        angle,
        dist,
      );
      const hasLOS = !ray.hitTile;
      if (hasLOS) continue;

      seen.add(other.id);
      let rect = this.silhouettes.get(other.id);
      if (!rect) {
        rect = this.scene.add.rectangle(
          0,
          0,
          PLAYER.HITBOX_WIDTH,
          PLAYER.HITBOX_HEIGHT,
          SILHOUETTE_COLOR,
          SILHOUETTE_ALPHA,
        );
        rect.setDepth(SILHOUETTE_DEPTH);
        this.silhouettes.set(other.id, rect);
      }
      rect.setPosition(other.position.x, other.position.y);
      rect.setVisible(true);
    }

    for (const [id, rect] of this.silhouettes) {
      if (!seen.has(id)) rect.setVisible(false);
    }
  }

  destroy(): void {
    this.tintRect.destroy();
    for (const rect of this.silhouettes.values()) rect.destroy();
    this.silhouettes.clear();
  }
}
