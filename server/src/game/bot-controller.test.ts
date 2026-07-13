import { describe, expect, it } from 'vitest';
import {
  GameModeType,
  MatchPhase,
  MUTATORS,
  PickupType,
  TileType,
} from '@shared/game';
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

  it('pursues a Kill Confirmed tag even while its opponent is dead', () => {
    const match = new Match(
      'practice-confirmed',
      OPEN_MAP,
      [
        { id: 'human', nickname: 'Human' },
        { id: 'bot:test', nickname: 'Rusty' },
      ],
      GameModeType.KILL_CONFIRMED,
      () => 0,
    );
    match.setLock('human', 'mighty_man');
    match.setLock('bot:test', 'bruce');
    match.update(0);
    match.update(10);

    const human = match.players.get('human')!;
    const bot = match.players.get('bot:test')!;
    human.position = { x: 5.5 * 48, y: 2.5 * 48 };
    bot.position = { x: 2.5 * 48, y: 2.5 * 48 };
    match.onKill(bot.id, human.id, 'gun');
    const start = { ...bot.position };

    const controller = new BotController(bot.id);
    controller.update(0.05, match, 1);
    match.update(0.05);

    expect(bot.lastProcessedInput).toBe(1);
    expect(bot.position.x).toBeGreaterThan(start.x);
  });

  it('pursues a loose Core Run objective even while its opponent is dead', () => {
    const match = new Match(
      'practice-core',
      OPEN_MAP,
      [
        { id: 'human', nickname: 'Human' },
        { id: 'bot:test', nickname: 'Rusty' },
      ],
      GameModeType.CORE_RUN,
      () => 0,
    );
    match.setLock('human', 'mighty_man');
    match.setLock('bot:test', 'bruce');
    match.update(0);
    match.update(10);

    const human = match.players.get('human')!;
    const bot = match.players.get('bot:test')!;
    human.isDead = true;
    bot.position = { x: 2.5 * 48, y: 2.5 * 48 };
    const start = { ...bot.position };

    const controller = new BotController(bot.id);
    controller.update(0.05, match, 1);
    match.update(0.05);

    expect(bot.lastProcessedInput).toBe(1);
    expect(bot.position.x).toBeGreaterThan(start.x);
  });

  it('detours toward a live Scavenger Rush supply outside objective modes', () => {
    const match = new Match(
      'practice-scavenger-rush',
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
    bot.position = { x: 3.5 * 48, y: 2.5 * 48 };
    human.position = { x: 6.5 * 48, y: 2.5 * 48 };
    match.phase = MatchPhase.ACTIVE;
    match.matchTimer = 100;
    match.pickupManager.spawnOneShot(
      PickupType.GRENADE,
      { x: 1.5 * 48, y: 2.5 * 48 },
      { isScavengerRushDrop: true },
    );
    const startX = bot.position.x;

    const controller = new BotController(bot.id);
    controller.update(0.05, match, 1);
    match.update(0.05);

    expect(bot.position.x).toBeLessThan(startX);
    expect(Math.abs(bot.aimAngle)).toBeLessThan(0.5);
  });

  it('prioritizes the marked Bounty Hunt target over a nearer hunter', () => {
    let match: Match | null = null;
    for (const id of ['practice-bounty-a', 'practice-bounty-b', 'practice-bounty-c']) {
      const candidate = new Match(
        id,
        OPEN_MAP,
        [
          { id: 'human-a', nickname: 'Human A' },
          { id: 'human-b', nickname: 'Human B' },
          { id: 'bot:test', nickname: 'Rusty' },
        ],
        GameModeType.BOUNTY_HUNT,
        () => 0,
      );
      candidate.players.get('human-a')!.characterId = 'mighty_man';
      candidate.players.get('human-b')!.characterId = 'bubba';
      candidate.players.get('bot:test')!.characterId = 'bruce';
      candidate.startCountdown();
      candidate.update(10);
      if (candidate.getBountyHuntState()?.targetId !== 'bot:test') {
        match = candidate;
        break;
      }
    }
    expect(match).not.toBeNull();

    const bot = match!.players.get('bot:test')!;
    const targetId = match!.getBountyHuntState()!.targetId!;
    const decoy = [...match!.players.values()].find(
      (player) => player.id !== bot.id && player.id !== targetId,
    )!;
    const target = match!.players.get(targetId)!;
    bot.position = { x: 3.5 * 48, y: 2.5 * 48 };
    decoy.position = { x: 2.5 * 48, y: 2.5 * 48 };
    target.position = { x: 6.5 * 48, y: 2.5 * 48 };
    const controller = new BotController(bot.id);
    controller.update(0.05, match!, 1);
    match!.update(0.05);

    // The bounty is due east (angle 0); the nearer decoy is due west (±π).
    expect(Math.abs(bot.aimAngle)).toBeLessThan(0.5);
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

  it('closes into punch range instead of strafing at rifle distance', () => {
    const match = new Match(
      'practice-melee',
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
    human.characterId = 'bubba';
    bot.characterId = 'mighty_man';
    human.position = { x: 5.5 * 48, y: 2.5 * 48 };
    bot.position = { x: 2.5 * 48, y: 2.5 * 48 };
    bot.weaponId = 'punch';
    bot.grenades = 0;
    match.phase = MatchPhase.ACTIVE;
    match.matchTimer = 100;

    const controller = new BotController(bot.id);
    for (let tick = 1; tick <= 60; tick++) {
      controller.update(0.05, match, tick);
      match.update(0.05);
    }

    expect(match.stats.getStats(bot.id).shotsFired).toBeGreaterThan(0);
    expect(human.health).toBeLessThan(human.maxHealth);
  });

  it('uses its one chambered round, then closes for a lethal recovery punch', () => {
    const match = new Match(
      'practice-chamber',
      OPEN_MAP,
      [
        { id: 'human', nickname: 'Human' },
        { id: 'bot:test', nickname: 'Rusty' },
      ],
      GameModeType.ONE_IN_THE_CHAMBER,
      () => 0,
    );
    match.setLock('human', 'bubba');
    match.setLock('bot:test', 'mighty_man');
    match.update(0);
    match.update(10);

    const human = match.players.get('human')!;
    const bot = match.players.get('bot:test')!;
    human.position = { x: 5.5 * 48, y: 2.5 * 48 };
    bot.position = { x: 2.5 * 48, y: 2.5 * 48 };
    human.invulnerableTimer = 0;
    const controller = new BotController(bot.id, 'warlord');

    controller.update(0.05, match, 1);
    match.update(0.05);
    expect(human.isDead).toBe(true);
    expect(bot.score).toBe(1);
    expect(bot.weaponId).toBe('pistol');
    expect(bot.specialAmmo).toBe(1);

    // Put a fresh target in melee range and spend Rusty's earned round.
    human.isDead = false;
    human.health = human.maxHealth;
    human.invulnerableTimer = 0;
    human.position = { x: bot.position.x + 48, y: bot.position.y };
    bot.specialAmmo = 0;
    match.update(0.05);
    expect(bot.weaponId).toBe('punch');

    for (let tick = 2; tick <= 20 && !human.isDead; tick++) {
      controller.update(0.05, match, tick);
      match.update(0.05);
    }
    expect(human.isDead).toBe(true);
    expect(bot.score).toBe(2);
    expect(bot.weaponId).toBe('pistol');
    expect(bot.specialAmmo).toBe(1);
  });

  it('adapts ordinary bot inputs to synchronized roulette weapon changes', () => {
    process.env.FORCE_EVENT = 'weapon_roulette';
    try {
      const match = new Match(
        'practice-roulette',
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
      human.characterId = 'bubba';
      bot.characterId = 'mighty_man';
      human.health = 10_000;
      human.maxHealth = 10_000;
      human.position = { x: 5.5 * 48, y: 2.5 * 48 };
      bot.position = { x: 2.5 * 48, y: 2.5 * 48 };
      match.phase = MatchPhase.ACTIVE;
      match.matchTimer = MUTATORS.ACTIVATION_AT_REMAINING + 0.01;
      (match as unknown as { midMatchSlot: { activateAtElapsed: number } })
        .midMatchSlot.activateAtElapsed = Number.POSITIVE_INFINITY;

      match.update(0.05);
      expect(bot.weaponId).toBe('shotgun');
      const controller = new BotController(bot.id);
      for (let tick = 1; tick <= 30; tick++) {
        controller.update(0.05, match, tick);
        match.update(0.05);
      }
      const shotgunShots = match.stats.getStats(bot.id).shotsFired;
      expect(shotgunShots).toBeGreaterThan(0);

      match.update(MUTATORS.WEAPON_ROULETTE_INTERVAL_SECONDS);
      expect(bot.weaponId).toBe('pistol');
      for (let tick = 31; tick <= 60; tick++) {
        controller.update(0.05, match, tick);
        match.update(0.05);
      }
      expect(match.stats.getStats(bot.id).shotsFired).toBeGreaterThan(shotgunShots);
    } finally {
      delete process.env.FORCE_EVENT;
    }
  });
});
