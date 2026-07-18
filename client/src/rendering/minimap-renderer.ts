import Phaser from 'phaser';

import { Wasteland, cssHex } from '@shared/config/palette.js';
import type { BattleRoyaleBiome, CollisionGrid, MapData } from '@shared/types/map.js';

import { MENU_FONTS } from '../ui/menu/fonts.js';
import { MODERN_UI_TEXTURE_KEY, modernUiIconFrame } from '../ui/modern-ui-contract.js';
import {
  createModernUiNineSlice,
  menuHeaderFont,
  modernUiEnabledForScene,
} from '../ui/modern-ui-runtime.js';
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
const REGION_COLORS: Readonly<Record<BattleRoyaleBiome, number>> = Object.freeze({
  wasteland: 0x7a5738,
  overgrown: 0x355b43,
  industrial: 0x554b49,
  irradiated: 0x514365,
});

export class MinimapRenderer {
  private readonly staticGraphics: Phaser.GameObjects.Graphics;
  private readonly dynamicGraphics: Phaser.GameObjects.Graphics;
  private readonly modernPanel: Phaser.GameObjects.NineSlice | null;
  private readonly modernIcon: Phaser.GameObjects.Image | null;
  private readonly title: Phaser.GameObjects.Text;
  private regionLabels: Phaser.GameObjects.Text[] = [];
  private staticProjection: MinimapStaticProjection;
  private dynamicProjection: MinimapDynamicProjection = Object.freeze({
    objectives: Object.freeze([]),
    players: Object.freeze([]),
    safeZone: null,
  });

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapData: MapData,
    private readonly collisionGrid: CollisionGrid,
    private layout: MinimapLayout,
  ) {
    const modern = modernUiEnabledForScene(scene);
    this.modernPanel = modern
      ? createModernUiNineSlice(
          this.scene,
          'tactical',
          layout.panel.x,
          layout.panel.y,
          layout.panel.width,
          layout.panel.height,
        )
          .setScrollFactor(0)
          .setDepth(MINIMAP_STATIC_DEPTH - 1)
      : null;
    this.modernIcon = modern
      ? this.scene.add
          .image(
            layout.panel.x + 16,
            layout.title.y + 7,
            MODERN_UI_TEXTURE_KEY,
            modernUiIconFrame('minimap'),
          )
          .setDisplaySize(20, 20)
          .setScrollFactor(0)
          .setDepth(MINIMAP_TITLE_DEPTH)
      : null;
    this.staticGraphics = this.scene.add.graphics();
    this.staticGraphics.setName('minimap-static');
    this.staticGraphics.setScrollFactor(0);
    this.staticGraphics.setDepth(MINIMAP_STATIC_DEPTH);

    this.dynamicGraphics = this.scene.add.graphics();
    this.dynamicGraphics.setName('minimap-dynamic');
    this.dynamicGraphics.setScrollFactor(0);
    this.dynamicGraphics.setDepth(MINIMAP_DYNAMIC_DEPTH);

    this.title = this.scene.add.text(
      modern ? layout.title.x + 24 : layout.title.x,
      layout.title.y,
      modern ? 'TACTICAL / MINIMAP' : 'MINIMAP',
      {
        fontFamily: modern ? menuHeaderFont(scene) : MENU_FONTS.BODY,
        fontSize: '10px',
        color: cssHex(Wasteland.TEXT_PRIMARY),
        stroke: '#000000',
        strokeThickness: 2,
      },
    );
    this.title.setScrollFactor(0);
    this.title.setDepth(MINIMAP_TITLE_DEPTH);

    this.staticProjection = createMinimapStaticProjection(mapData, collisionGrid, layout);
    this.drawStatic();
  }

  setLayout(layout: MinimapLayout): void {
    this.layout = layout;
    this.modernPanel
      ?.setPosition(layout.panel.x, layout.panel.y)
      .setSize(layout.panel.width, layout.panel.height);
    this.modernIcon?.setPosition(layout.panel.x + 16, layout.title.y + 7);
    this.title.setPosition(this.modernPanel ? layout.title.x + 24 : layout.title.x, layout.title.y);
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
    regions: MinimapStaticProjection['regions'];
    containers: MinimapStaticProjection['containers'];
    solidCount: number;
    landmarkCount: number;
    landmarks: MinimapStaticProjection['landmarks'];
    objectives: MinimapDynamicProjection['objectives'];
    players: MinimapDynamicProjection['players'];
    safeZone: MinimapDynamicProjection['safeZone'];
    scrollFactors: readonly number[];
    interactive: false;
  }> {
    return Object.freeze({
      layout: this.layout,
      worldBounds: this.staticProjection.worldBounds,
      regions: this.staticProjection.regions,
      containers: this.staticProjection.containers,
      solidCount: this.staticProjection.solids.length,
      landmarkCount: this.staticProjection.landmarks.length,
      landmarks: this.staticProjection.landmarks,
      objectives: this.dynamicProjection.objectives,
      players: this.dynamicProjection.players,
      safeZone: this.dynamicProjection.safeZone,
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
    this.modernPanel?.destroy();
    this.modernIcon?.destroy();
    this.staticGraphics.destroy();
    this.dynamicGraphics.destroy();
    this.title.destroy();
    for (const label of this.regionLabels) label.destroy();
    this.regionLabels = [];
  }

  getChromeFrame(): string | null {
    return this.modernPanel?.frame.name ?? null;
  }

  private drawStatic(): void {
    const gfx = this.staticGraphics;
    const panel = this.layout.panel;
    const map = this.layout.map;
    gfx.clear();

    if (!this.modernPanel) {
      gfx.fillStyle(Wasteland.HUD_STRIP_BG, 0.9);
      gfx.fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 4);
      gfx.lineStyle(1, 0x65737e, 0.95);
      gfx.strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 4);
    }

    gfx.fillStyle(0x121820, 0.96);
    gfx.fillRect(map.x, map.y, map.width, map.height);
    for (const region of this.staticProjection.regions) {
      gfx.fillStyle(REGION_COLORS[region.biome], 0.48);
      for (const area of region.areas) gfx.fillRect(area.x, area.y, area.width, area.height);
    }
    for (const solid of this.staticProjection.solids) {
      gfx.fillStyle(0x697078, 0.78);
      gfx.fillRect(solid.x, solid.y, Math.max(1, solid.width), Math.max(1, solid.height));
    }
    for (const container of this.staticProjection.containers) {
      gfx.fillStyle(0xf0b94d, 1);
      gfx.fillRect(
        container.x,
        container.y,
        Math.max(2, container.width),
        Math.max(2, container.height),
      );
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

    for (const label of this.regionLabels) label.destroy();
    this.regionLabels = this.staticProjection.regions.map((region) =>
      this.scene.add
        .text(region.label.x, region.label.y, region.displayName, {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '6px',
          color: cssHex(Wasteland.TEXT_PRIMARY),
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(MINIMAP_TITLE_DEPTH),
    );
  }

  private drawDynamic(): void {
    const gfx = this.dynamicGraphics;
    gfx.clear();

    const safeZone = this.dynamicProjection.safeZone;
    if (safeZone?.next) {
      gfx.lineStyle(1, 0x62e6ff, 0.65);
      gfx.strokeCircle(safeZone.next.center.x, safeZone.next.center.y, safeZone.next.radius);
    }
    if (safeZone) {
      gfx.lineStyle(2, 0xb8ff62, 0.95);
      gfx.strokeCircle(
        safeZone.current.center.x,
        safeZone.current.center.y,
        Math.max(1, safeZone.current.radius),
      );
    }

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
