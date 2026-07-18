import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  GameModeType,
  MatchPhase,
  TileType,
  WEAPONS,
  getBattleRoyaleMap,
  type BattleRoyaleSafeZoneState,
  type CollisionGrid,
  type MapData,
  type PlayerState,
  type WeaponInstance,
} from '@shared/game';

import {
  battleRoyaleWeaponUtility,
  battleRoyaleZoneGoal,
  pickBattleRoyaleTarget,
  planBattleRoyaleBot,
  type BattleRoyaleBotWorldState,
} from './battle-royale-bot-planner.js';
import { BotController } from './bot-controller.js';
import { Match } from './match.js';

const BOT_MAP: MapData = {
  name: 'Battle Royale Bot Range',
  width: 9,
  height: 7,
  tileSize: 48,
  tiles: Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: 9 }, (_, col) =>
      row === 0 || row === 6 || col === 0 || col === 8 || (row === 3 && col === 4)
        ? TileType.WALL
        : TileType.FLOOR,
    ),
  ),
  spawnPoints: [
    { x: 2, y: 3 },
    { x: 7, y: 3 },
  ],
  pickupSpawns: [],
};

function instance(
  instanceId: string,
  weaponId: WeaponInstance['weaponId'],
  rarity: WeaponInstance['rarity'],
): WeaponInstance {
  return { instanceId, weaponId, rarity };
}

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'bot:test',
    nickname: 'Rusty',
    characterId: 'rook',
    position: { x: 120, y: 120 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 100,
    maxHealth: 100,
    armor: 0,
    ammo: 0,
    isReloading: false,
    reloadTimer: 0,
    weaponId: 'punch',
    specialAmmo: 0,
    specialReserve: 0,
    grenades: 0,
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
    battleRoyaleInventory: { equipped: null, loadedAmmo: 0, reserveAmmo: 0 },
    ...overrides,
  };
}

function zone(overrides: Partial<BattleRoyaleSafeZoneState> = {}): BattleRoyaleSafeZoneState {
  return {
    phaseIndex: 0,
    phase: 'preview',
    center: { x: 240, y: 240 },
    radius: 220,
    nextCenter: { x: 300, y: 240 },
    nextRadius: 90,
    phaseSecondsRemaining: 12,
    damagePerPulse: 0,
    ...overrides,
  };
}

function world(
  bot: PlayerState,
  overrides: Partial<BattleRoyaleBotWorldState> = {},
): BattleRoyaleBotWorldState {
  const rival = player({
    id: 'rival',
    nickname: 'Rival',
    position: { x: 260, y: 120 },
    battleRoyaleInventory: { equipped: null, loadedAmmo: 0, reserveAmmo: 0 },
  });
  return {
    players: new Map([
      [bot.id, bot],
      [rival.id, rival],
    ]),
    drops: [],
    containers: [],
    supplies: [],
    safeZone: null,
    tileSize: 48,
    ...overrides,
  };
}

function createMatch(id: string, map: MapData = BOT_MAP, count = 2): Match {
  const match = new Match(
    id,
    map,
    Array.from({ length: count }, (_, index) => ({
      id: `bot:${index}`,
      nickname: `Bot ${index}`,
    })),
    GameModeType.DEATHMATCH,
    () => 0,
    [],
    undefined,
    undefined,
    undefined,
    id,
    new Map(),
    new Map(),
    { format: 'battle_royale' },
  );
  for (let index = 0; index < count; index += 1) {
    match.players.get(`bot:${index}`)!.characterId = CHARACTER_IDS[index % CHARACTER_IDS.length];
  }
  match.phase = MatchPhase.ACTIVE;
  match.matchTimer = 1_000;
  return match;
}

function equip(
  playerState: PlayerState,
  weapon: WeaponInstance,
  loaded: number,
  reserve: number,
): void {
  playerState.battleRoyaleInventory = {
    equipped: weapon,
    loadedAmmo: loaded,
    reserveAmmo: reserve,
  };
  playerState.weaponId = weapon.weaponId;
  playerState.weaponInstance = weapon;
  playerState.ammo = loaded;
  playerState.specialAmmo = loaded;
  playerState.specialReserve = reserve;
}

describe('Battle Royale bot planner', () => {
  it('compares damage-only rarity and refuses deterministic downgrades', () => {
    const bot = player();
    const current = instance('current', 'sniper_rifle', 'legendary');
    equip(bot, current, 1, 6);
    const downgrade = instance('downgrade', 'pistol', 'mythical');
    const upgrade = instance('upgrade', 'sniper_rifle', 'mythical');

    expect(battleRoyaleWeaponUtility(upgrade)).toBeGreaterThan(battleRoyaleWeaponUtility(current));
    expect(battleRoyaleWeaponUtility(downgrade)).toBeLessThan(battleRoyaleWeaponUtility(current));
    expect(
      planBattleRoyaleBot(
        bot,
        world(bot, {
          drops: [
            {
              id: 'drop:bad',
              position: { x: 130, y: 120 },
              weaponInstance: downgrade,
              loadedAmmo: 12,
            },
          ],
        }),
      ).goalKind,
    ).toBe('target');
    expect(
      planBattleRoyaleBot(
        bot,
        world(bot, {
          drops: [
            {
              id: 'drop:good',
              position: { x: 130, y: 120 },
              weaponInstance: upgrade,
              loadedAmmo: 3,
            },
          ],
        }),
      ),
    ).toMatchObject({ goalKind: 'gun', swapDropId: 'drop:good' });
  });

  it('uses distance then player id for N-player targets regardless of insertion order', () => {
    const bot = player();
    const alpha = player({ id: 'alpha', position: { x: 220, y: 120 } });
    const zulu = player({ id: 'zulu', position: { x: 20, y: 120 } });
    const first = new Map([
      [bot.id, bot],
      [zulu.id, zulu],
      [alpha.id, alpha],
    ]);
    const second = new Map([
      [bot.id, bot],
      [alpha.id, alpha],
      [zulu.id, zulu],
    ]);
    expect(pickBattleRoyaleTarget(bot, first, null)?.id).toBe('alpha');
    expect(pickBattleRoyaleTarget(bot, second, null)?.id).toBe('alpha');
  });

  it('preempts combat outside the current circle and plans the next circle only when due', () => {
    const bot = player({ position: { x: 10, y: 240 } });
    expect(battleRoyaleZoneGoal(bot, zone())).toEqual({
      kind: 'current-zone',
      position: { x: 240, y: 240 },
    });

    bot.position = { x: 120, y: 240 };
    expect(battleRoyaleZoneGoal(bot, zone({ phaseSecondsRemaining: 12 }))).toBeNull();
    expect(battleRoyaleZoneGoal(bot, zone({ phaseSecondsRemaining: 1 }))).toEqual({
      kind: 'next-zone',
      position: { x: 300, y: 240 },
    });
    expect(
      planBattleRoyaleBot(bot, world(bot, { safeZone: zone({ phaseSecondsRemaining: 1 }) })),
    ).toMatchObject({ goalKind: 'next-zone', combatTarget: null, swapDropId: null });

    const collisionGrid: CollisionGrid = {
      width: 10,
      height: 10,
      tileSize: 48,
      solid: Array.from({ length: 10 }, (_, row) =>
        Array.from({ length: 10 }, (_, col) => row === 5 && col === 5),
      ),
    };
    bot.position = { x: 10, y: 240 };
    const walkable = battleRoyaleZoneGoal(bot, zone(), collisionGrid)!.position;
    expect(collisionGrid.solid[Math.floor(walkable.y / 48)][Math.floor(walkable.x / 48)]).toBe(
      false,
    );
    expect(Math.hypot(walkable.x - 240, walkable.y - 240)).toBeLessThanOrEqual(220);
  });

  it('chooses useful sustain, rejects unsafe detours, and suppresses loot in final closure', () => {
    const bot = player({ health: 35 });
    const useful = {
      id: 'supply:useful',
      position: { x: 140, y: 120 },
      reserveAmmo: 18,
      sustainType: 'bandage' as const,
      lootSourceId: 'source:1',
      source: 'container' as const,
    };
    expect(planBattleRoyaleBot(bot, world(bot, { supplies: [useful] })).goalKind).toBe('supply');

    const unsafeZone = zone({
      center: { x: 120, y: 120 },
      radius: 80,
      nextCenter: null,
      nextRadius: null,
    });
    expect(
      planBattleRoyaleBot(
        bot,
        world(bot, {
          safeZone: unsafeZone,
          supplies: [{ ...useful, position: { x: 400, y: 120 } }],
        }),
      ).goalKind,
    ).toBe('hold');

    const final = zone({
      phaseIndex: 7,
      phase: 'final',
      center: { x: 120, y: 120 },
      radius: 80,
      nextCenter: null,
      nextRadius: null,
      phaseSecondsRemaining: 10,
      damagePerPulse: 16,
    });
    const safeRival = player({ id: 'safe-rival', position: { x: 160, y: 120 } });
    expect(
      planBattleRoyaleBot(
        bot,
        world(bot, {
          safeZone: final,
          supplies: [useful],
          players: new Map([
            [bot.id, bot],
            [safeRival.id, safeRival],
          ]),
        }),
      ),
    ).toMatchObject({ goalKind: 'target', finalAggression: true, swapDropId: null });
  });
});

describe('Battle Royale bot authoritative integration', () => {
  it('opens a container through combat and collects its gun, ammo, and useful sustain', () => {
    const match = createMatch('br-bot-container');
    const internals = match as unknown as { battleRoyaleSafeZonePlan: null };
    internals.battleRoyaleSafeZonePlan = null;
    const bot = match.players.get('bot:0')!;
    const rival = match.players.get('bot:1')!;
    bot.position = { x: 2.5 * 48, y: 3.5 * 48 };
    rival.position = { x: 7.5 * 48, y: 3.5 * 48 };
    bot.health = 35;
    bot.grenades = 0;
    expect(match.spawnBattleRoyaleContainer('bot-container', 4, 3)).not.toBeNull();
    const controller = new BotController(bot.id);

    for (let tick = 1; tick <= 180 && bot.battleRoyaleInventory?.equipped === null; tick += 1) {
      controller.update(0.05, match, tick);
      match.update(0.05);
    }

    expect(match.getBattleRoyaleContainers().some(({ status }) => status === 'intact')).toBe(false);
    expect(bot.battleRoyaleInventory?.equipped).not.toBeNull();
    expect(bot.battleRoyaleInventory?.reserveAmmo).toBeGreaterThan(0);
    expect(bot.health > 35 || bot.armor > 0 || bot.grenades > 0).toBe(true);
  });

  it('swaps only through contextual input and reloads universal reserve', () => {
    const match = createMatch('br-bot-swap');
    const internals = match as unknown as { battleRoyaleSafeZonePlan: null };
    internals.battleRoyaleSafeZonePlan = null;
    const bot = match.players.get('bot:0')!;
    const current = instance('current-pistol', 'pistol', 'common');
    equip(bot, current, 1, 5);
    const upgrade = instance('upgrade-sniper', 'sniper_rifle', 'legendary');
    match.spawnBattleRoyaleDroppedWeapon(upgrade, 0, bot.position);
    const controller = new BotController(bot.id);

    controller.update(0.05, match, 1);
    match.update(0.05);
    expect(bot.battleRoyaleInventory?.equipped).toEqual(upgrade);
    expect(bot.isReloading).toBe(false);

    for (let tick = 2; tick <= 40 && !bot.isReloading; tick += 1) {
      controller.update(0.05, match, tick);
      match.update(0.05);
    }
    expect(bot.isReloading).toBe(true);
    for (let tick = 41; tick <= 100 && bot.isReloading; tick += 1) match.update(0.05);
    expect(bot.battleRoyaleInventory?.loadedAmmo).toBeGreaterThan(0);
    expect(bot.battleRoyaleInventory?.reserveAmmo).toBeLessThan(5);
  });

  it('fires more often in final closure without changing weapon damage', () => {
    const shotsFor = (elapsed: number): number => {
      const match = createMatch(`br-bot-aggression:${elapsed}`, getBattleRoyaleMap());
      const internals = match as unknown as { battleRoyaleSafeZoneElapsed: number };
      internals.battleRoyaleSafeZoneElapsed = elapsed;
      const state = match.getBattleRoyaleSafeZoneState()!;
      const bot = match.players.get('bot:0')!;
      const rival = match.players.get('bot:1')!;
      bot.position = { x: state.center.x - 65, y: state.center.y };
      rival.position = { x: state.center.x + 65, y: state.center.y };
      rival.health = 1_000_000;
      rival.maxHealth = 1_000_000;
      const rifle = instance(`rifle:${elapsed}`, 'rifle', 'rare');
      equip(bot, rifle, WEAPONS.rifle.magazineSize, 240);
      const controller = new BotController(bot.id, 'scrapper');
      for (let tick = 1; tick <= 40; tick += 1) {
        controller.update(0.05, match, tick);
        match.update(0.05);
      }
      return match.stats.getStats(bot.id).shotsFired;
    };

    expect(shotsFor(96)).toBeGreaterThan(shotsFor(32));
  });

  it('reproduces two independent eight-bot 20 Hz runs', () => {
    const simulate = (): unknown => {
      const match = createMatch('br-eight-bot-determinism', getBattleRoyaleMap(), 8);
      const controllers = [...match.players.keys()].map((id) => new BotController(id));
      for (let tick = 1; tick <= 400; tick += 1) {
        for (const controller of controllers) controller.update(0.05, match, tick);
        match.update(0.05);
      }
      return {
        phase: match.phase,
        players: [...match.players.values()].map((fighter) => ({
          id: fighter.id,
          position: fighter.position,
          health: fighter.health,
          armor: fighter.armor,
          dead: fighter.isDead,
          lastInput: fighter.lastProcessedInput,
          inventory: fighter.battleRoyaleInventory,
        })),
        containers: match.getBattleRoyaleContainers(),
        drops: match.getDroppedWeapons(),
        supplies: match.getBattleRoyaleSupplyBundles(),
      };
    };

    const first = simulate();
    const second = simulate();
    expect(second).toEqual(first);
    const snapshot = first as {
      phase: MatchPhase;
      players: Array<{ dead: boolean; lastInput: number }>;
    };
    const fighters = snapshot.players;
    expect(fighters.every(({ lastInput }) => lastInput > 0 && lastInput <= 400)).toBe(true);
    const living = fighters.filter(({ dead }) => !dead);
    if (snapshot.phase === MatchPhase.ACTIVE) {
      expect(living.every(({ lastInput }) => lastInput === 400)).toBe(true);
    } else {
      expect(snapshot.phase).toBe(MatchPhase.ENDED);
      expect(living.length).toBeLessThanOrEqual(1);
    }
  });
});
