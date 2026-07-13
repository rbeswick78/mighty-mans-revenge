import { describe, expect, it } from 'vitest';
import { MUTATORS } from '../config/game.js';
import { TileType, type MapData } from '../types/map.js';
import {
  isOutsideRadiationStorm,
  radiationStormCenter,
  radiationStormInitialRadius,
  radiationStormRadius,
} from './radiation-storm.js';

const map: MapData = {
  name: 'Storm Range',
  width: 20,
  height: 12,
  tileSize: 48,
  tiles: Array.from({ length: 12 }, () => Array(20).fill(TileType.FLOOR)),
  spawnPoints: [{ x: 2, y: 2 }],
  pickupSpawns: [],
  kothHills: [{ x: 3, y: 2 }, { x: 14, y: 8 }],
};

describe('Radiation Storm geometry', () => {
  it('selects one authored center deterministically without external RNG', () => {
    const first = radiationStormCenter('storm-match', map);
    expect(radiationStormCenter('storm-match', map)).toEqual(first);
    expect([
      { x: 4 * 48, y: 3 * 48 },
      { x: 15 * 48, y: 9 * 48 },
    ]).toContainEqual(first);
  });

  it('falls back to the center of a spawn tile on legacy maps', () => {
    expect(radiationStormCenter('legacy', { ...map, kothHills: undefined })).toEqual({
      x: 2.5 * 48,
      y: 2.5 * 48,
    });
  });

  it('opens over every corner, shrinks linearly, and holds at the final radius', () => {
    const center = radiationStormCenter('storm-match', map);
    const initial = radiationStormInitialRadius(map, center);
    expect(initial).toBeGreaterThan(MUTATORS.RADIATION_STORM_FINAL_RADIUS_PX);
    expect(radiationStormRadius(initial, 0)).toBe(initial);
    expect(radiationStormRadius(initial, MUTATORS.RADIATION_STORM_SHRINK_SECONDS / 2))
      .toBeCloseTo((initial + MUTATORS.RADIATION_STORM_FINAL_RADIUS_PX) / 2);
    expect(radiationStormRadius(initial, 999)).toBe(
      MUTATORS.RADIATION_STORM_FINAL_RADIUS_PX,
    );
  });

  it('uses a strict radius boundary for outside pressure', () => {
    const state = { center: { x: 10, y: 10 }, radius: 5, shrinkSecondsRemaining: 0 };
    expect(isOutsideRadiationStorm({ x: 15, y: 10 }, state)).toBe(false);
    expect(isOutsideRadiationStorm({ x: 15.01, y: 10 }, state)).toBe(true);
  });
});
