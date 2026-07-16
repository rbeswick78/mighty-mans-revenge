import Phaser from 'phaser';

import { Wasteland, cssHex } from '@shared/config/palette.js';
import type { CollisionGrid, MapData } from '@shared/types/map.js';

import { MENU_FONTS } from '../ui/menu/fonts.js';
import {
  createMinimapDynamicProjection,
  createMinimapStaticProjection,
  type MinimapDynamicInput,
  type MinimapDynamicProjection,
  type MinimapLandmarkKind,
  type MinimapLayout,
  type MinimapStaticProjection,
} from '../ui/minimap-foundation.js';

const MINIMAP_STATIC_DEPTH = 980;
const MINIMAP_DYNAMIC_DEPTH = 981;
const MINIMAP_TITLE_DEPTH = 982;

const LANDMARK_COLORS: Readonly<Record<MinimapLandmarkKind, number>> = Object.freeze({
  prop: 0x8a7967,
  hazard: Wasteland.TEXT_GRENADE_LIVE,
  gate: Wasteland.TEXT_LOADING,
  cache: Wasteland.TEXT_RELOAD_WARNING,
});

export class MinimapRenderer {
  private readonly staticGraphics: Phaser.GameObjects.Graphics;
  private readonly dynamicGraphics: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private staticProjection: MinimapStaticProjection;
  private dynamicProjection: MinimapDynamicProjection = Object.freeze({
    objectives: Object.freeze([]),
    players: Object.freeze([]),
  });

  constructor(
    scene: Phaser.Scene,
    private readonly mapData: MapData,
    private readonly collisionGrid: CollisionGrid,
    private layout: MinimapLayout,
  ) {
    this.staticGraphics = scene.add.graphics();
    this.staticGraphics.setName('minimap-static');
    this.staticGraphics.setScrollFactor(0);
    this.staticGraphics.setDepth(MINIMAP_STATIC_DEPTH);

    this.dynamicGraphics = scene.add.graphics();
    this.dynamicGraphics.setName('minimap-dynamic');
    this.dynamicGraphics.setScrollFactor(0);
    this.dynamicGraphics.setDepth(MINIMAP_DYNAMIC_DEPTH);

    this.title = scene.add.text(layout.title.x, layout.title.y, 'MINIMAP', {
      fontFamily: MENU_FONTS.BODY,
      fontSize: '10px',
      color: cssHex(Wasteland.TEXT_PRIMARY),
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.title.setScrollFactor(0);
    this.title.setDepth(MINIMAP_TITLE_DEPTH);

    this.staticProjection = createMinimapStaticProjection(mapData, collisionGrid, layout);
    this.drawStatic();
  }

  setLayout(layout: MinimapLayout): void {
    this.layout = layout;
    this.title.setPosition(layout.title.x, layout.title.y);
    this.refreshStatic();
  }

  refreshStatic(): void {
    this.staticProjection = createMinimapStaticProjection(
      this.mapData,
      this.collisionGrid,
      this.layout,
    );
    this.drawStatic();
  }

  update(input: MinimapDynamicInput): void {
    this.dynamicProjection = createMinimapDynamicProjection(this.mapData, this.layout, input);
    this.drawDynamic();
  }

  getRenderState(): Readonly<{
    layout: MinimapLayout;
    worldBounds: MinimapStaticProjection['worldBounds'];
    solidCount: number;
    landmarkCount: number;
    landmarks: MinimapStaticProjection['landmarks'];
    objectives: MinimapDynamicProjection['objectives'];
    players: MinimapDynamicProjection['players'];
    scrollFactors: readonly number[];
    interactive: false;
  }> {
    return Object.freeze({
      layout: this.layout,
      worldBounds: this.staticProjection.worldBounds,
      solidCount: this.staticProjection.solids.length,
      landmarkCount: this.staticProjection.landmarks.length,
      landmarks: this.staticProjection.landmarks,
      objectives: this.dynamicProjection.objectives,
      players: this.dynamicProjection.players,
      scrollFactors: Object.freeze([
        this.staticGraphics.scrollFactorX,
        this.staticGraphics.scrollFactorY,
        this.dynamicGraphics.scrollFactorX,
        this.dynamicGraphics.scrollFactorY,
        this.title.scrollFactorX,
        this.title.scrollFactorY,
      ]),
      interactive: false,
    });
  }

  destroy(): void {
    this.staticGraphics.destroy();
    this.dynamicGraphics.destroy();
    this.title.destroy();
  }

  private drawStatic(): void {
    const gfx = this.staticGraphics;
    const panel = this.layout.panel;
    const map = this.layout.map;
    gfx.clear();

    gfx.fillStyle(Wasteland.HUD_STRIP_BG, 0.9);
    gfx.fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 4);
    gfx.lineStyle(1, 0x65737e, 0.95);
    gfx.strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 4);

    gfx.fillStyle(0x121820, 0.96);
    gfx.fillRect(map.x, map.y, map.width, map.height);
    for (const solid of this.staticProjection.solids) {
      gfx.fillStyle(0x697078, 0.78);
      gfx.fillRect(solid.x, solid.y, Math.max(1, solid.width), Math.max(1, solid.height));
    }
    for (const landmark of this.staticProjection.landmarks) {
      gfx.fillStyle(LANDMARK_COLORS[landmark.kind], 0.95);
      gfx.fillRect(
        landmark.x,
        landmark.y,
        Math.max(2, landmark.width),
        Math.max(2, landmark.height),
      );
    }
    gfx.lineStyle(1, Wasteland.TEXT_PRIMARY, 0.8);
    gfx.strokeRect(map.x, map.y, map.width, map.height);
  }

  private drawDynamic(): void {
    const gfx = this.dynamicGraphics;
    gfx.clear();

    for (const objective of this.dynamicProjection.objectives) {
      if ((objective.kind === 'koth' || objective.kind === 'next-koth') && objective.rect) {
        const color = objective.kind === 'koth' ? Wasteland.HEALTH_GOOD : Wasteland.TEXT_LOADING;
        gfx.fillStyle(color, objective.kind === 'koth' ? 0.22 : 0.08);
        gfx.fillRect(
          objective.rect.x,
          objective.rect.y,
          objective.rect.width,
          objective.rect.height,
        );
        gfx.lineStyle(2, color, objective.kind === 'koth' ? 1 : 0.7);
        gfx.strokeRect(
          objective.rect.x,
          objective.rect.y,
          objective.rect.width,
          objective.rect.height,
        );
      } else if (objective.kind === 'tag' && objective.point) {
        gfx.fillStyle(Wasteland.TEXT_LOADING, 1);
        gfx.fillRect(objective.point.x - 2, objective.point.y - 2, 4, 4);
      } else if (objective.kind === 'core' && objective.point) {
        this.drawDiamond(gfx, objective.point.x, objective.point.y, 5, 0x62e6ff, 1);
      } else if (objective.kind === 'bounty' && objective.point) {
        gfx.lineStyle(2, Wasteland.TEXT_RELOAD_WARNING, 1);
        gfx.strokeCircle(objective.point.x, objective.point.y, 6);
        gfx.fillStyle(Wasteland.TEXT_RELOAD_WARNING, 1);
        gfx.fillCircle(objective.point.x, objective.point.y, 2);
      }
    }

    for (const player of this.dynamicProjection.players) {
      const alpha = player.isDead ? 0.4 : 1;
      if (player.kind === 'local') {
        gfx.fillStyle(0x62e6ff, alpha);
        gfx.fillCircle(player.point.x, player.point.y, 4);
        gfx.lineStyle(1, 0x091016, alpha);
        gfx.strokeCircle(player.point.x, player.point.y, 4);
      } else {
        this.drawDiamond(gfx, player.point.x, player.point.y, 4, Wasteland.HEALTH_GOOD, alpha);
      }
      if (player.isDead) {
        gfx.lineStyle(1, Wasteland.TEXT_GRENADE_LIVE, 0.8);
        gfx.lineBetween(
          player.point.x - 3,
          player.point.y - 3,
          player.point.x + 3,
          player.point.y + 3,
        );
        gfx.lineBetween(
          player.point.x + 3,
          player.point.y - 3,
          player.point.x - 3,
          player.point.y + 3,
        );
      }
    }
  }

  private drawDiamond(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number,
  ): void {
    gfx.fillStyle(color, alpha);
    gfx.beginPath();
    gfx.moveTo(x, y - radius);
    gfx.lineTo(x + radius, y);
    gfx.lineTo(x, y + radius);
    gfx.lineTo(x - radius, y);
    gfx.closePath();
    gfx.fillPath();
  }
}
