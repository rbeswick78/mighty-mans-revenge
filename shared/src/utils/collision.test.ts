import { describe, it, expect } from 'vitest';
import {
  pointInRect,
  rectOverlap,
  circleRectOverlap,
  createCollisionGrid,
  isTileSolid,
  raycastAgainstGrid,
  getCollidingTiles,
} from './collision.js';
import { TileType, CollisionGrid, MapData } from '../types/map.js';

// Helper to create a simple collision grid
function makeGrid(
  solidMap: boolean[][],
  tileSize: number = 48,
): CollisionGrid {
  return {
    width: solidMap[0].length,
    height: solidMap.length,
    tileSize,
    solid: solidMap,
  };
}

// A 5x5 grid with walls on borders, floor inside
function makeBorderedGrid(tileSize: number = 48): CollisionGrid {
  const solid: boolean[][] = [];
  for (let r = 0; r < 5; r++) {
    solid[r] = [];
    for (let c = 0; c < 5; c++) {
      solid[r][c] = r === 0 || r === 4 || c === 0 || c === 4;
    }
  }
  return makeGrid(solid, tileSize);
}

describe('pointInRect', () => {
  it('returns true for point inside rect', () => {
    expect(pointInRect(5, 5, 0, 0, 10, 10)).toBe(true);
  });

  it('returns false for point outside rect', () => {
    expect(pointInRect(15, 5, 0, 0, 10, 10)).toBe(false);
    expect(pointInRect(5, 15, 0, 0, 10, 10)).toBe(false);
    expect(pointInRect(-1, 5, 0, 0, 10, 10)).toBe(false);
    expect(pointInRect(5, -1, 0, 0, 10, 10)).toBe(false);
  });

  it('returns true for point on edge', () => {
    expect(pointInRect(0, 0, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect(10, 10, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect(10, 0, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect(0, 10, 0, 0, 10, 10)).toBe(true);
  });
});

describe('rectOverlap', () => {
  it('returns true for overlapping rects', () => {
    expect(
      rectOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 },
      ),
    ).toBe(true);
  });

  it('returns false for non-overlapping rects', () => {
    expect(
      rectOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 10, height: 10 },
      ),
    ).toBe(false);
  });

  it('returns false for touching edges (strict inequality)', () => {
    // Right edge of r1 == left edge of r2 => r1.x + r1.width == r2.x => not >
    expect(
      rectOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 10, height: 10 },
      ),
    ).toBe(false);
  });

  it('returns true when one rect is fully inside the other', () => {
    expect(
      rectOverlap(
        { x: 0, y: 0, width: 20, height: 20 },
        { x: 5, y: 5, width: 5, height: 5 },
      ),
    ).toBe(true);
  });
});

describe('circleRectOverlap', () => {
  it('returns true for overlapping circle and rect', () => {
    expect(circleRectOverlap(5, 5, 3, 0, 0, 10, 10)).toBe(true);
  });

  it('returns false for non-overlapping', () => {
    expect(circleRectOverlap(20, 20, 2, 0, 0, 10, 10)).toBe(false);
  });

  it('returns true when circle touches rect edge', () => {
    // Circle center at (13, 5), radius 3, rect right edge at 10
    // Closest point on rect is (10, 5), distance = 3 = radius, so <= holds
    expect(circleRectOverlap(13, 5, 3, 0, 0, 10, 10)).toBe(true);
  });

  it('returns true when circle is fully inside rect', () => {
    expect(circleRectOverlap(5, 5, 1, 0, 0, 10, 10)).toBe(true);
  });

  it('returns false when circle is just outside corner', () => {
    // Circle at (12, 12), radius 2. Closest corner is (10, 10). Distance = sqrt(8) ~ 2.83 > 2
    expect(circleRectOverlap(12, 12, 2, 0, 0, 10, 10)).toBe(false);
  });
});

describe('createCollisionGrid', () => {
  it('generates correct grid from MapData', () => {
    const mapData: MapData = {
      name: 'test',
      width: 3,
      height: 3,
      tileSize: 48,
      tiles: [
        [TileType.WALL, TileType.WALL, TileType.WALL],
        [TileType.WALL, TileType.FLOOR, TileType.WALL],
        [TileType.WALL, TileType.WALL, TileType.WALL],
      ],
      spawnPoints: [{ x: 1, y: 1 }],
      pickupSpawns: [],
    };

    const grid = createCollisionGrid(mapData);
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(3);
    expect(grid.tileSize).toBe(48);
    expect(grid.solid[0][0]).toBe(true); // wall
    expect(grid.solid[1][1]).toBe(false); // floor
    expect(grid.solid[0][1]).toBe(true); // wall
  });

  it('marks COVER_LOW as solid', () => {
    const mapData: MapData = {
      name: 'test',
      width: 3,
      height: 3,
      tileSize: 48,
      tiles: [
        [TileType.WALL, TileType.WALL, TileType.WALL],
        [TileType.WALL, TileType.COVER_LOW, TileType.WALL],
        [TileType.WALL, TileType.WALL, TileType.WALL],
      ],
      spawnPoints: [{ x: 1, y: 1 }],
      pickupSpawns: [],
    };

    const grid = createCollisionGrid(mapData);
    expect(grid.solid[1][1]).toBe(true);
  });

  it('marks SPAWN_POINT and PICKUP_SPAWN as non-solid', () => {
    const mapData: MapData = {
      name: 'test',
      width: 3,
      height: 3,
      tileSize: 48,
      tiles: [
        [TileType.WALL, TileType.WALL, TileType.WALL],
        [TileType.SPAWN_POINT, TileType.FLOOR, TileType.PICKUP_SPAWN],
        [TileType.WALL, TileType.WALL, TileType.WALL],
      ],
      spawnPoints: [],
      pickupSpawns: [],
    };

    const grid = createCollisionGrid(mapData);
    expect(grid.solid[1][0]).toBe(false); // spawn point
    expect(grid.solid[1][2]).toBe(false); // pickup spawn
  });
});

describe('isTileSolid', () => {
  const grid = makeGrid([
    [true, false],
    [false, true],
  ]);

  it('returns true for solid tile', () => {
    expect(isTileSolid(grid, 0, 0)).toBe(true);
    expect(isTileSolid(grid, 1, 1)).toBe(true);
  });

  it('returns false for non-solid tile', () => {
    expect(isTileSolid(grid, 1, 0)).toBe(false);
    expect(isTileSolid(grid, 0, 1)).toBe(false);
  });

  it('returns true for out of bounds (negative)', () => {
    expect(isTileSolid(grid, -1, 0)).toBe(true);
    expect(isTileSolid(grid, 0, -1)).toBe(true);
  });

  it('returns true for out of bounds (past max)', () => {
    expect(isTileSolid(grid, 2, 0)).toBe(true);
    expect(isTileSolid(grid, 0, 2)).toBe(true);
  });
});

describe('raycastAgainstGrid', () => {
  // 5x5 bordered grid with walls on edges, floor inside (tiles 1-3)
  const grid = makeBorderedGrid(48);

  it('hits a wall when ray goes rightward', () => {
    // Start in center tile (2,2) at pixel (120, 120), fire right (angle 0)
    const result = raycastAgainstGrid(grid, 120, 120, 0, 500);
    expect(result.hitTile).toBe(true);
    // Should hit the wall at column 4 (x=192)
    expect(result.distance).toBeLessThan(500);
    expect(result.hitX).toBeCloseTo(192, 0);
  });

  it('returns max distance when ray misses all walls', () => {
    // All-floor grid
    const openGrid = makeGrid(
      [
        [false, false, false],
        [false, false, false],
        [false, false, false],
      ],
      48,
    );
    const result = raycastAgainstGrid(openGrid, 72, 72, 0, 10);
    expect(result.hitTile).toBe(false);
    expect(result.distance).toBeCloseTo(10, 5);
  });

  it('hits wall on diagonal ray', () => {
    // Fire from center at 45 degrees
    const result = raycastAgainstGrid(
      grid,
      120,
      120,
      Math.PI / 4,
      500,
    );
    expect(result.hitTile).toBe(true);
    expect(result.distance).toBeLessThan(500);
  });

  it('respects max distance limit', () => {
    const result = raycastAgainstGrid(grid, 120, 120, 0, 5);
    // Max distance 5 is very short, should not reach any wall from center
    expect(result.hitTile).toBe(false);
    expect(result.distance).toBeCloseTo(5, 5);
  });

  it('fires leftward and hits wall', () => {
    const result = raycastAgainstGrid(grid, 120, 120, Math.PI, 500);
    expect(result.hitTile).toBe(true);
    expect(result.hitX).toBeCloseTo(48, 0);
  });

  it('fires downward and hits wall', () => {
    const result = raycastAgainstGrid(
      grid,
      120,
      120,
      Math.PI / 2,
      500,
    );
    expect(result.hitTile).toBe(true);
    expect(result.hitY).toBeCloseTo(192, 0);
  });

  it('fires upward and hits wall', () => {
    const result = raycastAgainstGrid(
      grid,
      120,
      120,
      -Math.PI / 2,
      500,
    );
    expect(result.hitTile).toBe(true);
    expect(result.hitY).toBeCloseTo(48, 0);
  });
});

describe('getCollidingTiles', () => {
  const grid = makeBorderedGrid(48);

  it('returns colliding tiles when entity overlaps wall', () => {
    // Place entity overlapping the top-left wall area
    const result = getCollidingTiles(grid, 0, 0, 48, 48);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((t) => t.tileX === 0 && t.tileY === 0)).toBe(true);
  });

  it('returns empty array when entity is in open space', () => {
    // Place entity fully inside tile (2,2) which is floor
    const result = getCollidingTiles(grid, 97, 97, 46, 46);
    expect(result).toEqual([]);
  });

  it('returns multiple tiles when entity spans wall boundary', () => {
    // Place entity spanning from floor tile (1,1) into wall tile (0,1)
    const result = getCollidingTiles(grid, 24, 24, 48, 48);
    expect(result.length).toBeGreaterThan(0);
  });

  it('treats out-of-bounds as solid', () => {
    // Entity partially outside grid on the left
    const result = getCollidingTiles(grid, -10, 96, 20, 48);
    expect(result.length).toBeGreaterThan(0);
  });
});
