import {
  GameModeType,
  MATCH,
  MatchPhase,
  WEAPONS,
  type MapData,
  type PlayerInput,
  type PlayerState,
  type WeaponInstance,
} from '@shared/game';
import { describe, expect, it } from 'vitest';
import { Match } from './match.js';

function arena(): MapData {
  const tiles = Array.from({ length: 8 }, () => Array.from({ length: 10 }, () => 0));
  for (let col = 0; col < 10; col += 1) {
    tiles[0][col] = 1;
    tiles[7][col] = 1;
  }
  for (let row = 0; row < 8; row += 1) {
    tiles[row][0] = 1;
    tiles[row][9] = 1;
  }
  tiles[2][3] = 2;
  tiles[4][3] = 2;
  tiles[6][3] = 2;
  return {
    name: 'battle-royale-loot-lab',
    width: 10,
    height: 8,
    tileSize: 48,
    tiles,
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 8, y: 1 },
      { x: 1, y: 6 },
      { x: 8, y: 6 },
    ],
    pickupSpawns: [],
  };
}

function createMatch(id = 'battle-royale-loot', playerCount = 4): Match {
  const match = new Match(
    id,
    arena(),
    Array.from({ length: playerCount }, (_, index) => ({
      id: `player-${index}`,
      nickname: `Player ${index}`,
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
  match.phase = MatchPhase.ACTIVE;
  match.matchTimer = MATCH.TIME_LIMIT;
  for (const player of match.players.values()) {
    player.characterId = 'mighty_man';
    player.invulnerableTimer = 0;
  }
  return match;
}

function input(
  sequenceNumber: number,
  options: Partial<Pick<PlayerInput, 'firePressed' | 'throwPressed' | 'detonatePressed'>> = {},
): PlayerInput {
  return {
    sequenceNumber,
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    aimingGun: false,
    firePressed: options.firePressed ?? false,
    aimingGrenade: false,
    throwPressed: options.throwPressed ?? false,
    detonatePressed: options.detonatePressed ?? false,
    reload: false,
    sprint: false,
    abilityPressed: false,
    tick: sequenceNumber,
  };
}

function equip(
  player: PlayerState,
  weaponInstance: WeaponInstance,
  loadedAmmo: number,
  reserveAmmo: number,
): void {
  player.weaponId = weaponInstance.weaponId;
  player.weaponInstance = weaponInstance;
  player.ammo = loadedAmmo;
  player.specialAmmo = loadedAmmo;
  player.specialReserve = reserveAmmo;
  player.battleRoyaleInventory = {
    equipped: weaponInstance,
    loadedAmmo,
    reserveAmmo,
  };
}

describe('Battle Royale containers and compact loot', () => {
  it('guarantees one deterministic full-mag gun and one small supply bundle per container', () => {
    const first = createMatch('stable-container');
    const second = createMatch('stable-container');
    for (const match of [first, second]) {
      expect(match.spawnBattleRoyaleContainer('br-container:north', 3, 2)).toMatchObject({
        id: 'br-container:north',
        status: 'intact',
        tile: { col: 3, row: 2 },
        position: { x: 168, y: 120 },
      });
      const shooter = match.players.get('player-0')!;
      shooter.position = { x: 72, y: 120 };
      equip(shooter, { instanceId: 'weapon:opener', weaponId: 'rifle', rarity: 'rare' }, 30, 0);
      match.queueInput(shooter.id, input(1, { firePressed: true }));
      match.update(0.05);
    }

    expect(first.getBattleRoyaleContainers()).toEqual([
      expect.objectContaining({ id: 'br-container:north', status: 'opened' }),
    ]);
    expect(first.getDroppedWeapons()).toHaveLength(1);
    expect(first.getBattleRoyaleSupplyBundles()).toEqual([
      expect.objectContaining({
        reserveAmmo: 18,
        lootSourceId: 'br-container:north',
        source: 'container',
      }),
    ]);
    const [drop] = first.getDroppedWeapons();
    expect(drop.loadedAmmo).toBe(WEAPONS[drop.weaponInstance.weaponId].magazineSize);
    expect(drop.lootSourceId).toBe('br-container:north');
    expect(second.getDroppedWeapons()).toEqual(first.getDroppedWeapons());
    expect(second.getBattleRoyaleSupplyBundles()).toEqual(first.getBattleRoyaleSupplyBundles());

    first.queueInput('player-0', input(2, { firePressed: true }));
    first.update(0.05);
    expect(first.getDroppedWeapons()).toHaveLength(1);
    expect(first.getBattleRoyaleSupplyBundles()).toHaveLength(1);
    first.update(0.6);
    expect(first.getBattleRoyaleContainers()).toEqual([]);
  });

  it('derives a bounded stable weapon instance id from the longest legal container id', () => {
    const match = createMatch('bounded-container-id');
    const containerId = 'c'.repeat(96);
    expect(match.spawnBattleRoyaleContainer(containerId, 3, 2)?.id).toBe(containerId);
    const shooter = match.players.get('player-0')!;
    shooter.position = { x: 72, y: 120 };
    equip(
      shooter,
      { instanceId: 'weapon:bounded-opener', weaponId: 'rifle', rarity: 'rare' },
      30,
      0,
    );
    match.queueInput(shooter.id, input(1, { firePressed: true }));
    match.update(0.05);

    const [drop] = match.getDroppedWeapons();
    expect(drop.weaponInstance.instanceId).toMatch(/^br-weapon:[0-9a-f]{16}$/);
    expect(drop.lootSourceId).toBe(containerId);
  });

  it('opens containers through melee and explosions without leaking standard scenery behavior', () => {
    const melee = createMatch('melee-container');
    melee.spawnBattleRoyaleContainer('br-container:melee', 3, 4);
    const puncher = melee.players.get('player-0')!;
    puncher.position = { x: 110, y: 216 };
    melee.queueInput(puncher.id, input(1, { firePressed: true }));
    melee.update(0.05);
    expect(melee.getBattleRoyaleContainers()[0]?.status).toBe('opened');

    const explosive = createMatch('explosive-container');
    explosive.spawnBattleRoyaleContainer('br-container:blast', 3, 6);
    const thrower = explosive.players.get('player-0')!;
    thrower.position = { x: 120, y: 312 };
    explosive.queueInput(thrower.id, input(1, { throwPressed: true }));
    explosive.update(0.05);
    const grenade = explosive.getActiveGrenades()[0];
    grenade.position = { x: 168, y: 312 };
    grenade.velocity = { x: 0, y: 0 };
    explosive.queueInput(thrower.id, input(2, { detonatePressed: true }));
    explosive.update(0.05);
    expect(explosive.getBattleRoyaleContainers()[0]?.status).toBe('opened');

    const standard = new Match('standard-container-rejection', arena(), [
      { id: 'alpha', nickname: 'Alpha' },
      { id: 'bravo', nickname: 'Bravo' },
    ]);
    expect(standard.spawnBattleRoyaleContainer('br-container:standard', 3, 2)).toBeNull();
    expect(standard.getBattleRoyaleContainers()).toEqual([]);
    expect(standard.getBattleRoyaleSupplyBundles()).toEqual([]);
  });

  it('resolves contested gun and supply collection by stable player id', () => {
    const match = createMatch('contested-container', 8);
    match.spawnBattleRoyaleContainer('br-container:contest', 3, 2);
    const shooter = match.players.get('player-7')!;
    shooter.position = { x: 72, y: 120 };
    equip(
      shooter,
      { instanceId: 'weapon:contest-opener', weaponId: 'rifle', rarity: 'rare' },
      30,
      0,
    );
    match.queueInput(shooter.id, input(1, { firePressed: true }));
    match.update(0.05);
    for (const player of match.players.values()) {
      player.position = { x: 168, y: 120 };
      player.health = player.maxHealth - 10;
    }
    equip(
      match.players.get('player-0')!,
      { instanceId: 'weapon:armed-contender', weaponId: 'pistol', rarity: 'rare' },
      6,
      0,
    );
    match.update(0.05);

    expect(match.players.get('player-0')?.weaponId).toBe('pistol');
    expect(match.players.get('player-0')?.battleRoyaleInventory?.reserveAmmo).toBe(18);
    expect(match.players.get('player-1')?.weaponId).not.toBe('punch');
    expect(match.players.get('player-1')?.battleRoyaleInventory?.reserveAmmo).toBe(0);
    for (let index = 2; index < 7; index += 1) {
      expect(match.players.get(`player-${index}`)?.weaponId).toBe('punch');
      expect(match.players.get(`player-${index}`)?.battleRoyaleInventory?.reserveAmmo).toBe(0);
    }
    expect(match.getDroppedWeapons()).toEqual([]);
    expect(match.getBattleRoyaleSupplyBundles()).toEqual([]);
  });

  it('drops an exact armed elimination pile once and keeps empty/departure piles N-player safe', () => {
    const match = createMatch('elimination-piles', 8);
    const armed = match.players.get('player-1')!;
    armed.position = { x: 220, y: 180 };
    armed.grenades = 1;
    equip(
      armed,
      { instanceId: 'weapon:exact-victim', weaponId: 'sniper_rifle', rarity: 'mythical' },
      2,
      73,
    );
    match.onKill('player-0', armed.id, 'gun');
    expect(match.getDroppedWeapons()).toEqual([
      expect.objectContaining({
        position: { x: 220, y: 180 },
        weaponInstance: {
          instanceId: 'weapon:exact-victim',
          weaponId: 'sniper_rifle',
          rarity: 'mythical',
        },
        loadedAmmo: 2,
        lootSourceId: 'br-elimination:player-1',
      }),
    ]);
    expect(match.getBattleRoyaleSupplyBundles()).toEqual([
      expect.objectContaining({
        reserveAmmo: 73,
        sustainType: 'grenade',
        lootSourceId: 'br-elimination:player-1',
        source: 'elimination',
      }),
    ]);
    match.onKill('player-0', armed.id, 'gun');
    expect(match.getDroppedWeapons()).toHaveLength(1);
    expect(match.getBattleRoyaleSupplyBundles()).toHaveLength(1);

    for (let index = 2; index < 7; index += 1) {
      const player = match.players.get(`player-${index}`)!;
      player.position = { x: 80 + index * 40, y: 260 };
      player.grenades = 0;
      player.armor = index === 2 ? 10 : 0;
      if (index === 2) match.onPlayerDisconnect(player.id);
      else match.onKill('player-0', player.id, 'gun');
    }
    expect(match.getDroppedWeapons()).toHaveLength(1);
    expect(match.getBattleRoyaleSupplyBundles()).toHaveLength(6);
    expect(new Set(match.getBattleRoyaleSupplyBundles().map(({ id }) => id)).size).toBe(6);
    expect(
      match
        .getBattleRoyaleSupplyBundles()
        .find(({ lootSourceId }) => lootSourceId === 'br-elimination:player-2'),
    ).toMatchObject({ reserveAmmo: 0, sustainType: 'armor' });
  });
});
