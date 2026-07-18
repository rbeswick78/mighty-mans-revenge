import { describe, expect, it } from 'vitest';

import { getBattleRoyaleMap } from '../maps/registry.js';
import {
  battleRoyaleBiomeAt,
  battleRoyaleTransitionAt,
  validateBattleRoyaleMapDocument,
} from './battle-royale-map-validator.js';

describe('Battle Royale map authoring', () => {
  it('accepts the exact connected four-biome Shatterlands document', () => {
    const map = getBattleRoyaleMap();
    expect(validateBattleRoyaleMapDocument(map)).toMatchObject({ valid: true, errors: [] });
    expect([map.width, map.height, map.tileSize]).toEqual([56, 34, 48]);
    expect(map.battleRoyale?.regions.map(({ biome }) => biome).sort()).toEqual([
      'industrial',
      'irradiated',
      'overgrown',
      'wasteland',
    ]);
    expect(map.battleRoyale?.spawnSafety.groups).toHaveLength(8);
    expect(map.battleRoyale?.containerSpawns).toHaveLength(16);
    expect(map.battleRoyale?.sustainSpawnIds).toHaveLength(16);
  });

  it('projects stable biome and authored transition ownership at every quadrant seam', () => {
    const map = getBattleRoyaleMap();
    expect(battleRoyaleBiomeAt(map, 1, 1)).toBe('wasteland');
    expect(battleRoyaleBiomeAt(map, 54, 1)).toBe('overgrown');
    expect(battleRoyaleBiomeAt(map, 1, 32)).toBe('industrial');
    expect(battleRoyaleBiomeAt(map, 54, 32)).toBe('irradiated');
    expect(battleRoyaleTransitionAt(map, 27, 8)).toBe('horizontal');
    expect(battleRoyaleTransitionAt(map, 12, 16)).toBe('vertical');
    expect(battleRoyaleTransitionAt(map, 27, 16)).toBe('corner');
  });

  it('rejects dimension, region, spawn-group, and container drift with stable codes', () => {
    const dimensions = structuredClone(getBattleRoyaleMap());
    dimensions.width = 55;
    expect(validateBattleRoyaleMapDocument(dimensions).errors).toEqual(
      expect.arrayContaining([expect.stringContaining('[DIMENSIONS]')]),
    );

    const regions = structuredClone(getBattleRoyaleMap());
    regions.battleRoyale!.regions[0].areas[0].w = 27;
    expect(validateBattleRoyaleMapDocument(regions).errors).toEqual(
      expect.arrayContaining([expect.stringContaining('[REGION_COVERAGE]')]),
    );

    const groups = structuredClone(getBattleRoyaleMap());
    groups.battleRoyale!.spawnSafety.groups[1].spawnIds = [
      'spawn-west-north-a',
      'spawn-west-north-b',
    ];
    expect(validateBattleRoyaleMapDocument(groups).errors).toEqual(
      expect.arrayContaining([expect.stringContaining('[SPAWN_INVENTORY]')]),
    );

    const container = structuredClone(getBattleRoyaleMap());
    const authored = container.battleRoyale!.containerSpawns[0];
    container.tiles[authored.y][authored.x] = 0;
    expect(validateBattleRoyaleMapDocument(container).errors).toEqual(
      expect.arrayContaining([expect.stringContaining('[CONTAINER_PLACEMENT]')]),
    );

    const incomplete = structuredClone(getBattleRoyaleMap()) as unknown as {
      battleRoyale: { regions?: unknown };
    };
    delete incomplete.battleRoyale.regions;
    expect(() => validateBattleRoyaleMapDocument(incomplete)).not.toThrow();
    expect(validateBattleRoyaleMapDocument(incomplete).errors).toEqual(
      expect.arrayContaining([expect.stringContaining('[AUTHORING_SHAPE]')]),
    );
  });
});
