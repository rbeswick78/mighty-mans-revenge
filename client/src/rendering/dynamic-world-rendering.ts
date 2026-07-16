import type { MapData } from '@shared/types/map.js';

import type { WorldBounds } from './gameplay-coordinate-space.js';

export const WORLD_CHUNK_TILES = 8;
export const WORLD_CHUNK_CULL_PADDING_TILES = 1;

export type WorldRenderQualityTier = 'full' | 'reduced';

export interface WorldRenderQualityBudget {
  readonly tier: WorldRenderQualityTier;
  readonly impactSparks: number;
  readonly impactDust: number;
  readonly explosionDebris: number;
  readonly smokePuffs: number;
  readonly pickupLights: number;
  readonly timedLights: number;
  readonly decalStamps: number;
  readonly shockwaves: number;
}

export const WORLD_RENDER_QUALITY_BUDGETS: Readonly<
  Record<WorldRenderQualityTier, WorldRenderQualityBudget>
> = Object.freeze({
  full: Object.freeze({
    tier: 'full',
    impactSparks: 10,
    impactDust: 4,
    explosionDebris: 16,
    smokePuffs: 8,
    pickupLights: 32,
    timedLights: 24,
    decalStamps: 512,
    shockwaves: 4,
  }),
  reduced: Object.freeze({
    tier: 'reduced',
    impactSparks: 5,
    impactDust: 2,
    explosionDebris: 8,
    smokePuffs: 4,
    pickupLights: 16,
    timedLights: 12,
    decalStamps: 256,
    shockwaves: 2,
  }),
});

export interface WorldChunk {
  readonly id: string;
  readonly col: number;
  readonly row: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly firstCol: number;
  readonly firstRow: number;
  readonly columnCount: number;
  readonly rowCount: number;
}

export interface WorldRenderPlan {
  readonly worldBounds: WorldBounds;
  readonly chunkSize: number;
  readonly chunks: readonly WorldChunk[];
  readonly viewportResource: Readonly<{ width: number; height: number }>;
}

export interface WorldViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function worldBoundsForMap(
  mapData: Pick<MapData, 'width' | 'height' | 'tileSize'>,
): WorldBounds {
  return Object.freeze({
    left: 0,
    top: 0,
    width: mapData.width * mapData.tileSize,
    height: mapData.height * mapData.tileSize,
  });
}

export function createWorldRenderPlan(
  mapData: Pick<MapData, 'width' | 'height' | 'tileSize'>,
  logicalViewport: Readonly<{ width: number; height: number }>,
): WorldRenderPlan {
  const worldBounds = worldBoundsForMap(mapData);
  const chunkSize = mapData.tileSize * WORLD_CHUNK_TILES;
  const chunkColumns = Math.ceil(mapData.width / WORLD_CHUNK_TILES);
  const chunkRows = Math.ceil(mapData.height / WORLD_CHUNK_TILES);
  const chunks: WorldChunk[] = [];

  for (let row = 0; row < chunkRows; row++) {
    for (let col = 0; col < chunkColumns; col++) {
      const firstCol = col * WORLD_CHUNK_TILES;
      const firstRow = row * WORLD_CHUNK_TILES;
      const columnCount = Math.min(WORLD_CHUNK_TILES, mapData.width - firstCol);
      const rowCount = Math.min(WORLD_CHUNK_TILES, mapData.height - firstRow);
      chunks.push(
        Object.freeze({
          id: `${col}:${row}`,
          col,
          row,
          left: firstCol * mapData.tileSize,
          top: firstRow * mapData.tileSize,
          width: columnCount * mapData.tileSize,
          height: rowCount * mapData.tileSize,
          firstCol,
          firstRow,
          columnCount,
          rowCount,
        }),
      );
    }
  }

  return Object.freeze({
    worldBounds,
    chunkSize,
    chunks: Object.freeze(chunks),
    viewportResource: Object.freeze({
      width: Math.min(worldBounds.width, logicalViewport.width),
      height: Math.min(worldBounds.height, logicalViewport.height),
    }),
  });
}

export function visibleWorldChunkIds(
  plan: WorldRenderPlan,
  view: WorldViewRect,
  cullPadding = plan.chunkSize / WORLD_CHUNK_TILES,
): ReadonlySet<string> {
  const left = view.x - cullPadding;
  const top = view.y - cullPadding;
  const right = view.x + view.width + cullPadding;
  const bottom = view.y + view.height + cullPadding;
  const visible = new Set<string>();
  for (const chunk of plan.chunks) {
    if (
      chunk.left < right &&
      chunk.left + chunk.width > left &&
      chunk.top < bottom &&
      chunk.top + chunk.height > top
    ) {
      visible.add(chunk.id);
    }
  }
  return visible;
}

export function chunkIdForWorldPoint(plan: WorldRenderPlan, x: number, y: number): string | null {
  if (
    x < plan.worldBounds.left ||
    y < plan.worldBounds.top ||
    x >= plan.worldBounds.left + plan.worldBounds.width ||
    y >= plan.worldBounds.top + plan.worldBounds.height
  ) {
    return null;
  }
  return `${Math.floor(x / plan.chunkSize)}:${Math.floor(y / plan.chunkSize)}`;
}

export function worldCircleIntersectsView(
  view: WorldViewRect,
  x: number,
  y: number,
  radius: number,
): boolean {
  return (
    x + radius >= view.x &&
    x - radius <= view.x + view.width &&
    y + radius >= view.y &&
    y - radius <= view.y + view.height
  );
}

const REDUCE_FRAME_MS = 1000 / 45;
const RESTORE_FRAME_MS = 1000 / 58;
const REDUCE_SAMPLE_COUNT = 30;
const RESTORE_SAMPLE_COUNT = 240;

/**
 * Cosmetic-only automatic quality governor. Consecutive-sample hysteresis
 * avoids changing tiers because of a single debugger pause or host stall.
 */
export class WorldRenderQualityController {
  private tier: WorldRenderQualityTier = 'full';
  private slowSamples = 0;
  private fastSamples = 0;

  sampleFrame(deltaMs: number): WorldRenderQualityTier {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 250) return this.tier;
    if (this.tier === 'full') {
      this.fastSamples = 0;
      this.slowSamples = deltaMs >= REDUCE_FRAME_MS ? this.slowSamples + 1 : 0;
      if (this.slowSamples >= REDUCE_SAMPLE_COUNT) {
        this.tier = 'reduced';
        this.slowSamples = 0;
      }
    } else {
      this.slowSamples = 0;
      this.fastSamples = deltaMs <= RESTORE_FRAME_MS ? this.fastSamples + 1 : 0;
      if (this.fastSamples >= RESTORE_SAMPLE_COUNT) {
        this.tier = 'full';
        this.fastSamples = 0;
      }
    }
    return this.tier;
  }

  getBudget(): WorldRenderQualityBudget {
    return WORLD_RENDER_QUALITY_BUDGETS[this.tier];
  }

  reset(): void {
    this.tier = 'full';
    this.slowSamples = 0;
    this.fastSamples = 0;
  }
}

/** First free slot from `start`, otherwise FIFO-recycle `start`. */
export function acquirePooledEffectSlot(
  active: readonly (boolean | Readonly<{ active: boolean }>)[],
  start: number,
  limit = active.length,
): number {
  const usable = Math.max(0, Math.min(active.length, Math.floor(limit)));
  if (usable === 0) return -1;
  const normalizedStart = ((start % usable) + usable) % usable;
  for (let offset = 0; offset < usable; offset++) {
    const index = (normalizedStart + offset) % usable;
    const item = active[index];
    if (!(typeof item === 'boolean' ? item : item.active)) return index;
  }
  return normalizedStart;
}
