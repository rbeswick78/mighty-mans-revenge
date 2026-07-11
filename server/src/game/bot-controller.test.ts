import { describe, expect, it } from 'vitest';
import { GameModeType, MatchPhase, TileType } from '@shared/game';
import type { CollisionGrid, MapData } from '@shared/game';
import { BotController, findGridPath } from './bot-controller.js';
import { Match } from './match.js';

function grid(solid: boolean[][]): CollisionGrid {
  return {
    width: solid[0].length,
    height: solid.length,
    tileSize: 48,
    solid,
  };
}

const OPEN_MAP: MapData = {
  name: 'Bot Test Range',
  width: 8,
  height: 6,
  tileSize: 48,
  tiles: Array.from({ length: 6 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) =>
      x === 0 || y === 0 || x === 7 || y === 5 ? TileType.WALL : TileType.FLOOR,
    ),
  ),
  spawnPoints: [
    { x: 1, y: 2 },
    { x: 6, y: 2 },
  ],
  pickupSpawns: [],
};

const KOTH_MAP: MapData = {
  ...OPEN_MAP,
  name: 'Bot KOTH Range',
  kothHills: [{ x: 4, y: 2 }],
};

describe('findGridPath', () => {
  it('routes through the only opening without stepping on solid tiles', () => {
    const collision = grid([
      [true, true, true, true, true],
      [true, false, true, false, true],
      [true, false, true, false, true],
      [true, false, false, false, true],
      [true, true, true, true, true],
    ]);
    const path = findGridPath(collision, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(path[0]).toEqual({ x: 1, y: 1 });
    expect(path.at(-1)).toEqual({ x: 3, y: 1 });
    expect(path).toContainEqual({ x: 2, y: 3 });
    expect(path.every((point) => !collision.solid[point.y][point.x])).toBe(true);
  });

  it('returns no path for blocked or out-of-bounds endpoints', () => {
    const collision = grid([
      [true, true, true],
      [true, false, true],
      [true, true, true],
    ]);
    expect(findGridPath(collision, { x: 1, y: 1 }, { x: 0, y: 0 })).toEqual([]);
    expect(findGridPath(collision, { x: -1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });
});

describe('BotController', () => {
  it('feeds real sequenced inputs through Match movement and combat', () => {
    const match = new Match(
      'practice-1',
      OPEN_MAP,
      [
        { id: 'human', nickname: 'Human' },
        { id: 'bot:test', nickname: 'Rusty' },
      ],
      GameModeType.DEATHMATCH,
      () => 0,
    );
    const human = match.players.get('human')!;
    const bot = match.players.get('bot:test')!;
    human.characterId = 'mighty_man';
    bot.characterId = 'bruce';
    human.position = { x: 5.5 * 48, y: 2.5 * 48 };
    bot.position = { x: 2.5 * 48, y: 2.5 * 48 };
    match.phase = MatchPhase.ACTIVE;
    match.matchTimer = 100;

    const controller = new BotController('bot:test');
    const start = { ...bot.position };
    for (let tick = 1; tick <= 30; tick++) {
      controller.update(0.05, match, tick);
      match.update(0.05);
    }

    expect(bot.lastProcessedInput).toBe(30);
    expect(Math.hypot(bot.position.x - start.x, bot.position.y - start.y)).toBeGreaterThan(0);
    expect(match.stats.getStats('bot:test').shotsFired).toBeGreaterThan(0);
    expect(human.health).toBeLessThan(human.maxHealth);
  });

  it('does nothing outside active play or without a living target', () => {
    const match = new Match(
      'practice-2',
      OPEN_MAP,
      [
        { id: 'human', nickname: 'Human' },
        { id: 'bot:test', nickname: 'Rusty' },
      ],
    );
    const bot = match.players.get('bot:test')!;
    const controller = new BotController('bot:test');
    controller.update(0.05, match, 1);
    expect(bot.lastProcessedInput).toBe(0);

    match.phase = MatchPhase.ACTIVE;
    match.matchTimer = 100;
    match.players.get('human')!.isDead = true;
    controller.update(0.05, match, 2);
    match.update(0.05);
    expect(bot.lastProcessedInput).toBe(0);
  });

  it('prioritizes entering and holding the live KOTH hill', () => {
    const match = new Match(
      'practice-koth',
      KOTH_MAP,
      [
        { id: 'human', nickname: 'Human' },
        { id: 'bot:test', nickname: 'Rusty' },
      ],
      GameModeType.KOTH,
      () => 0,
    );
    match.setLock('human', 'mighty_man');
    match.setLock('bot:test', 'bruce');
    match.update(0);
    match.update(10);

    const human = match.players.get('human')!;
    const bot = match.players.get('bot:test')!;
    human.position = { x: 1.5 * 48, y: 2.5 * 48 };
    bot.position = { x: 3.5 * 48, y: 2.5 * 48 };
    const controller = new BotController('bot:test');

    controller.update(0.05, match, 1);
    match.update(0.05);
    expect(bot.position.x).toBeGreaterThan(3.5 * 48);

    bot.position = { x: 4.5 * 48, y: 2.5 * 48 };
    const held = { ...bot.position };
    controller.update(0.05, match, 2);
    match.update(0.05);
    expect(bot.position).toEqual(held);
  });

  it('fires more aggressively on warlord than rookie without changing damage rules', () => {
    const shotsFor = (difficulty: 'rookie' | 'warlord'): number => {
      const practice = new Match(
        `practice-${difficulty}`,
        OPEN_MAP,
        [
          { id: 'human', nickname: 'Human' },
          { id: 'bot:test', nickname: 'Rusty' },
        ],
        GameModeType.DEATHMATCH,
        () => 0,
      );
      const human = practice.players.get('human')!;
      const bot = practice.players.get('bot:test')!;
      human.characterId = 'bubba';
      bot.characterId = 'mighty_man';
      human.health = 10_000;
      human.maxHealth = 10_000;
      human.position = { x: 5.5 * 48, y: 2.5 * 48 };
      bot.position = { x: 2.5 * 48, y: 2.5 * 48 };
      practice.phase = MatchPhase.ACTIVE;
      practice.matchTimer = 100;
      const controller = new BotController('bot:test', difficulty);
      for (let tick = 1; tick <= 60; tick++) {
        controller.update(0.05, practice, tick);
        practice.update(0.05);
      }
      return practice.stats.getStats('bot:test').shotsFired;
    };

    expect(shotsFor('warlord')).toBeGreaterThan(shotsFor('rookie'));
  });
});
