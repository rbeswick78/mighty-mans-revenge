import { describe, expect, it } from 'vitest';

import {
  acquirePooledEffectSlot,
  chunkIdForWorldPoint,
  createWorldRenderPlan,
  visibleWorldChunkIds,
  WORLD_RENDER_QUALITY_BUDGETS,
  WorldRenderQualityController,
  worldBoundsForMap,
  worldCircleIntersectsView,
} from './dynamic-world-rendering.js';

const currentMap = { width: 20, height: 12, tileSize: 48 };
const futureMap = { width: 40, height: 24, tileSize: 48 };

describe('dynamic world rendering', () => {
  it('derives current and future world dimensions from map data', () => {
    expect(worldBoundsForMap(currentMap)).toEqual({ left: 0, top: 0, width: 960, height: 576 });
    expect(worldBoundsForMap(futureMap)).toEqual({ left: 0, top: 0, width: 1920, height: 1152 });
  });

  it('sizes screen resources from the smaller of world and logical viewport', () => {
    expect(
      createWorldRenderPlan(currentMap, { width: 1280, height: 720 }).viewportResource,
    ).toEqual({ width: 960, height: 576 });
    expect(createWorldRenderPlan(futureMap, { width: 1280, height: 720 }).viewportResource).toEqual(
      { width: 1280, height: 720 },
    );
    expect(createWorldRenderPlan(futureMap, { width: 960, height: 720 }).viewportResource).toEqual({
      width: 960,
      height: 720,
    });
  });

  it('clips edge chunks and routes both sides of a chunk boundary exactly', () => {
    const plan = createWorldRenderPlan(currentMap, { width: 960, height: 720 });
    expect(plan.chunks.map(({ id, width, height }) => ({ id, width, height }))).toEqual([
      { id: '0:0', width: 384, height: 384 },
      { id: '1:0', width: 384, height: 384 },
      { id: '2:0', width: 192, height: 384 },
      { id: '0:1', width: 384, height: 192 },
      { id: '1:1', width: 384, height: 192 },
      { id: '2:1', width: 192, height: 192 },
    ]);
    expect(chunkIdForWorldPoint(plan, 383.999, 100)).toBe('0:0');
    expect(chunkIdForWorldPoint(plan, 384, 100)).toBe('1:0');
    expect(chunkIdForWorldPoint(plan, 959.999, 575.999)).toBe('2:1');
    expect(chunkIdForWorldPoint(plan, 960, 576)).toBeNull();
  });

  it('culls beyond padded view edges without dropping an edge-adjacent chunk', () => {
    const plan = createWorldRenderPlan(futureMap, { width: 640, height: 360 });
    expect([...visibleWorldChunkIds(plan, { x: 0, y: 0, width: 336, height: 336 }, 48)]).toEqual([
      '0:0',
    ]);
    expect([...visibleWorldChunkIds(plan, { x: 336, y: 0, width: 336, height: 336 }, 48)]).toEqual([
      '0:0',
      '1:0',
    ]);
    expect(worldCircleIntersectsView({ x: 384, y: 0, width: 384, height: 384 }, 380, 10, 8)).toBe(
      true,
    );
    expect(worldCircleIntersectsView({ x: 384, y: 0, width: 384, height: 384 }, 370, 10, 8)).toBe(
      false,
    );
  });

  it('uses hysteretic quality budgets and ignores host-scale stalls', () => {
    expect(Object.isFrozen(WORLD_RENDER_QUALITY_BUDGETS)).toBe(true);
    expect(Object.isFrozen(WORLD_RENDER_QUALITY_BUDGETS.full)).toBe(true);
    expect(Object.isFrozen(WORLD_RENDER_QUALITY_BUDGETS.reduced)).toBe(true);
    for (const key of Object.keys(WORLD_RENDER_QUALITY_BUDGETS.full)) {
      if (key === 'tier') continue;
      const budgetKey = key as Exclude<keyof typeof WORLD_RENDER_QUALITY_BUDGETS.full, 'tier'>;
      expect(WORLD_RENDER_QUALITY_BUDGETS.reduced[budgetKey]).toBeLessThanOrEqual(
        WORLD_RENDER_QUALITY_BUDGETS.full[budgetKey],
      );
    }
    const quality = new WorldRenderQualityController();
    for (let i = 0; i < 29; i++) quality.sampleFrame(24);
    expect(quality.getBudget()).toBe(WORLD_RENDER_QUALITY_BUDGETS.full);
    quality.sampleFrame(24);
    expect(quality.getBudget()).toBe(WORLD_RENDER_QUALITY_BUDGETS.reduced);
    quality.sampleFrame(300);
    expect(quality.getBudget()).toBe(WORLD_RENDER_QUALITY_BUDGETS.reduced);
    for (let i = 0; i < 240; i++) quality.sampleFrame(16);
    expect(quality.getBudget()).toBe(WORLD_RENDER_QUALITY_BUDGETS.full);
  });

  it('reuses pooled slots deterministically at exhaustion and after cleanup', () => {
    expect(acquirePooledEffectSlot([true, true, true], 1)).toBe(1);
    expect(acquirePooledEffectSlot([true, false, true], 1)).toBe(1);
    expect(acquirePooledEffectSlot([true, true, false], 1)).toBe(2);
    expect(acquirePooledEffectSlot([false, false, false], 2, 2)).toBe(0);
    expect(acquirePooledEffectSlot([], 0)).toBe(-1);
  });
});
