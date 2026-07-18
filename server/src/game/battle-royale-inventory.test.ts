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

function mapData(): MapData {
  return {
    name: 'battle-royale-inventory-test',
    width: 12,
    height: 12,
    tileSize: 48,
    tiles: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 0)),
    spawnPoints: [
      { x: 2, y: 2 },
      { x: 9, y: 9 },
      { x: 2, y: 9 },
      { x: 9, y: 2 },
    ],
    pickupSpawns: [],
  };
}

function createMatch(playerCount = 3, arena = mapData()): Match {
  const match = new Match(
    'battle-royale-inventory',
    arena,
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
    undefined,
    new Map(),
    new Map(),
    { format: 'battle_royale' },
  );
  match.phase = MatchPhase.ACTIVE;
  match.matchTimer = MATCH.TIME_LIMIT;
  for (const player of match.players.values()) player.characterId = 'mighty_man';
  return match;
}

function input(
  sequenceNumber: number,
  options: { reload?: boolean; fire?: boolean } = {},
): PlayerInput {
  return {
    sequenceNumber,
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    aimingGun: false,
    firePressed: options.fire ?? false,
    aimingGrenade: false,
    throwPressed: false,
    detonatePressed: false,
    reload: options.reload ?? false,
    sprint: false,
    abilityPressed: false,
    tick: sequenceNumber,
  };
}

function instance(
  instanceId: string,
  weaponId: WeaponInstance['weaponId'],
  rarity: WeaponInstance['rarity'] = 'rare',
): WeaponInstance {
  return { instanceId, weaponId, rarity };
}

function equip(
  player: PlayerState,
  weaponInstance: WeaponInstance,
  loaded: number,
  reserve: number,
): void {
  player.weaponId = weaponInstance.weaponId;
  player.weaponInstance = weaponInstance;
  player.ammo = loaded;
  player.specialAmmo = loaded;
  player.specialReserve = reserve;
  player.battleRoyaleInventory = {
    equipped: weaponInstance,
    loadedAmmo: loaded,
    reserveAmmo: reserve,
  };
}

describe('Battle Royale single-slot inventory', () => {
  it('spawns Battle Royale entrants with fists while standard players retain the rifle', () => {
    const battleRoyale = createMatch();
    for (const player of battleRoyale.players.values()) {
      expect(player.weaponId).toBe('punch');
      expect(player.battleRoyaleInventory).toEqual({
        equipped: null,
        loadedAmmo: 0,
        reserveAmmo: 0,
      });
    }

    const standard = new Match('standard-inventory-byte-shape', mapData(), [
      { id: 'alpha', nickname: 'Alpha' },
      { id: 'bravo', nickname: 'Bravo' },
    ]);
    expect(standard.players.get('alpha')).toMatchObject({ weaponId: 'rifle', ammo: 30 });
    expect(standard.players.get('alpha')?.battleRoyaleInventory).toBeUndefined();
    expect(
      standard.spawnBattleRoyaleDroppedWeapon(instance('weapon:standard', 'rifle'), 10, {
        x: 100,
        y: 100,
      }),
    ).toBeNull();
  });

  it('auto-equips one ground gun only while unarmed', () => {
    const match = createMatch();
    const player = match.players.get('player-0')!;
    player.position = { x: 120, y: 120 };
    match.spawnBattleRoyaleDroppedWeapon(instance('weapon:auto', 'smg', 'uncommon'), 11, {
      x: 120,
      y: 120,
    });

    match.update(0.05);
    expect(player.weaponId).toBe('smg');
    expect(player.battleRoyaleInventory).toMatchObject({
      equipped: { instanceId: 'weapon:auto', weaponId: 'smg', rarity: 'uncommon' },
      loadedAmmo: 11,
      reserveAmmo: 0,
    });
    expect(match.getDroppedWeapons()).toEqual([]);
  });

  it('requires reload to swap, drops the old exact gun, and retains universal reserve', () => {
    const match = createMatch();
    const player = match.players.get('player-0')!;
    player.position = { x: 120, y: 120 };
    equip(player, instance('weapon:old', 'pistol', 'epic'), 7, 41);
    const incoming = match.spawnBattleRoyaleDroppedWeapon(
      instance('weapon:new', 'sniper_rifle', 'legendary'),
      2,
      { x: 120, y: 120 },
    )!;

    match.update(0.05);
    expect(player.weaponId).toBe('pistol');
    expect(player.battleRoyaleInventory?.swapCandidateId).toBe(incoming.id);

    match.queueInput(player.id, input(1, { reload: true }));
    match.update(0.05);
    expect(player.weaponId).toBe('sniper_rifle');
    expect(player.battleRoyaleInventory).toMatchObject({
      equipped: { instanceId: 'weapon:new' },
      loadedAmmo: 2,
      reserveAmmo: 41,
    });
    expect(match.getDroppedWeapons()).toEqual([
      expect.objectContaining({
        weaponInstance: { instanceId: 'weapon:old', weaponId: 'pistol', rarity: 'epic' },
        loadedAmmo: 7,
        position: { x: 120, y: 120 },
      }),
    ]);
  });

  it('reloads from universal reserve only when no swap candidate is eligible', () => {
    const match = createMatch();
    const player = match.players.get('player-0')!;
    equip(player, instance('weapon:reload', 'rifle'), 10, 5);
    match.queueInput(player.id, input(1, { reload: true }));
    match.update(0.05);
    expect(player.isReloading).toBe(true);

    match.update(WEAPONS.rifle.reloadTime);
    expect(player.isReloading).toBe(false);
    expect(player.battleRoyaleInventory).toMatchObject({ loadedAmmo: 15, reserveAmmo: 0 });
    expect(player.ammo).toBe(15);
  });

  it('discards a fired-dry gun to fists while preserving universal reserve', () => {
    const match = createMatch();
    const player = match.players.get('player-0')!;
    equip(player, instance('weapon:dry', 'pistol'), 1, 9);
    match.queueInput(player.id, input(1, { fire: true }));
    match.update(0.05);
    expect(player.weaponId).toBe('punch');
    expect(player.weaponInstance).toBeUndefined();
    expect(player.battleRoyaleInventory).toEqual({
      equipped: null,
      loadedAmmo: 0,
      reserveAmmo: 9,
    });
  });

  it('resolves contested collection by stable player id and supports eight simultaneous drops', () => {
    const match = createMatch(8);
    for (const player of match.players.values()) player.position = { x: 120, y: 120 };
    match.spawnBattleRoyaleDroppedWeapon(instance('weapon:contested', 'shotgun'), 2, {
      x: 120,
      y: 120,
    });
    match.update(0.05);
    expect(match.players.get('player-0')?.weaponId).toBe('shotgun');
    for (let index = 1; index < 8; index += 1) {
      expect(match.players.get(`player-${index}`)?.weaponId).toBe('punch');
    }

    for (let index = 0; index < 8; index += 1) {
      match.spawnBattleRoyaleDroppedWeapon(instance(`weapon:n-player:${index}`, 'rifle'), index, {
        x: 300 + index * 40,
        y: 300,
      });
    }
    expect(match.getDroppedWeapons()).toHaveLength(8);
    expect(new Set(match.getDroppedWeapons().map((drop) => drop.id)).size).toBe(8);
  });

  it('clears held inventory on elimination and departure after authoring exact Batch 44 loot', () => {
    const match = createMatch();
    const victim = match.players.get('player-1')!;
    equip(victim, instance('weapon:death', 'launcher', 'mythical'), 1, 20);
    match.onKill('player-0', victim.id, 'gun');
    expect(victim.battleRoyaleInventory).toEqual({
      equipped: null,
      loadedAmmo: 0,
      reserveAmmo: 0,
    });
    expect(match.getDroppedWeapons()).toEqual([
      expect.objectContaining({
        weaponInstance: { instanceId: 'weapon:death', weaponId: 'launcher', rarity: 'mythical' },
        loadedAmmo: 1,
        lootSourceId: 'br-elimination:player-1',
      }),
    ]);

    const leaver = match.players.get('player-2')!;
    equip(leaver, instance('weapon:depart', 'smg'), 8, 12);
    match.onPlayerDisconnect(leaver.id);
    expect(leaver.battleRoyaleInventory).toEqual({
      equipped: null,
      loadedAmmo: 0,
      reserveAmmo: 0,
    });
    expect(match.getDroppedWeapons()).toHaveLength(2);
    expect(match.getBattleRoyaleSupplyBundles()).toHaveLength(2);
  });

  it('records an uncredited launcher self-elimination in a multi-opponent Battle Royale', () => {
    const arena = mapData();
    arena.tiles[2][3] = 1;
    const match = createMatch(3, arena);
    const shooter = match.players.get('player-0')!;
    shooter.position = { x: 120, y: 120 };
    shooter.health = 10;
    shooter.invulnerableTimer = 0;
    match.players.get('player-1')!.position = { x: 400, y: 400 };
    match.players.get('player-2')!.position = { x: 450, y: 400 };
    equip(shooter, instance('weapon:self', 'launcher', 'mythical'), 1, 0);

    match.queueInput(shooter.id, input(1, { fire: true }));
    match.update(0.05);
    for (let tick = 0; tick < 4 && !shooter.isDead; tick += 1) match.update(0.05);
    expect(shooter.isDead).toBe(true);
    expect(shooter.battleRoyaleInventory).toEqual({
      equipped: null,
      loadedAmmo: 0,
      reserveAmmo: 0,
    });
    expect(match.checkMatchEnd()).toBe(false);
  });
});
