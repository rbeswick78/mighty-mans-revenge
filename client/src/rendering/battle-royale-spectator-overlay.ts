import Phaser from 'phaser';

import { Wasteland, cssHex } from '@shared/config/palette.js';
import type { BattleRoyaleSpectatorPresentation } from '../ui/battle-royale-spectator.js';
import type { ResponsiveCombatHudLayout } from '../ui/responsive-combat-hud.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';

const DEPTH = 23_000;

/** Screen-space controls and labels; all content is a projection of server state. */
export class BattleRoyaleSpectatorOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly placement: Phaser.GameObjects.Text;
  private readonly target: Phaser.GameObjects.Text;
  private readonly context: Phaser.GameObjects.Text;
  private readonly previous: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private readonly results: Phaser.GameObjects.Text;
  private active = false;
  private targetId: string | null = null;

  constructor(
    scene: Phaser.Scene,
    layout: ResponsiveCombatHudLayout,
    onPrevious: () => void,
    onNext: () => void,
    onResults: () => void,
  ) {
    this.background = scene.add.rectangle(0, 0, 600, 118, Wasteland.HUD_STRIP_BG, 0.94);
    this.background.setStrokeStyle(2, Wasteland.COVER_FILL, 0.9);
    this.placement = scene.add.text(0, -28, '', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: '12px',
      color: '#b8ff62',
    });
    this.placement.setOrigin(0.5);
    this.target = scene.add.text(0, -4, '', {
      fontFamily: MENU_FONTS.BODY,
      fontSize: '15px',
      color: cssHex(Wasteland.TEXT_PRIMARY),
    });
    this.target.setOrigin(0.5);
    this.context = scene.add.text(0, 20, '', {
      fontFamily: MENU_FONTS.BODY,
      fontSize: '10px',
      color: cssHex(Wasteland.TEXT_NICKNAME),
    });
    this.context.setOrigin(0.5);
    this.previous = this.control(scene, '◀ PREV', -248, onPrevious);
    this.next = this.control(scene, 'NEXT ▶', 248, onNext);
    this.results = this.control(scene, 'RESULTS', 0, onResults).setY(48);
    this.container = scene.add.container(0, 0, [
      this.background,
      this.placement,
      this.target,
      this.context,
      this.previous,
      this.next,
      this.results,
    ]);
    this.container.setDepth(DEPTH).setScrollFactor(0).setVisible(false);
    this.container.setName('battle-royale-spectator-overlay');
    this.setLayout(layout);
  }

  setLayout(layout: ResponsiveCombatHudLayout): void {
    this.container.setPosition(layout.logicalWidth / 2, layout.safeArea.top + 58);
  }

  update(presentation: BattleRoyaleSpectatorPresentation): void {
    this.active = presentation.active;
    this.targetId = presentation.targetId;
    this.container.setVisible(presentation.active);
    if (!presentation.active) return;
    this.placement.setText(`${presentation.placementLabel}  ·  ${presentation.aliveLabel}`);
    this.target.setText(presentation.targetLabel);
    this.context.setText(`${presentation.killerLabel}  ·  Q/E OR D-PAD TO CYCLE`);
    const hasTarget = presentation.targetId !== null;
    this.previous.setAlpha(hasTarget ? 1 : 0.35).disableInteractive();
    this.next.setAlpha(hasTarget ? 1 : 0.35).disableInteractive();
    if (hasTarget) {
      this.previous.setInteractive({ useHandCursor: true });
      this.next.setInteractive({ useHandCursor: true });
    }
  }

  getRenderState(): Readonly<{ active: boolean; targetId: string | null }> {
    return Object.freeze({ active: this.active, targetId: this.targetId });
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private control(
    scene: Phaser.Scene,
    label: string,
    x: number,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    return scene.add
      .text(x, 0, label, {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '12px',
        color: cssHex(Wasteland.TEXT_PRIMARY),
        backgroundColor: '#26333d',
        padding: { x: 10, y: 7 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
  }
}
