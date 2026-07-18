import Phaser from 'phaser';

import type { Vec2 } from '@shared/types/common.js';
import type { BattleRoyaleSafeZoneState } from '@shared/types/game.js';
import { isOutsideBattleRoyaleSafeZone } from '@shared/utils/battle-royale-safe-zone.js';

import { declareScreenSpace, declareWorldSpace } from './gameplay-coordinate-space.js';

const CURRENT_COLOR = 0xb8ff62;
const NEXT_COLOR = 0x62e6ff;

export interface BattleRoyaleSafeZonePresentation {
  readonly visible: boolean;
  readonly outside: boolean;
  readonly boundaryAlpha: number;
  readonly washAlpha: number;
  readonly status: string;
}

export function battleRoyaleSafeZonePresentation(
  state: BattleRoyaleSafeZoneState | null,
  localPosition: Vec2 | null,
  timeMs: number,
): BattleRoyaleSafeZonePresentation {
  if (!state) {
    return { visible: false, outside: false, boundaryAlpha: 0, washAlpha: 0, status: '' };
  }
  const pulse = (Math.sin(timeMs / 160) + 1) / 2;
  const outside = localPosition !== null && isOutsideBattleRoyaleSafeZone(localPosition, state);
  const phase = state.phase === 'final' ? 'FINAL CLOSURE' : state.phase.toUpperCase();
  return {
    visible: true,
    outside,
    boundaryAlpha: 0.65 + pulse * 0.3,
    washAlpha: outside ? 0.1 + pulse * 0.07 : 0,
    status: outside
      ? `OUTSIDE SAFE ZONE · ${state.damagePerPulse} DAMAGE`
      : `${phase} · ${Math.ceil(state.phaseSecondsRemaining)}s`,
  };
}

/** Pure projection of server-owned BR circle state into world and HUD warnings. */
export class BattleRoyaleSafeZoneRenderer {
  private readonly boundary: Phaser.GameObjects.Graphics;
  private readonly wash: Phaser.GameObjects.Rectangle;
  private readonly warning: Phaser.GameObjects.Text;
  private presentation: BattleRoyaleSafeZonePresentation = battleRoyaleSafeZonePresentation(
    null,
    null,
    0,
  );

  constructor(
    private readonly scene: Phaser.Scene,
    viewport: Readonly<{ width: number; height: number }>,
  ) {
    this.boundary = declareWorldSpace(scene.add.graphics()).setDepth(1402);
    this.wash = declareScreenSpace(
      scene.add.rectangle(0, 0, viewport.width, viewport.height, CURRENT_COLOR, 0).setOrigin(0, 0),
    )
      .setDepth(1452)
      .setVisible(false);
    this.warning = declareScreenSpace(
      scene.add.text(viewport.width / 2, viewport.height - 30, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#e8ffd0',
        stroke: '#10220a',
        strokeThickness: 4,
      }),
    )
      .setOrigin(0.5)
      .setDepth(1453)
      .setVisible(false);
  }

  update(
    state: BattleRoyaleSafeZoneState | null,
    localPosition: Vec2 | null,
    timeMs: number,
  ): void {
    this.presentation = battleRoyaleSafeZonePresentation(state, localPosition, timeMs);
    this.boundary.clear();
    if (!state) {
      this.wash.setVisible(false);
      this.warning.setVisible(false);
      return;
    }
    if (state.nextCenter && state.nextRadius !== null) {
      this.boundary.lineStyle(2, NEXT_COLOR, 0.58);
      this.boundary.strokeCircle(
        state.nextCenter.x,
        state.nextCenter.y,
        Math.max(1, state.nextRadius),
      );
    }
    this.boundary.lineStyle(6, CURRENT_COLOR, this.presentation.boundaryAlpha * 0.22);
    this.boundary.strokeCircle(state.center.x, state.center.y, Math.max(1, state.radius + 5));
    this.boundary.lineStyle(3, CURRENT_COLOR, this.presentation.boundaryAlpha);
    this.boundary.strokeCircle(state.center.x, state.center.y, Math.max(1, state.radius));
    this.wash
      .setFillStyle(CURRENT_COLOR, this.presentation.washAlpha)
      .setVisible(this.presentation.outside);
    this.warning.setText(this.presentation.status).setVisible(true);
  }

  getRenderState(): BattleRoyaleSafeZonePresentation {
    return Object.freeze({ ...this.presentation });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.boundary, this.wash, this.warning]);
    this.boundary.destroy();
    this.wash.destroy();
    this.warning.destroy();
  }
}
