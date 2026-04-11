import { describe, it, expect } from 'vitest';
import { validateMap } from './map-validator.js';
import { MapData } from '../types/map.js';

function makeValidMap(overrides?: Partial<MapData>): MapData {
  // Minimal 4x4 valid map with wall borders and 2 spawn points
  return {
    name: 'Test Map',
    width: 4,
    height: 4,
    tileSize: 48,
    tiles: [
      [1, 1, 1, 1],
      [1, 3, 0, 1],
      [1, 0, 3, 1],
      [1, 1, 1, 1],
    ],
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
    pickupSpawns: [],
    ...overrides,
  };
}

describe('validateMap', () => {
  it('passes for the Wasteland Outpost map', async () => {
    const { default: wasteland } = await import('../../maps/wasteland-outpost.json');
    const result = validateMap(wasteland as MapData);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('passes for a minimal valid map', () => {
    const result = validateMap(makeValidMap());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('catches wrong tile grid row count', () => {
    const map = makeValidMap({
      height: 5, // declared 5 but only 4 rows
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('row count'),
    );
  });

  it('catches wrong tile grid column count', () => {
    const map = makeValidMap({
      tiles: [
        [1, 1, 1, 1],
        [1, 0, 0], // only 3 columns
        [1, 0, 0, 1],
        [1, 1, 1, 1],
      ],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Row 1'),
    );
  });

  it('catches missing spawn points', () => {
    const map = makeValidMap({ spawnPoints: [{ x: 1, y: 1 }] });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('at least 2 spawn points'),
    );
  });

  it('catches non-wall border tiles', () => {
    const map = makeValidMap({
      tiles: [
        [1, 0, 1, 1], // top border has floor at col 1
        [1, 3, 0, 1],
        [1, 0, 3, 1],
        [1, 1, 1, 1],
      ],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Top border'),
    );
  });

  it('catches non-wall left/right border tiles', () => {
    const map = makeValidMap({
      tiles: [
        [1, 1, 1, 1],
        [0, 3, 0, 1], // left border is floor
        [1, 0, 3, 0], // right border is floor
        [1, 1, 1, 1],
      ],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Left border'))).toBe(true);
    expect(result.errors.some((e) => e.includes('Right border'))).toBe(true);
  });

  it('catches spawn points on wall tiles', () => {
    const map = makeValidMap({
      spawnPoints: [
        { x: 0, y: 0 }, // on a wall
        { x: 2, y: 2 },
      ],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Spawn point (0, 0)'),
    );
  });

  it('catches pickup spawns on wall tiles', () => {
    const map = makeValidMap({
      pickupSpawns: [{ x: 0, y: 0, type: 'gun_ammo' }],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Pickup spawn (0, 0)'),
    );
  });

  it('catches unreachable spawn points', () => {
    const map: MapData = {
      name: 'Unreachable',
      width: 6,
      height: 4,
      tileSize: 48,
      tiles: [
        [1, 1, 1, 1, 1, 1],
        [1, 3, 1, 1, 3, 1], // wall separates spawn points
        [1, 0, 1, 1, 0, 1],
        [1, 1, 1, 1, 1, 1],
      ],
      spawnPoints: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
      ],
      pickupSpawns: [],
    };
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('not reachable'),
    );
  });

  it('passes when pickup spawns are on PICKUP_SPAWN tiles', () => {
    const map = makeValidMap({
      tiles: [
        [1, 1, 1, 1],
        [1, 3, 4, 1],
        [1, 0, 3, 1],
        [1, 1, 1, 1],
      ],
      pickupSpawns: [{ x: 2, y: 1, type: 'grenade' }],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(true);
  });

  it('catches out-of-bounds spawn points', () => {
    const map = makeValidMap({
      spawnPoints: [
        { x: 1, y: 1 },
        { x: 99, y: 99 },
      ],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('out of map bounds'),
    );
  });
});
