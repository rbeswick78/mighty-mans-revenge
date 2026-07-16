import Phaser from 'phaser';

import type { CollisionGrid } from '@shared/types/map.js';
import { bakeGridMaskTexture } from './grid-mask.js';
import { sampleIsWall } from './wall-sample.js';
import {
  createWorldRenderPlan,
  visibleWorldChunkIds,
  WORLD_CHUNK_TILES,
  WORLD_RENDER_QUALITY_BUDGETS,
  type WorldChunk,
  type WorldRenderPlan,
  type WorldRenderQualityBudget,
  type WorldViewRect,
} from './dynamic-world-rendering.js';

const BULLET_HOLE_TEXTURE_KEY = 'decal-bullet-hole';
const BULLET_HOLE_TEXTURE_RADIUS_PX = 8;
const BULLET_HOLE_GRADIENT_STEPS = 8;
const BULLET_HOLE_CENTER_PUNCH_RATIO = 0.22;
const BULLET_HOLE_RENDER_RADIUS_PX = 5;
const BULLET_HOLE_ALPHA_MIN = 0.7;
const BULLET_HOLE_ALPHA_MAX = 0.95;
const BULLET_HOLE_SCALE_MIN = 0.85;
const BULLET_HOLE_SCALE_MAX = 1.15;
const BULLET_HOLE_TINTS: readonly number[] = [0x2e222f, 0x3e3546, 0x45293f];

interface DecalStamp {
  readonly x: number;
  readonly y: number;
  readonly col: number;
  readonly row: number;
  readonly rotation: number;
  readonly scale: number;
  readonly alpha: number;
  readonly tint: number;
}

interface DecalChunkResource {
  readonly chunk: WorldChunk;
  readonly rt: Phaser.GameObjects.RenderTexture;
  readonly maskImage: Phaser.GameObjects.Image;
  readonly maskKey: string;
  stamps: DecalStamp[];
  revision: number;
}

let nextRendererId = 1;

/** Persistent wall decals stored in fixed-size world chunks. */
export class DecalRenderer {
  private readonly scene: Phaser.Scene;
  private readonly grid: CollisionGrid | null;
  private readonly plan: WorldRenderPlan | null;
  private readonly stampImage: Phaser.GameObjects.Image;
  private readonly resources = new Map<string, DecalChunkResource>();
  private readonly rendererId = nextRendererId++;
  private readonly baseScale = BULLET_HOLE_RENDER_RADIUS_PX / BULLET_HOLE_TEXTURE_RADIUS_PX;
  private stampCount = 0;

  constructor(
    scene: Phaser.Scene,
    grid: CollisionGrid | null,
    private readonly qualityBudget: () => WorldRenderQualityBudget = () =>
      WORLD_RENDER_QUALITY_BUDGETS.full,
  ) {
    this.scene = scene;
    this.grid = grid;
    bakeBulletHoleTexture(
      scene,
      BULLET_HOLE_TEXTURE_KEY,
      BULLET_HOLE_TEXTURE_RADIUS_PX,
      BULLET_HOLE_GRADIENT_STEPS,
      BULLET_HOLE_CENTER_PUNCH_RATIO,
    );
    this.stampImage = scene.make.image(
      { x: 0, y: 0, key: BULLET_HOLE_TEXTURE_KEY, add: false },
      false,
    );

    this.plan = grid
      ? createWorldRenderPlan(
          { width: grid.width, height: grid.height, tileSize: grid.tileSize },
          { width: scene.cameras.main.width, height: scene.cameras.main.height },
        )
      : null;
    if (!grid || !this.plan) return;

    for (const chunk of this.plan.chunks) {
      const rt = scene.add.renderTexture(chunk.left, chunk.top, chunk.width, chunk.height);
      rt.setOrigin(0, 0);
      const maskKey = `decal-wall-mask-${this.rendererId}-${chunk.id}`;
      bakeGridMaskTexture(scene, maskKey, grid, true, chunk);
      const maskImage = scene.make.image(
        { x: chunk.left, y: chunk.top, key: maskKey, add: false },
        false,
      );
      maskImage.setOrigin(0, 0);
      rt.setMask(maskImage.createBitmapMask());
      this.resources.set(chunk.id, { chunk, rt, maskImage, maskKey, stamps: [], revision: 0 });
    }
  }

  addBulletHoleIfWall(x: number, y: number, bulletAngle: number, grid: CollisionGrid | null): void {
    if (
      !this.plan ||
      !grid ||
      this.stampCount >= this.qualityBudget().decalStamps ||
      !sampleIsWall(grid, x, y, bulletAngle)
    ) {
      return;
    }
    const scale =
      this.baseScale *
      (BULLET_HOLE_SCALE_MIN + Math.random() * (BULLET_HOLE_SCALE_MAX - BULLET_HOLE_SCALE_MIN));
    const stamp: DecalStamp = {
      x,
      y,
      col: Math.floor(x / grid.tileSize),
      row: Math.floor(y / grid.tileSize),
      rotation: Math.random() * Math.PI * 2,
      scale,
      alpha:
        BULLET_HOLE_ALPHA_MIN + Math.random() * (BULLET_HOLE_ALPHA_MAX - BULLET_HOLE_ALPHA_MIN),
      tint: BULLET_HOLE_TINTS[Math.floor(Math.random() * BULLET_HOLE_TINTS.length)],
    };
    const radius = BULLET_HOLE_TEXTURE_RADIUS_PX * scale;
    for (const resource of this.resources.values()) {
      const chunk = resource.chunk;
      if (
        x + radius < chunk.left ||
        x - radius > chunk.left + chunk.width ||
        y + radius < chunk.top ||
        y - radius > chunk.top + chunk.height
      ) {
        continue;
      }
      resource.stamps.push(stamp);
      this.drawStamp(resource, stamp);
    }
    this.stampCount++;
  }

  updateVisibleChunks(view: WorldViewRect): void {
    if (!this.plan) return;
    const visible = visibleWorldChunkIds(this.plan, view);
    for (const [id, resource] of this.resources) resource.rt.setVisible(visible.has(id));
  }

  /** Rebuild only chunks touched by authoritative collision destruction. */
  updateDestroyedTiles(tiles: readonly { col: number; row: number }[]): void {
    if (!this.grid || !this.plan) return;
    const dirty = new Set<string>();
    for (const tile of tiles) {
      const chunkCol = Math.floor(tile.col / WORLD_CHUNK_TILES);
      const chunkRow = Math.floor(tile.row / WORLD_CHUNK_TILES);
      dirty.add(`${chunkCol}:${chunkRow}`);
    }
    for (const [id, resource] of this.resources) {
      const filtered = resource.stamps.filter(
        (stamp) => !tiles.some((tile) => tile.col === stamp.col && tile.row === stamp.row),
      );
      if (filtered.length !== resource.stamps.length) dirty.add(id);
      resource.stamps = filtered;
    }
    for (const id of dirty) {
      const resource = this.resources.get(id);
      if (resource) this.rebuildResource(resource);
    }
  }

  getRenderState(): Readonly<{
    resourceCount: number;
    resources: readonly Readonly<{
      id: string;
      width: number;
      height: number;
      stamps: number;
      revision: number;
      visible: boolean;
    }>[];
  }> {
    return Object.freeze({
      resourceCount: this.resources.size,
      resources: Object.freeze(
        [...this.resources].map(([id, resource]) =>
          Object.freeze({
            id,
            width: resource.chunk.width,
            height: resource.chunk.height,
            stamps: resource.stamps.length,
            revision: resource.revision,
            visible: resource.rt.visible,
          }),
        ),
      ),
    });
  }

  destroy(): void {
    this.stampImage.destroy();
    for (const resource of this.resources.values()) {
      resource.rt.clearMask(true);
      resource.maskImage.destroy();
      resource.rt.destroy();
      if (this.scene.textures.exists(resource.maskKey))
        this.scene.textures.remove(resource.maskKey);
    }
    this.resources.clear();
    this.stampCount = 0;
    if (this.scene.textures.exists(BULLET_HOLE_TEXTURE_KEY)) {
      this.scene.textures.remove(BULLET_HOLE_TEXTURE_KEY);
    }
  }

  private rebuildResource(resource: DecalChunkResource): void {
    resource.revision++;
    resource.rt.clear();
    resource.rt.clearMask(true);
    if (this.scene.textures.exists(resource.maskKey)) this.scene.textures.remove(resource.maskKey);
    bakeGridMaskTexture(this.scene, resource.maskKey, this.grid!, true, resource.chunk);
    resource.maskImage.setTexture(resource.maskKey);
    resource.rt.setMask(resource.maskImage.createBitmapMask());
    for (const stamp of resource.stamps) this.drawStamp(resource, stamp);
  }

  private drawStamp(resource: DecalChunkResource, stamp: DecalStamp): void {
    this.stampImage.setRotation(stamp.rotation);
    this.stampImage.setScale(stamp.scale);
    this.stampImage.setAlpha(stamp.alpha);
    this.stampImage.setTint(stamp.tint);
    resource.rt.draw(this.stampImage, stamp.x - resource.chunk.left, stamp.y - resource.chunk.top);
  }
}

function bakeBulletHoleTexture(
  scene: Phaser.Scene,
  key: string,
  radius: number,
  steps: number,
  centerPunchRatio: number,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const alpha = (1 - t) * (1 - t);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(radius, radius, radius * t);
  }
  g.fillStyle(0xffffff, 1);
  g.fillCircle(radius, radius, Math.max(1, radius * centerPunchRatio));
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
}
