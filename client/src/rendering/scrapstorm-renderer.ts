import type Phaser from 'phaser';
import type { PlayerId } from '@shared/types/common.js';
import type { ScrapstormState } from '@shared/types/game.js';
import { MUTATORS } from '@shared/config/game.js';
import { declareScreenSpace, declareWorldSpace } from './gameplay-coordinate-space.js';

const SCRAPSTORM_COLOR = 0xff6b35;
const SCRAPSTORM_GLOW = 0xffc857;

export interface ScrapstormPresentation {
  visible: boolean;
  targeted: boolean;
  progress: number;
  fillAlpha: number;
  ringAlpha: number;
  countdown: string;
}

/** Pure warning projection shared by renderer tests and live Phaser objects. */
export function scrapstormPresentation(
  state: ScrapstormState | null,
  localPlayerId: PlayerId | null,
  timeMs: number,
): ScrapstormPresentation {
  if (!state?.targetPosition || state.secondsUntilImpact === null) {
    return {
      visible: false,
      targeted: false,
      progress: 0,
      fillAlpha: 0,
      ringAlpha: 0,
      countdown: '',
    };
  }
  const pulse = (Math.sin(timeMs / 90) + 1) / 2;
  return {
    visible: true,
    targeted: localPlayerId !== null && state.targetPlayerId === localPlayerId,
    progress: Math.max(
      0,
      Math.min(1, 1 - state.secondsUntilImpact / MUTATORS.SCRAPSTORM_WARNING_SECONDS),
    ),
    fillAlpha: 0.1 + pulse * 0.07,
    ringAlpha: 0.68 + pulse * 0.28,
    countdown: `${Math.max(0, state.secondsUntilImpact).toFixed(1)}S`,
  };
}

/** High-contrast, snapshot-driven ground warning for falling debris. */
export class ScrapstormRenderer {
  private readonly scene: Phaser.Scene;
  private readonly warning: Phaser.GameObjects.Graphics;
  private readonly countdown: Phaser.GameObjects.Text;
  private readonly localWarning: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, viewport: Readonly<{ width: number; height: number }>) {
    this.scene = scene;
    this.warning = declareWorldSpace(scene.add.graphics()).setDepth(1402);
    this.countdown = declareWorldSpace(
      scene.add
        .text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#fff0c2',
          stroke: '#4a1608',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    )
      .setDepth(1403)
      .setVisible(false);
    this.localWarning = declareScreenSpace(
      scene.add
        .text(viewport.width / 2, viewport.height - 28, 'SCRAPSTORM - MOVE!', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#fff0c2',
          stroke: '#4a1608',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    )
      .setDepth(1451)
      .setVisible(false);
  }

  update(state: ScrapstormState | null, localPlayerId: PlayerId | null, timeMs: number): void {
    const view = scrapstormPresentation(state, localPlayerId, timeMs);
    this.warning.clear();
    if (!state?.targetPosition || !view.visible) {
      this.countdown.setVisible(false);
      this.localWarning.setVisible(false);
      return;
    }

    const { x, y } = state.targetPosition;
    const radius = state.radius;
    this.warning.fillStyle(SCRAPSTORM_COLOR, view.fillAlpha);
    this.warning.fillCircle(x, y, radius);
    this.warning.lineStyle(7, SCRAPSTORM_GLOW, view.ringAlpha * 0.25);
    this.warning.strokeCircle(x, y, radius + 4);
    this.warning.lineStyle(3, SCRAPSTORM_COLOR, view.ringAlpha);
    this.warning.strokeCircle(x, y, radius);

    // Closing progress arc makes the impact instant readable without
    // requiring the player to parse the numeric countdown.
    this.warning.lineStyle(5, SCRAPSTORM_GLOW, view.ringAlpha);
    this.warning.beginPath();
    this.warning.arc(x, y, radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * view.progress);
    this.warning.strokePath();

    // Four inward ticks keep the exact danger boundary legible over busy maps.
    this.warning.lineStyle(3, SCRAPSTORM_GLOW, view.ringAlpha);
    const tickOuter = radius + 5;
    const tickInner = radius - 13;
    this.warning.lineBetween(x - tickOuter, y, x - tickInner, y);
    this.warning.lineBetween(x + tickOuter, y, x + tickInner, y);
    this.warning.lineBetween(x, y - tickOuter, x, y - tickInner);
    this.warning.lineBetween(x, y + tickOuter, x, y + tickInner);

    this.countdown
      .setText(view.countdown)
      .setPosition(x, y - radius - 18)
      .setVisible(true);
    this.localWarning.setVisible(view.targeted);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.warning, this.countdown, this.localWarning]);
    this.warning.destroy();
    this.countdown.destroy();
    this.localWarning.destroy();
  }
}
