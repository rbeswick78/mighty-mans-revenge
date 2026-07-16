import Phaser from 'phaser';
import type { Vec2 } from '@shared/types/common.js';
import type { RadiationStormState } from '@shared/types/game.js';
import { isOutsideRadiationStorm } from '@shared/utils/radiation-storm.js';
import { MAP_HEIGHT_PX, MAP_WIDTH_PX } from '../ui/layout.js';
import { declareScreenSpace, declareWorldSpace } from './gameplay-coordinate-space.js';

const RADIATION_COLOR = 0x8cff2f;

export interface RadiationStormPresentation {
  visible: boolean;
  outside: boolean;
  boundaryAlpha: number;
  washAlpha: number;
}

/** Pure projection shared by renderer tests and the live Phaser objects. */
export function radiationStormPresentation(
  state: RadiationStormState | null,
  localPosition: Vec2 | null,
  timeMs: number,
): RadiationStormPresentation {
  if (!state) return { visible: false, outside: false, boundaryAlpha: 0, washAlpha: 0 };
  const pulse = (Math.sin(timeMs / 180) + 1) / 2;
  const outside = localPosition !== null && isOutsideRadiationStorm(localPosition, state);
  return {
    visible: true,
    outside,
    boundaryAlpha: 0.65 + pulse * 0.3,
    washAlpha: outside ? 0.08 + pulse * 0.06 : 0,
  };
}

/** Snapshot-driven radioactive boundary and local outside warning. */
export class RadiationStormRenderer {
  private readonly scene: Phaser.Scene;
  private readonly boundary: Phaser.GameObjects.Graphics;
  private readonly wash: Phaser.GameObjects.Rectangle;
  private readonly warning: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.boundary = declareWorldSpace(scene.add.graphics()).setDepth(1400);
    this.wash = declareScreenSpace(
      scene.add.rectangle(0, 0, MAP_WIDTH_PX, MAP_HEIGHT_PX, RADIATION_COLOR, 0).setOrigin(0, 0),
    )
      .setDepth(1450)
      .setVisible(false);
    this.warning = declareScreenSpace(
      scene.add
        .text(MAP_WIDTH_PX / 2, MAP_HEIGHT_PX - 28, 'RADIATION - MOVE INSIDE', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#d8ff9b',
          stroke: '#18330d',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    )
      .setDepth(1451)
      .setVisible(false);
  }

  update(state: RadiationStormState | null, localPosition: Vec2 | null, timeMs: number): void {
    const view = radiationStormPresentation(state, localPosition, timeMs);
    this.boundary.clear();
    if (!state || !view.visible) {
      this.wash.setVisible(false);
      this.warning.setVisible(false);
      return;
    }

    this.boundary.lineStyle(5, RADIATION_COLOR, view.boundaryAlpha * 0.25);
    this.boundary.strokeCircle(state.center.x, state.center.y, state.radius + 5);
    this.boundary.lineStyle(2, RADIATION_COLOR, view.boundaryAlpha);
    this.boundary.strokeCircle(state.center.x, state.center.y, state.radius);
    this.wash.setFillStyle(RADIATION_COLOR, view.washAlpha).setVisible(view.outside);
    this.warning.setVisible(view.outside);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.boundary, this.wash, this.warning]);
    this.boundary.destroy();
    this.wash.destroy();
    this.warning.destroy();
  }
}
