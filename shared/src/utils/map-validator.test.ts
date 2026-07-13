import { describe, it, expect } from 'vitest';
import { validateMap } from './map-validator.js';
import { TileType, type MapData } from '../types/map.js';

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
    expect(result.errors).toContainEqual(expect.stringContaining('row count'));
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
    expect(result.errors).toContainEqual(expect.stringContaining('Row 1'));
  });

  it('catches missing spawn points', () => {
    const map = makeValidMap({ spawnPoints: [{ x: 1, y: 1 }] });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('at least 2 spawn points'));
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
    expect(result.errors).toContainEqual(expect.stringContaining('Top border'));
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
    expect(result.errors).toContainEqual(expect.stringContaining('Spawn point (0, 0)'));
  });

  it('catches pickup spawns on wall tiles', () => {
    const map = makeValidMap({
      pickupSpawns: [{ x: 0, y: 0, type: 'gun_ammo' }],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Pickup spawn (0, 0)'));
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
    expect(result.errors).toContainEqual(expect.stringContaining('not reachable'));
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
    expect(result.errors).toContainEqual(expect.stringContaining('out of map bounds'));
  });

  it('accepts in-bounds decorations and maps with none', () => {
    expect(validateMap(makeValidMap({})).valid).toBe(true);
    const map = makeValidMap({
      decorations: [{ x: 1, y: 1, w: 2, h: 1, texture: 'deco_test' }],
    });
    expect(validateMap(map).valid).toBe(true);
  });

  it('catches decoration rects that leave the map', () => {
    const map = makeValidMap({
      decorations: [{ x: 3, y: 1, w: 2, h: 1, texture: 'deco_test' }],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('extends out of map bounds'));
  });

  it('catches decorations with non-positive size', () => {
    const map = makeValidMap({
      decorations: [{ x: 1, y: 1, w: 0, h: 1, texture: 'deco_test' }],
    });
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('non-positive size'));
  });

  it('requires explosive barrels to be one-cell decorations on low cover', () => {
    const valid = makeValidMap();
    valid.tiles[2][1] = 2;
    valid.decorations = [
      {
        x: 1,
        y: 2,
        w: 1,
        h: 1,
        texture: 'deco_barrel_red',
        hazard: 'explosive_barrel',
      },
    ];
    expect(validateMap(valid).valid).toBe(true);

    const oversized = makeValidMap({
      decorations: [
        {
          x: 1,
          y: 2,
          w: 2,
          h: 1,
          texture: 'deco_barrel_red',
          hazard: 'explosive_barrel',
        },
      ],
    });
    expect(validateMap(oversized).errors).toContainEqual(
      expect.stringContaining('must be exactly 1x1'),
    );

    const onFloor = makeValidMap({
      decorations: [
        {
          x: 1,
          y: 2,
          w: 1,
          h: 1,
          texture: 'deco_barrel_red',
          hazard: 'explosive_barrel',
        },
      ],
    });
    expect(validateMap(onFloor).errors).toContainEqual(
      expect.stringContaining('must stand on COVER_LOW'),
    );
  });

  it('requires shootable gates to be one-cell interior wall decorations', () => {
    const valid = makeValidMap();
    valid.tiles[1][2] = TileType.WALL;
    valid.decorations = [
      {
        x: 2,
        y: 1,
        w: 1,
        h: 1,
        texture: 'tiles_wire_fence_closing',
        interaction: 'shootable_gate',
      },
    ];
    expect(validateMap(valid).valid).toBe(true);

    const oversized = makeValidMap({
      decorations: [
        {
          x: 1,
          y: 2,
          w: 2,
          h: 1,
          texture: 'tiles_wire_fence_closing',
          interaction: 'shootable_gate',
        },
      ],
    });
    expect(validateMap(oversized).errors).toContainEqual(
      expect.stringContaining('must be exactly 1x1'),
    );

    const onFloor = makeValidMap({
      decorations: [
        {
          x: 1,
          y: 2,
          w: 1,
          h: 1,
          texture: 'tiles_wire_fence_closing',
          interaction: 'shootable_gate',
        },
      ],
    });
    expect(validateMap(onFloor).errors).toContainEqual(
      expect.stringContaining('must stand on WALL'),
    );

    const perimeter = makeValidMap({
      decorations: [
        {
          x: 0,
          y: 2,
          w: 1,
          h: 1,
          texture: 'tiles_wire_fence_closing',
          interaction: 'shootable_gate',
        },
      ],
    });
    expect(validateMap(perimeter).errors).toContainEqual(
      expect.stringContaining('inside the arena perimeter'),
    );
  });

  it('rejects decorations that combine a hazard and an interaction', () => {
    const map = makeValidMap();
    map.tiles[1][2] = TileType.WALL;
    map.decorations = [
      {
        x: 2,
        y: 1,
        w: 1,
        h: 1,
        texture: 'impossible_prop',
        hazard: 'explosive_barrel',
        interaction: 'shootable_gate',
      },
    ];
    expect(validateMap(map).errors).toContainEqual(
      expect.stringContaining('cannot be both a hazard and an interaction'),
    );
  });

  describe('kothHills', () => {
    /** 8x6 open interior — room for several distinct 2x2 hills. */
    function makeHillMap(kothHills?: { x: number; y: number }[]): MapData {
      return {
        name: 'Hill Test',
        width: 8,
        height: 6,
        tileSize: 48,
        tiles: [
          [1, 1, 1, 1, 1, 1, 1, 1],
          [1, 3, 0, 0, 0, 0, 3, 1],
          [1, 0, 0, 0, 0, 2, 0, 1],
          [1, 0, 0, 0, 0, 0, 0, 1],
          [1, 3, 0, 0, 0, 0, 3, 1],
          [1, 1, 1, 1, 1, 1, 1, 1],
        ],
        spawnPoints: [
          { x: 1, y: 1 },
          { x: 6, y: 4 },
        ],
        pickupSpawns: [],
        ...(kothHills ? { kothHills } : {}),
      };
    }

    it('accepts maps without hills (fixtures) and with 3+ walkable hills', () => {
      expect(validateMap(makeHillMap()).valid).toBe(true);
      const result = validateMap(
        makeHillMap([
          { x: 1, y: 1 },
          { x: 3, y: 2 },
          { x: 1, y: 3 },
        ]),
      );
      expect(result.valid, result.errors.join('; ')).toBe(true);
    });

    it('rejects fewer than 3 declared hills', () => {
      const result = validateMap(
        makeHillMap([
          { x: 1, y: 1 },
          { x: 3, y: 2 },
        ]),
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('at least 3 entries'));
    });

    it('rejects hills extending out of bounds', () => {
      const result = validateMap(
        makeHillMap([
          { x: 7, y: 1 }, // 2 wide from col 7 leaves an 8-wide map
          { x: 1, y: 1 },
          { x: 3, y: 2 },
        ]),
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('extends out of map bounds'));
    });

    it('rejects hills covering walls or cover (COVER_LOW blocks movement)', () => {
      const result = validateMap(
        makeHillMap([
          { x: 4, y: 1 }, // covers the COVER_LOW at (5,2)
          { x: 1, y: 1 },
          { x: 1, y: 3 },
        ]),
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('non-walkable tile at (5, 2)'));
    });
  });
});
