import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_NAME,
  MAP_REGISTRY,
  getMap,
  getNextMapName,
  listMapNames,
} from './registry.js';
import { validateMap } from '../utils/map-validator.js';

describe('MAP_REGISTRY', () => {
  it('contains the default map', () => {
    expect(MAP_REGISTRY.has(DEFAULT_MAP_NAME)).toBe(true);
  });

  it('getMap returns the default map by name', () => {
    const m = getMap(DEFAULT_MAP_NAME);
    expect(m.name).toBe(DEFAULT_MAP_NAME);
    expect(m.tiles.length).toBe(m.height);
  });

  it('getMap throws for an unknown name', () => {
    expect(() => getMap('does-not-exist')).toThrow(/Unknown map/);
  });

  it('listMapNames includes the default map', () => {
    expect(listMapNames()).toContain(DEFAULT_MAP_NAME);
  });

  it('every registered map passes validateMap', () => {
    for (const m of MAP_REGISTRY.values()) {
      const r = validateMap(m);
      expect(r.valid, `invalid map "${m.name}": ${r.errors.join('; ')}`).toBe(
        true,
      );
    }
  });

  it('contains all three rotation maps in order', () => {
    expect(listMapNames()).toEqual([
      'Wasteland Outpost',
      'Overgrown Suburb',
      'Scrapyard',
    ]);
  });

  it('every map honors the N-player and pickup design contract', () => {
    for (const m of MAP_REGISTRY.values()) {
      // N-player rule: at least 4 spawn points per map.
      expect(m.spawnPoints.length, `${m.name} spawn count`).toBeGreaterThanOrEqual(4);
      const byType = new Map<string, number>();
      for (const p of m.pickupSpawns) {
        byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
      }
      // Exactly one contested shotgun, two bandages, plus ammo.
      expect(byType.get('weapon_shotgun'), `${m.name} shotgun spawns`).toBe(1);
      expect(byType.get('bandage'), `${m.name} bandage spawns`).toBe(2);
      expect(byType.get('gun_ammo') ?? 0, `${m.name} ammo spawns`).toBeGreaterThanOrEqual(1);
    }
  });

  it('maps are viewport-sized 20x12 at tileSize 48', () => {
    for (const m of MAP_REGISTRY.values()) {
      expect([m.width, m.height, m.tileSize], m.name).toEqual([20, 12, 48]);
    }
  });
});

describe('getNextMapName', () => {
  it('cycles through the registry order and wraps', () => {
    const names = listMapNames();
    expect(getNextMapName(names[0])).toBe(names[1]);
    expect(getNextMapName(names[1])).toBe(names[2]);
    expect(getNextMapName(names[2])).toBe(names[0]);
  });

  it('restarts the cycle for unknown names instead of throwing', () => {
    expect(getNextMapName('does-not-exist')).toBe(listMapNames()[0]);
  });
});
