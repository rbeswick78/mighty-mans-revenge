import { describe, expect, it } from 'vitest';
import { TileType, createCollisionGrid, getMap, type MapData } from '@shared/game';
import { findBlastableCoverTiles, findDemolitionWaveTiles } from './destructible-cover.js';

const W = TileType.WALL;
const F = TileType.FLOOR;
const C = TileType.COVER_LOW;

function makeMap(tiles: TileType[][], decorations?: MapData['decorations']): MapData {
  return {
    name: 'Blast Lab',
    width: tiles[0].length,
    height: tiles.length,
    tileSize: 48,
    tiles,
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 1, y: tiles.length - 2 },
    ],
    pickupSpawns: [],
    decorations,
  };
}

describe('findBlastableCoverTiles', () => {
  it('breaks the first exposed cover but not cover shielded behind it', () => {
    const map = makeMap([
      [W, W, W, W, W, W, W],
      [W, F, F, F, F, F, W],
      [W, F, F, C, C, F, W],
      [W, F, F, F, F, F, W],
      [W, W, W, W, W, W, W],
    ]);

    expect(findBlastableCoverTiles(map, createCollisionGrid(map), { x: 120, y: 120 })).toEqual([
      { col: 3, row: 2 },
    ]);
  });

  it('lets walls shield cover and ignores cover outside the blast radius', () => {
    const map = makeMap([
      [W, W, W, W, W, W, W],
      [W, F, F, F, F, F, W],
      [W, F, F, W, C, C, W],
      [W, F, F, F, F, F, W],
      [W, W, W, W, W, W, W],
    ]);

    expect(findBlastableCoverTiles(map, createCollisionGrid(map), { x: 120, y: 120 })).toEqual([]);
  });

  it('destroys every solid cell backing a multi-cell decoration atomically', () => {
    const map = makeMap(
      [
        [W, W, W, W, W, W, W],
        [W, F, F, F, F, F, W],
        [W, F, F, W, W, F, W],
        [W, F, F, F, F, F, W],
        [W, W, W, W, W, W, W],
      ],
      [{ x: 3, y: 2, w: 2, h: 1, texture: 'deco_container' }],
    );

    expect(findBlastableCoverTiles(map, createCollisionGrid(map), { x: 120, y: 120 })).toEqual([
      { col: 3, row: 2 },
      { col: 4, row: 2 },
    ]);
  });

  it('does not expand from plain cover into an unrelated decoration', () => {
    const map = makeMap(
      [
        [W, W, W, W, W, W, W],
        [W, F, F, F, F, F, W],
        [W, F, C, F, C, F, W],
        [W, F, F, F, C, F, W],
        [W, W, W, W, W, W, W],
      ],
      [{ x: 4, y: 2, w: 1, h: 2, texture: 'deco_car' }],
    );

    expect(findBlastableCoverTiles(map, createCollisionGrid(map), { x: 72, y: 120 })).toEqual([
      { col: 2, row: 2 },
    ]);
  });

  it('never destroys a perimeter wall even when a decoration overlaps it', () => {
    const map = makeMap(
      [
        [W, W, W, W, W],
        [W, F, F, F, W],
        [W, F, F, F, W],
        [W, W, W, W, W],
      ],
      [{ x: 0, y: 1, w: 1, h: 1, texture: 'bad_boundary_prop' }],
    );

    expect(findBlastableCoverTiles(map, createCollisionGrid(map), { x: 72, y: 72 })).toEqual([]);
  });

  it('matches the shipped Collapsed Overpass prop geometry and shielding', () => {
    const map = getMap('Collapsed Overpass');
    const grid = createCollisionGrid(map);

    expect(findBlastableCoverTiles(map, grid, { x: 288, y: 72 })).toEqual([
      { col: 5, row: 2 },
      { col: 6, row: 2 },
    ]);

    const shielded = findBlastableCoverTiles(map, grid, { x: 288, y: 216 });
    expect(shielded).not.toContainEqual({ col: 5, row: 2 });
    expect(shielded).not.toContainEqual({ col: 6, row: 2 });
  });
});

describe('findDemolitionWaveTiles', () => {
  it('opens ordinary low cover and live gates while sparing hazards, loot, and walls', () => {
    const map = makeMap(
      [
        [W, W, W, W, W, W, W, W, W],
        [W, F, F, F, F, F, F, F, W],
        [W, F, C, W, C, C, W, C, W],
        [W, F, F, F, F, F, F, F, W],
        [W, W, W, W, W, W, W, W, W],
      ],
      [
        {
          x: 3,
          y: 2,
          w: 1,
          h: 1,
          texture: 'tiles_wire_fence_closing',
          interaction: 'shootable_gate',
        },
        {
          x: 4,
          y: 2,
          w: 1,
          h: 1,
          texture: 'deco_barrel_red',
          hazard: 'explosive_barrel',
        },
        {
          x: 5,
          y: 2,
          w: 1,
          h: 1,
          texture: 'deco_scavenger_cache',
          interaction: 'scavenger_cache',
        },
      ],
    );
    const grid = createCollisionGrid(map);
    grid.solid[2][7] = false;

    expect(findDemolitionWaveTiles(map, grid)).toEqual([
      { col: 2, row: 2 },
      { col: 3, row: 2 },
    ]);
  });

  it('opens both successor shortcuts while preserving their explosive barrels', () => {
    for (const name of ['Wasteland Outpost', 'Overgrown Suburb']) {
      const map = getMap(name, { largeWorlds: true });
      const grid = createCollisionGrid(map);
      const wave = findDemolitionWaveTiles(map, grid);
      const gateTiles = map
        .decorations!.filter(({ interaction }) => interaction === 'shootable_gate')
        .map(({ x: col, y: row }) => ({ col, row }));
      const barrelTiles = map
        .decorations!.filter(({ hazard }) => hazard === 'explosive_barrel')
        .map(({ x: col, y: row }) => ({ col, row }));

      expect(wave, `${name} gates`).toEqual(expect.arrayContaining(gateTiles));
      for (const barrel of barrelTiles) {
        expect(wave, `${name} barrel ${barrel.col},${barrel.row}`).not.toContainEqual(barrel);
      }
    }
  });
});
