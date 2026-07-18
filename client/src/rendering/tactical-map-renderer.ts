import Phaser from 'phaser';

import { Wasteland, cssHex } from '@shared/config/palette.js';
import type { Vec2 } from '@shared/types/common.js';
import type { BattleRoyaleSafeZoneState } from '@shared/types/game.js';
import type { BattleRoyaleBiome, CollisionGrid, MapData } from '@shared/types/map.js';

import { MENU_FONTS } from '../ui/menu/fonts.js';
import {
  createMinimapStaticProjection,
  projectWorldPointToMinimap,
  type MinimapLayout,
  type MinimapStaticProjection,
} from '../ui/minimap-foundation.js';
import type { TacticalMapLayout } from '../ui/tactical-map-foundation.js';

const DEPTH = 1800;
const REGION_COLORS: Readonly<Record<BattleRoyaleBiome, number>> = Object.freeze({
  wasteland: 0x7a5738,
  overgrown: 0x355b43,
  industrial: 0x554b49,
  irradiated: 0x514365,
});

export interface TacticalMapRenderState {
  readonly open: boolean;
  readonly layout: TacticalMapLayout;
  readonly regions: number;
  readonly landmarks: number;
  readonly containers: number;
  readonly localPoint: Readonly<Vec2> | null;
  readonly safeZonePhase: BattleRoyaleSafeZoneState['phase'] | null;
  readonly rivalMarkers: 0;
}

/** BR-only large map. It deliberately accepts no rival-player collection. */
export class TacticalMapRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly launcher: Phaser.GameObjects.Rectangle;
  private readonly launcherText: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text[] = [];
  private open = false;
  private localPoint: Vec2 | null = null;
  private safeZonePhase: BattleRoyaleSafeZoneState['phase'] | null = null;
  private projection: MinimapStaticProjection;
  private latestState: BattleRoyaleSafeZoneState | null = null;
  private latestLocalPosition: Vec2 | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapData: MapData,
    private readonly collisionGrid: CollisionGrid,
    private layout: TacticalMapLayout,
    onToggle: () => void,
  ) {
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH).setVisible(false);
    this.graphics.setName('battle-royale-tactical-map');
    this.title = scene.add
      .text(layout.title.x, layout.title.y, 'SHATTERLANDS · TACTICAL MAP', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '18px',
        color: cssHex(Wasteland.TEXT_PRIMARY),
      })
      .setScrollFactor(0)
      .setDepth(DEPTH + 2)
      .setVisible(false);
    this.hint = scene.add
      .text(layout.hint.x, layout.hint.y, 'M / D-PAD UP / TAP MAP TO CLOSE', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '11px',
        color: cssHex(Wasteland.TEXT_NICKNAME),
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 2)
      .setVisible(false);
    this.launcher = scene.add
      .rectangle(
        layout.launcher.x,
        layout.launcher.y,
        layout.launcher.width,
        layout.launcher.height,
        0x18232b,
        0.94,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH + 3)
      .setInteractive({ useHandCursor: true });
    this.launcher.setName('battle-royale-tactical-map-button');
    this.launcher.on('pointerup', onToggle);
    this.launcherText = scene.add
      .text(
        layout.launcher.x + layout.launcher.width / 2,
        layout.launcher.y + layout.launcher.height / 2,
        'MAP',
        { fontFamily: MENU_FONTS.BODY, fontSize: '13px', color: '#b8ff62' },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 4);
    this.projection = this.createProjection();
    this.rebuildLabels();
    this.draw(null, null);
  }

  setLayout(layout: TacticalMapLayout): void {
    this.layout = layout;
    this.title.setPosition(layout.title.x, layout.title.y);
    this.hint.setPosition(layout.hint.x, layout.hint.y);
    this.launcher
      .setPosition(layout.launcher.x, layout.launcher.y)
      .setSize(layout.launcher.width, layout.launcher.height);
    this.launcherText.setPosition(
      layout.launcher.x + layout.launcher.width / 2,
      layout.launcher.y + layout.launcher.height / 2,
    );
    this.projection = this.createProjection();
    this.rebuildLabels();
    if (this.open) this.draw(this.latestState, this.latestLocalPosition);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.graphics.setVisible(open);
    this.title.setVisible(open);
    this.hint.setVisible(open);
    for (const label of this.labels) label.setVisible(open);
    if (open) this.draw(this.latestState, this.latestLocalPosition);
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): boolean {
    this.setOpen(!this.open);
    return this.open;
  }

  update(state: BattleRoyaleSafeZoneState | null, localPosition: Vec2 | null): void {
    this.latestState = state;
    this.latestLocalPosition = localPosition ? { ...localPosition } : null;
    if (this.open) this.draw(state, localPosition);
  }

  refreshStatic(): void {
    this.projection = this.createProjection();
    this.rebuildLabels();
    if (this.open) this.draw(this.latestState, this.latestLocalPosition);
  }

  getRenderState(): TacticalMapRenderState {
    return Object.freeze({
      open: this.open,
      layout: this.layout,
      regions: this.projection.regions.length,
      landmarks: this.projection.landmarks.length,
      containers: this.projection.containers.length,
      localPoint: this.localPoint ? Object.freeze({ ...this.localPoint }) : null,
      safeZonePhase: this.safeZonePhase,
      rivalMarkers: 0,
    });
  }

  destroy(): void {
    this.graphics.destroy();
    this.title.destroy();
    this.hint.destroy();
    this.launcher.destroy();
    this.launcherText.destroy();
    for (const label of this.labels) label.destroy();
    this.labels = [];
  }

  private createProjection(): MinimapStaticProjection {
    const minimapLayout: MinimapLayout = {
      panel: this.layout.panel,
      map: this.layout.map,
      title: this.layout.title,
    };
    return createMinimapStaticProjection(this.mapData, this.collisionGrid, minimapLayout);
  }

  private draw(state: BattleRoyaleSafeZoneState | null, localPosition: Vec2 | null): void {
    this.localPoint = localPosition
      ? projectWorldPointToMinimap(this.projection.worldBounds, this.layout.map, localPosition)
      : null;
    this.safeZonePhase = state?.phase ?? null;
    const gfx = this.graphics;
    gfx.clear();
    gfx.fillStyle(0x05080c, 0.82);
    gfx.fillRect(
      this.layout.overlay.x,
      this.layout.overlay.y,
      this.layout.overlay.width,
      this.layout.overlay.height,
    );
    gfx.fillStyle(0x111820, 0.98);
    gfx.fillRoundedRect(
      this.layout.panel.x,
      this.layout.panel.y,
      this.layout.panel.width,
      this.layout.panel.height,
      8,
    );
    gfx.lineStyle(2, 0x65737e, 1);
    gfx.strokeRoundedRect(
      this.layout.panel.x,
      this.layout.panel.y,
      this.layout.panel.width,
      this.layout.panel.height,
      8,
    );
    for (const region of this.projection.regions) {
      gfx.fillStyle(REGION_COLORS[region.biome], 0.72);
      for (const area of region.areas) gfx.fillRect(area.x, area.y, area.width, area.height);
    }
    for (const solid of this.projection.solids) {
      gfx.fillStyle(0x697078, 0.55);
      gfx.fillRect(solid.x, solid.y, Math.max(1, solid.width), Math.max(1, solid.height));
    }
    for (const container of this.projection.containers) {
      gfx.fillStyle(0xf0b94d, 1);
      gfx.fillCircle(container.x + container.width / 2, container.y + container.height / 2, 3);
    }
    if (state?.nextCenter && state.nextRadius !== null) {
      const center = projectWorldPointToMinimap(
        this.projection.worldBounds,
        this.layout.map,
        state.nextCenter,
      );
      gfx.lineStyle(2, 0x62e6ff, 0.7);
      gfx.strokeCircle(
        center.x,
        center.y,
        state.nextRadius * (this.layout.map.width / this.projection.worldBounds.width),
      );
    }
    if (state) {
      const center = projectWorldPointToMinimap(
        this.projection.worldBounds,
        this.layout.map,
        state.center,
      );
      gfx.lineStyle(3, 0xb8ff62, 1);
      gfx.strokeCircle(
        center.x,
        center.y,
        Math.max(1, state.radius * (this.layout.map.width / this.projection.worldBounds.width)),
      );
    }
    if (this.localPoint) {
      gfx.fillStyle(0xffffff, 1);
      gfx.fillCircle(this.localPoint.x, this.localPoint.y, 5);
      gfx.lineStyle(2, 0x62e6ff, 1);
      gfx.strokeCircle(this.localPoint.x, this.localPoint.y, 7);
    }
  }

  private rebuildLabels(): void {
    for (const label of this.labels) label.destroy();
    this.labels = [
      ...this.projection.regions.map((region) =>
        this.scene.add
          .text(region.label.x, region.label.y, region.displayName, {
            fontFamily: MENU_FONTS.BODY,
            fontSize: '10px',
            color: '#f2eee5',
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(DEPTH + 1)
          .setVisible(this.open),
      ),
      ...this.projection.landmarks
        .filter((landmark) => landmark.label)
        .map((landmark) =>
          this.scene.add
            .text(
              landmark.x + landmark.width / 2,
              landmark.y + landmark.height / 2,
              landmark.label!,
              {
                fontFamily: MENU_FONTS.BODY,
                fontSize: '8px',
                color: '#d7c9a6',
                stroke: '#000000',
                strokeThickness: 2,
              },
            )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH + 1)
            .setVisible(this.open),
        ),
    ];
  }
}
