import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_NAME,
  MAP_REGISTRY,
  createEmptyArenaWins,
  getMap,
  getNextMapName,
  listMapNames,
  normalizeArenaWins,
} from './registry.js';
import { validateMap } from '../utils/map-validator.js';
import { validateMapDocument } from '../utils/map-authoring-validator.js';

const AUTHORED_SUCCESSOR_NAMES = [
  'Wasteland Outpost',
  'Overgrown Suburb',
  'Scrapyard',
  'Collapsed Overpass',
] as const;

describe('MAP_REGISTRY', () => {
  it('contains the default map', () => {
    expect(MAP_REGISTRY.has(DEFAULT_MAP_NAME)).toBe(true);
  });

  it('getMap returns the default map by name', () => {
    const m = getMap(DEFAULT_MAP_NAME);
    expect(m.name).toBe(DEFAULT_MAP_NAME);
    expect(m.tiles.length).toBe(m.height);
  });

  it('resolves only the four authored successors for a literal large-world selection', () => {
    for (const name of AUTHORED_SUCCESSOR_NAMES) {
      const legacy = getMap(name);
      const successor = getMap(name, { largeWorlds: true });
      expect([legacy.width, legacy.height, legacy.tileSize], `${name} legacy`).toEqual([
        20, 12, 48,
      ]);
      expect([successor.width, successor.height, successor.tileSize], `${name} successor`).toEqual([
        40, 24, 48,
      ]);
      expect(successor.name).toBe(legacy.name);
      expect(validateMapDocument(successor, 'standard-40x24'), name).toMatchObject({
        valid: true,
        errors: [],
      });
    }

    for (const name of listMapNames().slice(AUTHORED_SUCCESSOR_NAMES.length)) {
      expect(getMap(name, { largeWorlds: true })).toBe(getMap(name));
    }
  });

  it('keeps all four authored successors playable through shared runtime systems', () => {
    for (const name of AUTHORED_SUCCESSOR_NAMES) {
      const map = getMap(name, { largeWorlds: true });
      const authoring = map.authoring!;
      const gates = map.decorations?.filter(({ interaction }) => interaction === 'shootable_gate');
      const barrels = map.decorations?.filter(({ hazard }) => hazard === 'explosive_barrel');
      const pickupTypes = new Set(map.pickupSpawns.map(({ type }) => type));

      expect(map.spawnPoints).toHaveLength(4);
      expect(
        new Set(
          map.spawnPoints.map(
            ({ x, y }) => `${x < 20 ? 'west' : 'east'}-${y < 12 ? 'north' : 'south'}`,
          ),
        ),
      ).toEqual(new Set(['west-north', 'east-north', 'west-south', 'east-south']));
      expect(map.kothHills).toHaveLength(3);
      expect(authoring.objectives.filter(({ kind }) => kind === 'koth')).toHaveLength(3);
      expect(authoring.objectives.filter(({ kind }) => kind === 'core-run')).toEqual([
        expect.objectContaining({ footprint: { x: 19, y: 11, w: 2, h: 2 } }),
      ]);
      expect(pickupTypes).toEqual(
        new Set([
          'weapon_shotgun',
          'weapon_pistol',
          'weapon_bat',
          'gun_ammo',
          'armor',
          'overcharge',
          'grenade',
          'bandage',
        ]),
      );
      expect(gates!.length).toBeGreaterThanOrEqual(2);
      expect(gates!.length % 2).toBe(0);
      expect(barrels).toHaveLength(2);
      expect(authoring.connectivity.requireSingleWalkableComponent).toBe(true);
      expect(authoring.minimap).toMatchObject({
        projection: 'orthographic-top-left',
        bounds: { x: 0, y: 0, w: 40, h: 24 },
      });
      expect(authoring.symmetryReview.kind).toBe('asymmetric');
      expect(authoring.symmetryReview.rationale.length).toBeGreaterThan(80);
      expect(validateMap(map)).toEqual({ valid: true, errors: [] });
    }
  });

  it('getMap throws for an unknown name', () => {
    expect(() => getMap('does-not-exist')).toThrow(/Unknown map/);
  });

  it('listMapNames includes the default map', () => {
    expect(listMapNames()).toContain(DEFAULT_MAP_NAME);
  });

  it('creates and normalizes complete registry-keyed arena records', () => {
    expect(createEmptyArenaWins()).toEqual(
      Object.fromEntries(listMapNames().map((name) => [name, 0])),
    );
    expect(
      normalizeArenaWins({
        'Wasteland Outpost': 3.9,
        Scrapyard: -2,
        'Rusted Refinery': Number.NaN,
        'Retired Arena': 99,
      }),
    ).toEqual({
      ...createEmptyArenaWins(),
      'Wasteland Outpost': 3,
    });
  });

  it('every registered map passes validateMap', () => {
    for (const m of MAP_REGISTRY.values()) {
      const r = validateMap(m);
      expect(r.valid, `invalid map "${m.name}": ${r.errors.join('; ')}`).toBe(true);
    }
  });

  it('contains all six rotation maps in order', () => {
    expect(listMapNames()).toEqual([
      'Wasteland Outpost',
      'Overgrown Suburb',
      'Scrapyard',
      'Collapsed Overpass',
      'Checkpoint Zero',
      'Rusted Refinery',
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

  it('Checkpoint Zero centers its identity on visible two-axis barricade lanes', () => {
    const checkpoint = getMap('Checkpoint Zero');
    const decorated = new Set(
      (checkpoint.decorations ?? []).flatMap((decoration) =>
        Array.from({ length: decoration.h }, (_, dy) =>
          Array.from(
            { length: decoration.w },
            (_, dx) => `${decoration.x + dx},${decoration.y + dy}`,
          ),
        ).flat(),
      ),
    );
    const visibleCover = checkpoint.tiles.flatMap((row, y) =>
      row.flatMap((tile, x) => (tile === 2 && !decorated.has(`${x},${y}`) ? [{ x, y }] : [])),
    );

    expect(checkpoint.theme).toBe('checkpoint');
    expect(visibleCover.length).toBeGreaterThanOrEqual(24);
    expect(
      visibleCover.some(
        ({ x, y }) => checkpoint.tiles[y][x - 1] === 2 || checkpoint.tiles[y][x + 1] === 2,
      ),
    ).toBe(true);
    expect(
      visibleCover.some(
        ({ x, y }) => checkpoint.tiles[y - 1]?.[x] === 2 || checkpoint.tiles[y + 1]?.[x] === 2,
      ),
    ).toBe(true);
  });

  it('Rusted Refinery wraps a rotationally fair power vault in breachable side lanes', () => {
    const refinery = getMap('Rusted Refinery');
    expect(refinery.theme).toBe('refinery');
    expect(refinery.kothHills?.[0]).toEqual({ x: 9, y: 5 });

    for (let y = 0; y < refinery.height; y++) {
      for (let x = 0; x < refinery.width; x++) {
        expect(refinery.tiles[y][x], `tile (${x},${y}) rotational partner`).toBe(
          refinery.tiles[refinery.height - 1 - y][refinery.width - 1 - x],
        );
      }
    }

    const gates = (refinery.decorations ?? []).filter(
      (decoration) => decoration.interaction === 'shootable_gate',
    );
    expect(gates.map(({ x, y }) => [x, y])).toEqual([
      [7, 5],
      [12, 6],
    ]);
    for (const y of [2, 3, 8, 9]) {
      expect(refinery.tiles[y].slice(9, 11), `open vault approach on row ${y}`).toEqual([0, 0]);
    }
  });
});

describe('getNextMapName', () => {
  it('cycles through the registry order and wraps', () => {
    const names = listMapNames();
    expect(getNextMapName(names[0])).toBe(names[1]);
    expect(getNextMapName(names[1])).toBe(names[2]);
    expect(getNextMapName(names[2])).toBe(names[3]);
    expect(getNextMapName(names[3])).toBe(names[4]);
    expect(getNextMapName(names[4])).toBe(names[5]);
    expect(getNextMapName(names[5])).toBe(names[0]);
  });

  it('restarts the cycle for unknown names instead of throwing', () => {
    expect(getNextMapName('does-not-exist')).toBe(listMapNames()[0]);
  });
});
