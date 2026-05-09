import { describe, it, expect } from 'vitest';
import { MapManager } from './map-manager.js';
import type { MapData } from '@shared/game';

function makeMap(spawnCount: number): MapData {
  const spawnPoints = Array.from({ length: spawnCount }, (_, i) => ({
    x: i,
    y: i,
  }));
  return {
    name: 'test',
    width: spawnCount + 2,
    height: spawnCount + 2,
    tileSize: 48,
    tiles: Array.from({ length: spawnCount + 2 }, () =>
      Array.from({ length: spawnCount + 2 }, () => 0),
    ),
    spawnPoints,
    pickupSpawns: [],
  };
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('MapManager.pickInitialSpawns', () => {
  it('returns distinct positions when count <= spawn-point count', () => {
    const mm = new MapManager();
    mm.loadMap(makeMap(4));
    const spawns = mm.pickInitialSpawns(4, mulberry32(1));
    const keys = new Set(spawns.map((s) => `${s.x},${s.y}`));
    expect(keys.size).toBe(4);
  });

  it('reshuffles for the overflow when count exceeds spawn-point count', () => {
    const mm = new MapManager();
    mm.loadMap(makeMap(3));
    const spawns = mm.pickInitialSpawns(5, mulberry32(2));
    expect(spawns).toHaveLength(5);
    // First 3 must be distinct (one full round).
    const firstRound = new Set(spawns.slice(0, 3).map((s) => `${s.x},${s.y}`));
    expect(firstRound.size).toBe(3);
  });

  it('is deterministic for a given rng', () => {
    const mm = new MapManager();
    mm.loadMap(makeMap(4));
    const a = mm.pickInitialSpawns(4, mulberry32(42));
    const b = mm.pickInitialSpawns(4, mulberry32(42));
    expect(a).toEqual(b);
  });

  it('returns pixel coords (tile center)', () => {
    const mm = new MapManager();
    mm.loadMap(makeMap(2));
    const spawns = mm.pickInitialSpawns(2, mulberry32(7));
    // tileSize=48, center = tile*48 + 24
    for (const s of spawns) {
      expect((s.x - 24) % 48).toBe(0);
      expect((s.y - 24) % 48).toBe(0);
    }
  });
});

describe('MapManager.pickRespawnPoint', () => {
  it('never returns a spawn within one tile of an occupier', () => {
    const mm = new MapManager();
    mm.loadMap(makeMap(4));
    // makeMap(4) has spawns at tiles (0..3, 0..3) → pixel (24,24), (72,72), (120,120), (168,168).
    const blocked = { x: 24, y: 24 };
    for (let i = 0; i < 50; i++) {
      const sp = mm.pickRespawnPoint([blocked], mulberry32(i + 1));
      expect(sp).not.toEqual(blocked);
    }
  });

  it('eventually picks every unoccupied spawn (uniform-ish over many seeds)', () => {
    const mm = new MapManager();
    mm.loadMap(makeMap(4));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const sp = mm.pickRespawnPoint([], mulberry32(i + 1));
      seen.add(`${sp.x},${sp.y}`);
    }
    expect(seen.size).toBe(4);
  });

  it('falls back to the spawn farthest from its nearest occupier when all are blocked', () => {
    const mm = new MapManager();
    mm.loadMap(makeMap(2));
    // Spawns at pixel (24,24) and (72,72). Block both:
    //   - occupier exactly on spawn 0 → spawn 0 nearest = 0
    //   - occupier at (60,60) → ~17px from spawn 1 (still inside the 48px bubble → blocked, but farther than 0)
    const occupiers = [
      { x: 24, y: 24 },
      { x: 60, y: 60 },
    ];
    const sp = mm.pickRespawnPoint(occupiers, mulberry32(1));
    expect(sp).toEqual({ x: 72, y: 72 });
  });
});
