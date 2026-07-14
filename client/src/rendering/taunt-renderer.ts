import Phaser from 'phaser';

import type { PlayerId } from '@shared/types/common.js';
import { TAUNT, TAUNTS, type TauntId } from '@shared/config/game.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import type { ClientPlayerManager } from './player-manager.js';

const BUBBLE_DEPTH = 1600;
const BUBBLE_OFFSET_Y = 64;
const BUBBLE_PADDING_X = 8;
const BUBBLE_HEIGHT = 24;
const TAIL_HEIGHT = 6;
const FADE_MS = 250;
const INTRO_MS = 120;

interface ActiveTaunt {
  container: Phaser.GameObjects.Container;
  remainingMs: number;
  elapsedMs: number;
}

/** Short-lived speech bubbles anchored to the latest player render position. */
export class TauntRenderer {
  private readonly scene: Phaser.Scene;
  private readonly active = new Map<PlayerId, ActiveTaunt>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(playerId: PlayerId, tauntId: TauntId): void {
    this.remove(playerId);

    const text = this.scene.add
      .text(0, -1, TAUNTS[tauntId].text, {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: cssHex(Wasteland.TEXT_PRIMARY),
        stroke: '#2e222f',
        strokeThickness: 1,
      })
      .setOrigin(0.5);
    const width = Math.ceil(text.width) + BUBBLE_PADDING_X * 2;

    const background = this.scene.add.graphics();
    background.fillStyle(Wasteland.HUD_STRIP_BG, 0.94);
    background.lineStyle(2, Wasteland.TEXT_LOADING, 1);
    background.fillRoundedRect(-width / 2, -BUBBLE_HEIGHT / 2, width, BUBBLE_HEIGHT, 4);
    background.strokeRoundedRect(-width / 2, -BUBBLE_HEIGHT / 2, width, BUBBLE_HEIGHT, 4);
    background.fillTriangle(
      -5,
      BUBBLE_HEIGHT / 2,
      5,
      BUBBLE_HEIGHT / 2,
      0,
      BUBBLE_HEIGHT / 2 + TAIL_HEIGHT,
    );
    background.lineBetween(-5, BUBBLE_HEIGHT / 2, 0, BUBBLE_HEIGHT / 2 + TAIL_HEIGHT);
    background.lineBetween(0, BUBBLE_HEIGHT / 2 + TAIL_HEIGHT, 5, BUBBLE_HEIGHT / 2);

    const container = this.scene.add.container(0, 0, [background, text]);
    container.setDepth(BUBBLE_DEPTH).setScale(0.78).setAlpha(0);
    this.active.set(playerId, {
      container,
      remainingMs: TAUNT.DISPLAY_MS,
      elapsedMs: 0,
    });
  }

  update(players: ClientPlayerManager, deltaMs: number): void {
    for (const [playerId, taunt] of this.active) {
      taunt.elapsedMs += deltaMs;
      taunt.remainingMs -= deltaMs;
      if (taunt.remainingMs <= 0) {
        this.remove(playerId);
        continue;
      }

      const player = players.getRenderer(playerId)?.getContainer();
      taunt.container.setVisible(!!player);
      if (player) taunt.container.setPosition(player.x, player.y - BUBBLE_OFFSET_Y);

      const intro = Math.min(1, taunt.elapsedMs / INTRO_MS);
      const outro = Math.min(1, taunt.remainingMs / FADE_MS);
      taunt.container.setAlpha(Math.min(intro, outro));
      taunt.container.setScale(0.78 + 0.22 * intro);
    }
  }

  remove(playerId: PlayerId): void {
    const taunt = this.active.get(playerId);
    if (!taunt) return;
    taunt.container.destroy(true);
    this.active.delete(playerId);
  }

  destroy(): void {
    for (const taunt of this.active.values()) taunt.container.destroy(true);
    this.active.clear();
  }
}
