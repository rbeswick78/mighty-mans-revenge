import Phaser from 'phaser';
import type { SerializedPlayerState } from '@shared/types/network.js';
import type { CollisionGrid } from '@shared/types/map.js';
import { PLAYER } from '@shared/config/game.js';
import { raycastAgainstGrid } from '@shared/utils/collision.js';
import { MAP_HEIGHT_PX, MAP_WIDTH_PX } from '../ui/layout.js';

const TINT_DEPTH = 1500;
const BORDER_DEPTH = 1600;
const SILHOUETTE_DEPTH = 35;
const XRAY_COLOR = 0x4ad8e8;
const XRAY_TINT_ALPHA = 0.10;
const FIRE_COLOR = 0xff7b2a;
const FIRE_TINT_ALPHA = 0.14;
const SILHOUETTE_ALPHA = 0.55;
/** Border strip thickness in pixels — bright frame around the gameboard. */
const BORDER_THICKNESS = 6;

/**
 * Local-player ability VFX: screen-edge border, full-screen tint, and (for
 * Mighty Man only) opponent silhouettes drawn over walls during x-ray.
 *
 * Border + tint fire whenever the LOCAL player's ability is active, so both
 * Bruce and Mighty Man get an unmistakable "ability is on" cue. Color follows
 * the ability — fiery orange for Bruce, cyan for Mighty Man.
 *
 * Silhouettes are only drawn for Mighty Man, since seeing-through-walls is
 * his unique mechanic. Pure visual layer — gameplay piercing is
 * server-authoritative; this just gives the local player something to aim at.
 */
export class XrayFx {
  private readonly scene: Phaser.Scene;
  private readonly tintRect: Phaser.GameObjects.Rectangle;
  private readonly borderTop: Phaser.GameObjects.Rectangle;
  private readonly borderBottom: Phaser.GameObjects.Rectangle;
  private readonly borderLeft: Phaser.GameObjects.Rectangle;
  private readonly borderRight: Phaser.GameObjects.Rectangle;
  private readonly borderRects: Phaser.GameObjects.Rectangle[];
  private readonly silhouettes: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  /** Drives the border pulse — accumulates ms and feeds Math.sin. */
  private pulseMs = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.tintRect = scene.add.rectangle(
      0,
      0,
      MAP_WIDTH_PX,
      MAP_HEIGHT_PX,
      XRAY_COLOR,
      XRAY_TINT_ALPHA,
    );
    this.tintRect.setOrigin(0, 0);
    this.tintRect.setScrollFactor(0);
    this.tintRect.setDepth(TINT_DEPTH);
    this.tintRect.setVisible(false);

    // Four solid bars hugging the gameboard edges. Brighter than the tint and
    // pulses, so it reads as an obvious "ability ON" frame even at a glance.
    this.borderTop = scene.add.rectangle(0, 0, MAP_WIDTH_PX, BORDER_THICKNESS, XRAY_COLOR, 1);
    this.borderBottom = scene.add.rectangle(
      0,
      MAP_HEIGHT_PX - BORDER_THICKNESS,
      MAP_WIDTH_PX,
      BORDER_THICKNESS,
      XRAY_COLOR,
      1,
    );
    this.borderLeft = scene.add.rectangle(0, 0, BORDER_THICKNESS, MAP_HEIGHT_PX, XRAY_COLOR, 1);
    this.borderRight = scene.add.rectangle(
      MAP_WIDTH_PX - BORDER_THICKNESS,
      0,
      BORDER_THICKNESS,
      MAP_HEIGHT_PX,
      XRAY_COLOR,
      1,
    );
    this.borderRects = [this.borderTop, this.borderBottom, this.borderLeft, this.borderRight];
    for (const rect of this.borderRects) {
      rect.setOrigin(0, 0);
      rect.setScrollFactor(0);
      rect.setDepth(BORDER_DEPTH);
      rect.setVisible(false);
    }
  }

  update(
    localState: SerializedPlayerState | null,
    allPlayers: SerializedPlayerState[],
    grid: CollisionGrid | null,
    deltaMs: number,
  ): void {
    const active = localState !== null && localState.abilityActiveSeconds > 0;
    const isMightyMan =
      active && localState !== null && localState.characterId === 'mighty_man';
    const isBruce = active && localState !== null && localState.characterId === 'bruce';

    if (active) {
      this.pulseMs += deltaMs;
      const pulse = 0.7 + 0.3 * Math.abs(Math.sin(this.pulseMs / 220));
      const color = isBruce ? FIRE_COLOR : XRAY_COLOR;
      const tintAlpha = isBruce ? FIRE_TINT_ALPHA : XRAY_TINT_ALPHA;
      this.tintRect.setFillStyle(color, tintAlpha);
      this.tintRect.setVisible(true);
      for (const rect of this.borderRects) {
        rect.setFillStyle(color, pulse);
        rect.setVisible(true);
      }
    } else {
      this.pulseMs = 0;
      this.tintRect.setVisible(false);
      for (const rect of this.borderRects) rect.setVisible(false);
    }

    // Silhouettes — only meaningful while x-ray is active.
    if (!isMightyMan || !localState || !grid) {
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
          XRAY_COLOR,
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
    for (const rect of this.borderRects) rect.destroy();
    for (const rect of this.silhouettes.values()) rect.destroy();
    this.silhouettes.clear();
  }
}
