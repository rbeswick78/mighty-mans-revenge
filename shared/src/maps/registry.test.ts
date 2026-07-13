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
      expect(r.valid, `invalid map "${m.name}": ${r.errors.join('; ')}`).toBe(true);
    }
  });

  it('contains all four rotation maps in order', () => {
    expect(listMapNames()).toEqual([
      'Wasteland Outpost',
      'Overgrown Suburb',
      'Scrapyard',
      'Collapsed Overpass',
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
      // Exactly one contested shotgun, bat, and overcharge cell, plus sustain.
      expect(byType.get('weapon_shotgun'), `${m.name} shotgun spawns`).toBe(1);
      expect(byType.get('weapon_bat'), `${m.name} bat spawns`).toBe(1);
      expect(byType.get('bandage'), `${m.name} bandage spawns`).toBe(2);
      expect(byType.get('overcharge'), `${m.name} overcharge spawns`).toBe(1);
      expect(byType.get('gun_ammo') ?? 0, `${m.name} ammo spawns`).toBeGreaterThanOrEqual(1);

      const overcharge = m.pickupSpawns.find((pickup) => pickup.type === 'overcharge')!;
      expect(overcharge.x, `${m.name} overcharge center column`).toBeGreaterThanOrEqual(9);
      expect(overcharge.x, `${m.name} overcharge center column`).toBeLessThanOrEqual(10);
      expect(overcharge.y, `${m.name} overcharge center row`).toBeGreaterThanOrEqual(5);
      expect(overcharge.y, `${m.name} overcharge center row`).toBeLessThanOrEqual(6);
      const uniquePositions = new Set(m.pickupSpawns.map((pickup) => `${pickup.x},${pickup.y}`));
      expect(uniquePositions.size, `${m.name} pickup positions`).toBe(m.pickupSpawns.length);
    }
  });

  it('maps are viewport-sized 20x12 at tileSize 48', () => {
    for (const m of MAP_REGISTRY.values()) {
      expect([m.width, m.height, m.tileSize], m.name).toEqual([20, 12, 48]);
    }
  });

  it('every map declares at least 3 KOTH hills (mode rotation contract)', () => {
    for (const m of MAP_REGISTRY.values()) {
      expect(m.kothHills, `${m.name} kothHills`).toBeDefined();
      expect(m.kothHills!.length, `${m.name} hill count`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every arena places exactly two one-cell explosive barrels on low cover', () => {
    for (const m of MAP_REGISTRY.values()) {
      const barrels = (m.decorations ?? []).filter(
        (decoration) => decoration.hazard === 'explosive_barrel',
      );
      expect(barrels, `${m.name} barrels`).toHaveLength(2);
      for (const barrel of barrels) {
        expect([barrel.w, barrel.h]).toEqual([1, 1]);
        expect(m.tiles[barrel.y][barrel.x]).toBe(2);
      }
    }
  });

  it('every arena has rotationally paired shootable gates bridging walkable lanes', () => {
    for (const m of MAP_REGISTRY.values()) {
      const gates = (m.decorations ?? []).filter(
        (decoration) => decoration.interaction === 'shootable_gate',
      );
      expect(gates.length, `${m.name} gate count`).toBeGreaterThanOrEqual(2);
      expect(gates.length % 2, `${m.name} gate pairing`).toBe(0);

      const keys = new Set(gates.map((gate) => `${gate.x},${gate.y}`));
      const walkable = (x: number, y: number) => [0, 3, 4].includes(m.tiles[y]?.[x]);
      for (const gate of gates) {
        expect([gate.w, gate.h], `${m.name} gate size`).toEqual([1, 1]);
        expect(m.tiles[gate.y][gate.x], `${m.name} gate tile`).toBe(1);
        expect(
          keys.has(`${m.width - 1 - gate.x},${m.height - 1 - gate.y}`),
          `${m.name} gate (${gate.x},${gate.y}) rotational partner`,
        ).toBe(true);
        const bridgesHorizontal = walkable(gate.x - 1, gate.y) && walkable(gate.x + 1, gate.y);
        const bridgesVertical = walkable(gate.x, gate.y - 1) && walkable(gate.x, gate.y + 1);
        expect(
          bridgesHorizontal || bridgesVertical,
          `${m.name} gate (${gate.x},${gate.y}) must bridge a lane`,
        ).toBe(true);
      }
    }
  });

  it('every arena has exactly one rotational pair of scavenger caches', () => {
    for (const m of MAP_REGISTRY.values()) {
      const caches = (m.decorations ?? []).filter(
        (decoration) => decoration.interaction === 'scavenger_cache',
      );
      expect(caches, `${m.name} caches`).toHaveLength(2);

      const keys = new Set(caches.map((cache) => `${cache.x},${cache.y}`));
      for (const cache of caches) {
        expect([cache.w, cache.h], `${m.name} cache size`).toEqual([1, 1]);
        expect(m.tiles[cache.y][cache.x], `${m.name} cache tile`).toBe(2);
        expect(
          keys.has(`${m.width - 1 - cache.x},${m.height - 1 - cache.y}`),
          `${m.name} cache (${cache.x},${cache.y}) rotational partner`,
        ).toBe(true);
      }
    }
  });

  it('Collapsed Overpass keeps its six-hill objective identity', () => {
    const overpass = getMap('Collapsed Overpass');
    expect(overpass.theme).toBe('overpass');
    expect(overpass.kothHills).toHaveLength(6);
    expect(overpass.decorations).toHaveLength(12);
  });
});

describe('getNextMapName', () => {
  it('cycles through the registry order and wraps', () => {
    const names = listMapNames();
    expect(getNextMapName(names[0])).toBe(names[1]);
    expect(getNextMapName(names[1])).toBe(names[2]);
    expect(getNextMapName(names[2])).toBe(names[3]);
    expect(getNextMapName(names[3])).toBe(names[0]);
  });

  it('restarts the cycle for unknown names instead of throwing', () => {
    expect(getNextMapName('does-not-exist')).toBe(listMapNames()[0]);
  });
});
