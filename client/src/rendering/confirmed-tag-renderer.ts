import Phaser from 'phaser';
import type { KillConfirmedTagState } from '@shared/types/game.js';
import type { PlayerId } from '@shared/types/common.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { confirmedTagPresentation } from '../ui/confirmed-tag.js';

interface RenderedTag {
  container: Phaser.GameObjects.Container;
  diamond: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  ownerId: PlayerId;
  ownTag: boolean;
  bobTween: Phaser.Tweens.Tween;
}

/** Procedural, palette-native dog tags: gold to confirm, green to deny. */
export class ConfirmedTagRenderer {
  private readonly tags = new Map<string, RenderedTag>();

  constructor(private readonly scene: Phaser.Scene) {}

  update(tags: readonly KillConfirmedTagState[], localPlayerId: PlayerId | null): void {
    const liveIds = new Set<string>();
    for (const state of tags) {
      liveIds.add(state.id);
      const ownTag = state.ownerId === localPlayerId;
      let rendered = this.tags.get(state.id);
      if (!rendered) {
        rendered = this.create(state, localPlayerId);
        this.tags.set(state.id, rendered);
      } else if (rendered.ownerId !== state.ownerId || rendered.ownTag !== ownTag) {
        rendered.ownerId = state.ownerId;
        rendered.ownTag = ownTag;
        this.restyle(rendered, ownTag);
      }
      rendered.container.setPosition(state.position.x, state.position.y);
    }

    for (const [id, rendered] of this.tags) {
      if (liveIds.has(id)) continue;
      rendered.bobTween.stop();
      rendered.container.destroy();
      this.tags.delete(id);
    }
  }

  private create(state: KillConfirmedTagState, localPlayerId: PlayerId | null): RenderedTag {
    const diamond = this.scene.add.graphics();
    const label = this.scene.add.text(0, 12, '', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: '7px',
      color: cssHex(Wasteland.TEXT_PRIMARY),
      stroke: '#2e222f',
      strokeThickness: 2,
    });
    label.setOrigin(0.5, 0);
    const visual = this.scene.add.container(0, 0, [diamond, label]);
    const container = this.scene.add.container(state.position.x, state.position.y, [
      visual,
    ]);
    container.setDepth(20);
    const bobTween = this.scene.tweens.add({
      targets: visual,
      y: { from: -2, to: 2 },
      duration: 550,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    const ownTag = state.ownerId === localPlayerId;
    const rendered = {
      container,
      diamond,
      label,
      ownerId: state.ownerId,
      ownTag,
      bobTween,
    };
    this.restyle(rendered, ownTag);
    return rendered;
  }

  private restyle(rendered: RenderedTag, ownTag: boolean): void {
    const presentation = confirmedTagPresentation(ownTag);
    const color = presentation.color;
    rendered.diamond.clear();
    rendered.diamond.fillStyle(color, 1);
    rendered.diamond.lineStyle(2, Wasteland.HUD_STRIP_BG, 1);
    const points = [
      new Phaser.Geom.Point(0, -9),
      new Phaser.Geom.Point(9, 0),
      new Phaser.Geom.Point(0, 9),
      new Phaser.Geom.Point(-9, 0),
    ];
    rendered.diamond.fillPoints(points, true);
    rendered.diamond.strokePoints(points, true);
    rendered.label.setText(presentation.label);
    rendered.label.setColor(cssHex(color));
  }

  destroy(): void {
    for (const rendered of this.tags.values()) {
      rendered.bobTween.stop();
      rendered.container.destroy();
    }
    this.tags.clear();
  }
}
