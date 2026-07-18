import { GameModeType, getBattleRoyaleMap } from '@shared/game';
import { describe, expect, it } from 'vitest';

import { Match } from './match.js';

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function createArenaMatch(seed = 45): Match {
  return new Match(
    'shatterlands-test',
    getBattleRoyaleMap(),
    Array.from({ length: 8 }, (_, index) => ({
      id: `player-${index}`,
      nickname: `Player ${index}`,
    })),
    GameModeType.DEATHMATCH,
    mulberry32(seed),
    [],
    undefined,
    undefined,
    undefined,
    'shatterlands-test',
    new Map(),
    new Map(),
    { format: 'battle_royale' },
  );
}

describe('Battle Royale Shatterlands integration', () => {
  it('assigns exactly one fighter to each authored spawn group and registers every container', () => {
    const match = createArenaMatch();
    const map = match.getMapData();
    const occupiedTiles = new Set(
      [...match.players.values()].map(
        ({ position }) =>
          `${Math.floor(position.x / map.tileSize)},${Math.floor(position.y / map.tileSize)}`,
      ),
    );

    expect(occupiedTiles.size).toBe(8);
    for (const group of map.battleRoyale!.spawnSafety.groups) {
      const candidates = group.spawnIds.map((id) => {
        const spawn = map.spawnPoints.find((point) => point.id === id)!;
        return `${spawn.x},${spawn.y}`;
      });
      expect(candidates.filter((candidate) => occupiedTiles.has(candidate))).toHaveLength(1);
    }
    const authoredContainers = [...map.battleRoyale!.containerSpawns].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    expect(match.getBattleRoyaleContainers()).toEqual(
      authoredContainers.map((container) =>
        expect.objectContaining({
          id: container.id,
          tile: { col: container.x, row: container.y },
          status: 'intact',
        }),
      ),
    );
  });

  it('keeps deterministic spawn assignments and the sustain-only map economy', () => {
    const first = createArenaMatch(77);
    const second = createArenaMatch(77);
    expect([...first.players.values()].map(({ id, position }) => ({ id, position }))).toEqual(
      [...second.players.values()].map(({ id, position }) => ({ id, position })),
    );
    expect(first.pickupManager.getPickups()).toHaveLength(16);
    expect(new Set(first.pickupManager.getPickups().map(({ type }) => type))).toEqual(
      new Set(['bandage', 'armor', 'grenade', 'overcharge']),
    );
    expect(first.getMapData().name).toBe('Shatterlands');
  });
});
