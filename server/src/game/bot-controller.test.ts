import { describe, expect, it } from 'vitest';
import {
  BOT,
  GameModeType,
  GRENADE,
  MatchPhase,
  MUTATORS,
  PICKUP,
  PickupType,
  TileType,
  WEAPONS,
} from '@shared/game';
import type {
  CollisionGrid,
  MapData,
  PickupState,
  PlayerState,
} from '@shared/game';
import {
  BotController,
  botResourcePriority,
  findGridPath,
  pickBotResource,
  scrapstormEscapeGoal,
} from './bot-controller.js';
import { Match } from './match.js';

function grid(solid: boolean[][]): CollisionGrid {
  return {
    width: solid[0].length,
    height: solid.length,
    tileSize: 48,
    solid,
  };
}

describe('scrapstormEscapeGoal', () => {
  it('chooses a valid tile beyond the warning ring when caught at its center', () => {
    const open = grid(Array.from({ length: 8 }, (_, row) =>
      Array.from({ length: 8 }, (_, col) =>
        row === 0 || col === 0 || row === 7 || col === 7,
      ),
    ));
    const target = { x: 3.5 * 48, y: 3.5 * 48 };
    const goal = scrapstormEscapeGoal(
      'bot:test',
      target,
      {
        targetPosition: target,
        targetPlayerId: 'bot:test',
        secondsUntilImpact: 1.5,
        radius: MUTATORS.SCRAPSTORM_RADIUS_PX,
      },
      open,
    );

    expect(goal).not.toBeNull();
    expect(Math.hypot(goal!.x - target.x, goal!.y - target.y)).toBeGreaterThan(
      MUTATORS.SCRAPSTORM_RADIUS_PX,
    );
    expect(open.solid[Math.floor(goal!.y / 48)][Math.floor(goal!.x / 48)]).toBe(false);
  });
});

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

function makeBotState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'bot:test',
    nickname: 'Rusty',
    characterId: 'bruce',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 100,
    maxHealth: 100,
    armor: 0,
    ammo: WEAPONS.rifle.magazineSize * 2,
    isReloading: false,
    reloadTimer: 0,
    weaponId: 'rifle',
    specialAmmo: 0,
    specialReserve: 0,
    grenades: GRENADE.MAX_COUNT,
    grenadeRegenSeconds: 0,
    isSprinting: false,
    stamina: 1,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
    abilityActiveSeconds: 0,
    abilityCooldownSeconds: 0,
    abilityLockedAim: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
    ...overrides,
  };
}

function resource(
  id: string,
  type: PickupType,
  x: number,
  overrides: Partial<PickupState> = {},
): PickupState {
  return {
    id,
    type,
    position: { x, y: 0 },
    isActive: true,
    respawnTimer: 0,
    ...overrides,
  };
}

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

describe('Rusty resource evaluation', () => {
  it('ignores full refills and only seeks bandages below the wounded threshold', () => {
    const full = makeBotState();
    expect(botResourcePriority(full, PickupType.BANDAGE)).toBeNull();
    expect(botResourcePriority(full, PickupType.GUN_AMMO)).toBeNull();
    expect(botResourcePriority(full, PickupType.GRENADE)).toBeNull();
    expect(botResourcePriority(full, PickupType.ARMOR)).toBe(
      BOT.RESOURCE_PRIORITY.ARMOR,
    );
    expect(
      botResourcePriority(
        makeBotState({ armor: PICKUP.ARMOR_MAX }),
        PickupType.ARMOR,
      ),
    ).toBeNull();
    expect(botResourcePriority(full, PickupType.OVERCHARGE)).toBeNull();
    expect(
      botResourcePriority(
        makeBotState({ abilityCooldownSeconds: 20 }),
        PickupType.OVERCHARGE,
      ),
    ).toBe(BOT.RESOURCE_PRIORITY.OVERCHARGE);
    expect(
      botResourcePriority(
        makeBotState({ abilityActiveSeconds: 1, abilityCooldownSeconds: 20 }),
        PickupType.OVERCHARGE,
      ),
    ).toBeNull();

    expect(
      botResourcePriority(
        makeBotState({ health: 76 }),
        PickupType.BANDAGE,
      ),
    ).toBeNull();
    expect(
      botResourcePriority(
        makeBotState({ health: 75 }),
        PickupType.BANDAGE,
      ),
    ).not.toBeNull();
    expect(
      botResourcePriority(
        makeBotState({ ammo: WEAPONS.rifle.magazineSize + 1 }),
        PickupType.GUN_AMMO,
      ),
    ).toBeNull();
    expect(
      botResourcePriority(
        makeBotState({ ammo: WEAPONS.rifle.magazineSize }),
        PickupType.GUN_AMMO,
      ),
    ).not.toBeNull();
    expect(
      botResourcePriority(
        makeBotState({ grenades: GRENADE.MAX_COUNT - 1 }),
        PickupType.GRENADE,
      ),
    ).not.toBeNull();
  });

  it('lets a critical bandage beat weapons, then uses distance inside a tier', () => {
    const bot = makeBotState({ health: 40 });
    const selected = pickBotResource(bot, [
      resource('bat', PickupType.WEAPON_BAT, 48),
      resource('far-bandage', PickupType.BANDAGE, 144),
      resource('near-bandage', PickupType.BANDAGE, 96),
    ]);
    expect(selected?.id).toBe('near-bandage');
  });

  it('values armor between power weapons and reactive bandaging', () => {
    const bot = makeBotState({ health: 70 });
    expect(
      pickBotResource(bot, [
        resource('bandage', PickupType.BANDAGE, 48),
        resource('armor', PickupType.ARMOR, 96),
        resource('shotgun', PickupType.WEAPON_SHOTGUN, 144),
      ])?.id,
    ).toBe('shotgun');
    expect(
      pickBotResource(bot, [
        resource('bandage', PickupType.BANDAGE, 48),
        resource('armor', PickupType.ARMOR, 96),
      ])?.id,
    ).toBe('armor');
  });

  it('values a useful ability refresh below power weapons and above armor', () => {
    const bot = makeBotState({ abilityCooldownSeconds: 20 });
    expect(
      pickBotResource(bot, [
        resource('armor', PickupType.ARMOR, 48),
        resource('overcharge', PickupType.OVERCHARGE, 96),
        resource('shotgun', PickupType.WEAPON_SHOTGUN, 144),
      ])?.id,
    ).toBe('shotgun');
    expect(
      pickBotResource(bot, [
        resource('armor', PickupType.ARMOR, 48),
        resource('overcharge', PickupType.OVERCHARGE, 96),
      ])?.id,
    ).toBe('overcharge');
  });

  it('preserves live power weapons and refreshes only a nearly dry matching one', () => {
    const loadedShotgun = makeBotState({
      weaponId: 'shotgun',
      specialAmmo: WEAPONS.shotgun.magazineSize,
      specialReserve: 2,
    });
    expect(
      botResourcePriority(loadedShotgun, PickupType.WEAPON_PISTOL),
    ).toBeNull();
    expect(botResourcePriority(loadedShotgun, PickupType.WEAPON_BAT)).toBeNull();
    expect(
      botResourcePriority(loadedShotgun, PickupType.WEAPON_SHOTGUN),
    ).toBeNull();

    const dryShotgun = makeBotState({
      weaponId: 'shotgun',
      specialAmmo: 1,
      specialReserve: 1,
    });
    expect(
      botResourcePriority(dryShotgun, PickupType.WEAPON_SHOTGUN),
    ).not.toBeNull();
    expect(botResourcePriority(dryShotgun, PickupType.WEAPON_PISTOL)).toBeNull();
  });

  it('bounds detours, rejects doomed expiring routes, and skips Rush supplies', () => {
    const bot = makeBotState({ ammo: 0 });
    const maxDistance = BOT.RESOURCE_MAX_DETOUR_TILES * 48;
    expect(
      pickBotResource(bot, [
        resource('too-far', PickupType.GUN_AMMO, maxDistance + 1),
      ]),
    ).toBeNull();
    expect(
      pickBotResource(bot, [
        resource('doomed', PickupType.GUN_AMMO, 200, {
          expiresInSeconds: 0.6,
        }),
      ]),
    ).toBeNull();
    expect(
      pickBotResource(bot, [
        resource('rush', PickupType.GUN_AMMO, 48, {
          isScavengerRushDrop: true,
        }),
      ]),
    ).toBeNull();
  });

  it('uses stable pickup ids to break exact priority and distance ties', () => {
    const bot = makeBotState({ grenades: 0 });
    const selected = pickBotResource(bot, [
      resource('pickup-z', PickupType.GRENADE, 48),
      resource('pickup-a', PickupType.GRENADE, -48),
    ]);
    expect(selected?.id).toBe('pickup-a');
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

  it('retreats into Radiation Storm safety before resuming its ordinary chase', () => {
    const match = new Match(
      'practice-storm',
      OPEN_MAP,
      [
        { id: 'human', nickname: 'Human' },
        { id: 'bot:test', nickname: 'Rusty' },
      ],
      GameModeType.DEATHMATCH,
      () => 0,
    );
    match.phase = MatchPhase.ACTIVE;
    match.matchTimer = 100;
    const human = match.players.get('human')!;
    const bot = match.players.get('bot:test')!;
    human.position = { x: 2.5 * 48, y: 2.5 * 48 };
    bot.position = { x: 1.5 * 48, y: 2.5 * 48 };
    const internals = match as unknown as {
      _activeMutators: Array<'radiation_storm'>;
      radiationStormCenter: { x: number; y: number };
      radiationStormInitialRadius: number;
      radiationStormElapsed: number;
      radiationStormPulseTimer: number;
    };
    internals._activeMutators.push('radiation_storm');
    internals.radiationStormCenter = { x: 6.5 * 48, y: 2.5 * 48 };
    internals.radiationStormInitialRadius = 300;
    internals.radiationStormElapsed = MUTATORS.RADIATION_STORM_SHRINK_SECONDS;
    internals.radiationStormPulseTimer = 999;
    bot.health = 40;
    match.pickupManager.spawnOneShot(PickupType.BANDAGE, {
      x: 0.5 * 48,
      y: 2.5 * 48,
    });

    const controller = new BotController(bot.id);
    const outsideStart = bot.position.x;
    controller.update(0.05, match, 1);
    match.update(0.05);
    expect(bot.position.x).toBeGreaterThan(outsideStart);

    bot.position = { ...internals.radiationStormCenter };
    bot.health = bot.maxHealth;
    human.position = { x: 1.5 * 48, y: 2.5 * 48 };
    const insideStart = bot.position.x;
    controller.update(0.05, match, 2);
    match.update(0.05);
    expect(bot.position.x).toBeLessThan(insideStart);
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
    bot.health = 40;
    match.pickupManager.spawnOneShot(PickupType.BANDAGE, {
      x: 2.5 * 48,
      y: 2.5 * 48,
    });
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
    bot.health = 40;
    match.pickupManager.spawnOneShot(PickupType.BANDAGE, {
      x: 1.5 * 48,
      y: 2.5 * 48,
    });
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
    bot.health = 40;
    match.pickupManager.spawnOneShot(PickupType.BANDAGE, {
      x: 1.5 * 48,
      y: 2.5 * 48,
    });
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

  it('detours for and authoritatively collects a useful ordinary resource while fighting', () => {
    const map: MapData = {
      ...OPEN_MAP,
      name: 'Bot Resource Range',
      pickupSpawns: [{ x: 2, y: 2, type: 'bandage' }],
    };
    const match = new Match(
      'practice-resource',
      map,
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
    human.position = { x: 6.5 * 48, y: 2.5 * 48 };
    bot.position = { x: 3.5 * 48, y: 2.5 * 48 };
    bot.health = 40;
    match.phase = MatchPhase.ACTIVE;
    match.matchTimer = 100;

    const controller = new BotController(bot.id);
    const startX = bot.position.x;
    controller.update(0.05, match, 1);
    match.update(0.05);
    expect(bot.position.x).toBeLessThan(startX);
    expect(Math.abs(bot.aimAngle)).toBeLessThan(0.5);

    for (let tick = 2; tick <= 20 && bot.health === 40; tick++) {
      controller.update(0.05, match, tick);
      match.update(0.05);
    }
    expect(bot.health).toBe(70);
    expect(
      match.pickupManager
        .getPickups()
        .find((pickup) => pickup.type === PickupType.BANDAGE)?.isActive,
    ).toBe(false);
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
    bot.health = 40;
    match!.pickupManager.spawnOneShot(PickupType.BANDAGE, {
      x: 2.5 * 48,
      y: 2.5 * 48,
    });
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

  it('recognizes the bat as melee, closes to its reach, and swings without reloading', () => {
    const match = new Match(
      'practice-bat',
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
    human.health = 10_000;
    human.maxHealth = 10_000;
    human.position = { x: 5.5 * 48, y: 2.5 * 48 };
    bot.position = { x: 2.5 * 48, y: 2.5 * 48 };
    bot.weaponId = 'bat';
    bot.specialAmmo = 4;
    bot.specialReserve = 0;
    bot.grenades = 0;
    match.phase = MatchPhase.ACTIVE;
    match.matchTimer = 100;

    const controller = new BotController(bot.id);
    for (let tick = 1; tick <= 60 && bot.specialAmmo === 4; tick++) {
      controller.update(0.05, match, tick);
      match.update(0.05);
    }

    expect(bot.specialAmmo).toBeLessThan(4);
    expect(bot.isReloading).toBe(false);
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
