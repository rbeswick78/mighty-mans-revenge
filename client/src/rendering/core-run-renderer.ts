import Phaser from 'phaser';
import type { PlayerId } from '@shared/types/common.js';
import type { CoreRunState } from '@shared/types/game.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { declareWorldSpace, placeInWorld, worldPoint } from './gameplay-coordinate-space.js';

const LOOSE_COLOR = 0xffc857;
const LOCAL_COLOR = 0x7dffb2;
const RIVAL_COLOR = 0xff6b5c;

/** Palette-native world marker for the neutral/carried Core Run objective. */
export class CoreRunRenderer {
  private readonly container: Phaser.GameObjects.Container;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly glow: Phaser.GameObjects.Arc;
  private readonly core: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly pulse: Phaser.Tweens.Tween;
  private relation: 'loose' | 'local' | 'rival' = 'loose';
  private positioned = false;

  constructor(scene: Phaser.Scene) {
    this.glow = scene.add.circle(0, 0, 18, LOOSE_COLOR, 0.2);
    this.core = scene.add.graphics();
    this.label = scene.add.text(0, 15, 'CORE', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: '7px',
      color: cssHex(LOOSE_COLOR),
      stroke: cssHex(Wasteland.HUD_STRIP_BG),
      strokeThickness: 2,
    });
    this.label.setOrigin(0.5, 0);
    this.visual = scene.add.container(0, 0, [this.glow, this.core, this.label]);
    this.container = scene.add.container(0, 0, [this.visual]);
    declareWorldSpace(this.container);
    this.container.setDepth(24).setVisible(false);
    this.pulse = scene.tweens.add({
      targets: this.visual,
      scaleX: { from: 0.92, to: 1.08 },
      scaleY: { from: 0.92, to: 1.08 },
      duration: 520,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.restyle('loose');
  }

  update(state: CoreRunState | null, localPlayerId: PlayerId | null): void {
    if (!state) {
      this.container.setVisible(false);
      this.positioned = false;
      return;
    }

    const relation =
      state.carrierId === null ? 'loose' : state.carrierId === localPlayerId ? 'local' : 'rival';
    if (relation !== this.relation) this.restyle(relation);

    const targetY = state.position.y + (state.carrierId === null ? 0 : -30);
    if (!this.positioned) {
      placeInWorld(this.container, worldPoint(state.position.x, targetY));
      this.positioned = true;
    } else {
      placeInWorld(
        this.container,
        worldPoint(
          Phaser.Math.Linear(this.container.x, state.position.x, 0.4),
          Phaser.Math.Linear(this.container.y, targetY, 0.4),
        ),
      );
    }
    this.container.setVisible(true);
  }

  private restyle(relation: 'loose' | 'local' | 'rival'): void {
    this.relation = relation;
    const color =
      relation === 'local' ? LOCAL_COLOR : relation === 'rival' ? RIVAL_COLOR : LOOSE_COLOR;
    this.glow.setFillStyle(color, 0.22);
    this.core.clear();
    this.core.fillStyle(color, 1);
    this.core.lineStyle(2, Wasteland.HUD_STRIP_BG, 1);
    const points = [
      new Phaser.Geom.Point(0, -11),
      new Phaser.Geom.Point(10, 0),
      new Phaser.Geom.Point(0, 11),
      new Phaser.Geom.Point(-10, 0),
    ];
    this.core.fillPoints(points, true);
    this.core.strokePoints(points, true);
    this.label.setText(relation === 'loose' ? 'CORE' : 'CARRY');
    this.label.setColor(cssHex(color));
  }

  destroy(): void {
    this.pulse.stop();
    this.container.destroy();
  }
}
