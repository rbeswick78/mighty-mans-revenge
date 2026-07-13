import { describe, it, expect, beforeEach } from 'vitest';
import { PickupManager } from './pickup-manager.js';
import { PickupType, PICKUP, WEAPONS, GRENADE, MUTATORS } from '@shared/game';
import type { MapData, PlayerState, Vec2, PickupSpawnType } from '@shared/game';

function makeMapData(
  pickupSpawns: Array<{ x: number; y: number; type: PickupSpawnType }> = [],
): MapData {
  return {
    name: 'test-map',
    width: 10,
    height: 10,
    tileSize: 48,
    tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
    spawnPoints: [{ x: 1, y: 1 }],
    pickupSpawns,
  };
}

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'player-1',
    nickname: 'Test',
    characterId: 'mighty_man',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 100,
    maxHealth: 100,
    armor: 0,
    ammo: 10,
    isReloading: false,
    reloadTimer: 0,
    weaponId: 'rifle',
    specialAmmo: 0,
    specialReserve: 0,
    grenades: 3,
    grenadeRegenSeconds: 0,
    isSprinting: false,
    stamina: 3,
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

describe('PickupManager', () => {
  let manager: PickupManager;

  beforeEach(() => {
    manager = new PickupManager();
  });

  describe('initFromMap', () => {
    it('should create both gun_ammo and grenade pickups from map data', () => {
      const mapData = makeMapData([
        { x: 2, y: 3, type: 'gun_ammo' },
        { x: 5, y: 5, type: 'grenade' },
      ]);
      manager.initFromMap(mapData);

      const pickups = manager.getPickups();
      expect(pickups).toHaveLength(2);

      const ammo = pickups.find((p) => p.type === PickupType.GUN_AMMO);
      expect(ammo).toBeDefined();
      expect(ammo!.isActive).toBe(true);
      // Tile center: 2 * 48 + 24 = 120, 3 * 48 + 24 = 168
      expect(ammo!.position).toEqual({ x: 120, y: 168 });

      const grenade = pickups.find((p) => p.type === PickupType.GRENADE);
      expect(grenade).toBeDefined();
      expect(grenade!.isActive).toBe(true);
      // Tile center: 5 * 48 + 24 = 264, 5 * 48 + 24 = 264
      expect(grenade!.position).toEqual({ x: 264, y: 264 });
    });
  });

  describe('checkCollection', () => {
    it('should return pickup when player overlaps', () => {
      const mapData = makeMapData([{ x: 2, y: 2, type: 'gun_ammo' }]);
      manager.initFromMap(mapData);

      // Pickup is at tile center: 2*48+24 = 120, 120
      const playerPos: Vec2 = { x: 120, y: 120 };
      const hitbox = { width: 24, height: 24 };

      const result = manager.checkCollection(playerPos, hitbox);
      expect(result).not.toBeNull();
      expect(result!.type).toBe(PickupType.GUN_AMMO);
    });

    it('should return null when player does not overlap', () => {
      const mapData = makeMapData([{ x: 2, y: 2, type: 'gun_ammo' }]);
      manager.initFromMap(mapData);

      // Far away from pickup at (120, 120)
      const playerPos: Vec2 = { x: 0, y: 0 };
      const hitbox = { width: 24, height: 24 };

      const result = manager.checkCollection(playerPos, hitbox);
      expect(result).toBeNull();
    });

    it('should not return inactive pickups', () => {
      const mapData = makeMapData([{ x: 2, y: 2, type: 'gun_ammo' }]);
      manager.initFromMap(mapData);

      const pickups = manager.getPickups();
      manager.collectPickup(pickups[0].id);

      const playerPos: Vec2 = { x: 120, y: 120 };
      const hitbox = { width: 24, height: 24 };

      const result = manager.checkCollection(playerPos, hitbox);
      expect(result).toBeNull();
    });
  });

  describe('collectPickup', () => {
    it('should mark pickup as inactive and start respawn timer', () => {
      const mapData = makeMapData([{ x: 2, y: 2, type: 'gun_ammo' }]);
      manager.initFromMap(mapData);

      const pickups = manager.getPickups();
      manager.collectPickup(pickups[0].id);

      expect(pickups[0].isActive).toBe(false);
      expect(pickups[0].respawnTimer).toBe(PICKUP.RESPAWN_TIME);
    });

    it('keeps a one-shot reward for one inactive snapshot, then retires it', () => {
      manager.initFromMap(makeMapData());
      const reward = manager.spawnOneShot(PickupType.WEAPON_PISTOL, {
        x: 120,
        y: 168,
      });

      expect(manager.getPickups()).toEqual([reward]);
      manager.collectPickup(reward.id);
      expect(reward.isActive).toBe(false);
      expect(reward.respawnTimer).toBe(0);
      expect(manager.getPickups()).toEqual([reward]);

      manager.update(0.05);
      expect(manager.getPickups()).toEqual([]);
    });
  });

  describe('dropped power weapons', () => {
    it('preserves the exact surviving ammo instead of refilling the weapon', () => {
      manager.initFromMap(makeMapData());
      const survivingAmmo = WEAPONS.shotgun.magazineSize + 3;
      const drop = manager.spawnOneShot(
        PickupType.WEAPON_SHOTGUN,
        { x: 120, y: 168 },
        {
          weaponAmmo: survivingAmmo,
          expiresInSeconds: PICKUP.DROPPED_WEAPON_LIFETIME_SECONDS,
          isDroppedWeapon: true,
        },
      );
      const player = makePlayer();

      expect(manager.applyPickup(drop, player)).toBe(true);
      expect(player.weaponId).toBe('shotgun');
      expect(player.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
      expect(player.specialReserve).toBe(3);
      expect(player.specialAmmo + player.specialReserve).toBe(survivingAmmo);
    });

    it('expires unclaimed drops on their authoritative countdown', () => {
      manager.initFromMap(makeMapData());
      const drop = manager.spawnOneShot(
        PickupType.WEAPON_PISTOL,
        { x: 120, y: 168 },
        {
          weaponAmmo: 4,
          expiresInSeconds: PICKUP.DROPPED_WEAPON_LIFETIME_SECONDS,
          isDroppedWeapon: true,
        },
      );

      manager.update(PICKUP.DROPPED_WEAPON_LIFETIME_SECONDS - 0.25);
      expect(manager.getPickups()).toEqual([drop]);
      expect(drop.expiresInSeconds).toBeCloseTo(0.25, 5);

      manager.update(0.3);
      expect(manager.getPickups()).toEqual([]);
    });

    it('leaves cache-style one-shot rewards active until collected', () => {
      manager.initFromMap(makeMapData());
      const reward = manager.spawnOneShot(PickupType.WEAPON_PISTOL, {
        x: 120,
        y: 168,
      });

      manager.update(PICKUP.DROPPED_WEAPON_LIFETIME_SECONDS * 10);

      expect(manager.getPickups()).toEqual([reward]);
      expect(reward.expiresInSeconds).toBeUndefined();
    });
  });

  describe('Scavenger Rush supplies', () => {
    it('carries its reconnect-safe flag and authoritative lifetime', () => {
      manager.initFromMap(makeMapData());
      const supply = manager.spawnOneShot(
        PickupType.GRENADE,
        { x: 120, y: 168 },
        {
          expiresInSeconds: MUTATORS.SCAVENGER_RUSH_DROP_LIFETIME_SECONDS,
          isScavengerRushDrop: true,
        },
      );

      expect(supply).toMatchObject({
        isScavengerRushDrop: true,
        expiresInSeconds: MUTATORS.SCAVENGER_RUSH_DROP_LIFETIME_SECONDS,
      });
      manager.update(MUTATORS.SCAVENGER_RUSH_DROP_LIFETIME_SECONDS + 0.1);
      expect(manager.getPickups()).toEqual([]);
    });

    it('retires only Rush supplies when regulation ends', () => {
      manager.initFromMap(makeMapData());
      const cacheReward = manager.spawnOneShot(PickupType.BANDAGE, {
        x: 120,
        y: 168,
      });
      manager.spawnOneShot(
        PickupType.GRENADE,
        { x: 168, y: 168 },
        { isScavengerRushDrop: true },
      );

      manager.removeScavengerRushDrops();

      expect(manager.getPickups()).toEqual([cacheReward]);
    });
  });

  describe('removeTypes', () => {
    it('permanently removes only the superseded pickup kinds', () => {
      manager.initFromMap(
        makeMapData([
          { x: 2, y: 2, type: 'weapon_shotgun' },
          { x: 3, y: 3, type: 'weapon_pistol' },
          { x: 4, y: 4, type: 'bandage' },
        ]),
      );

      manager.removeTypes([
        PickupType.WEAPON_SHOTGUN,
        PickupType.WEAPON_PISTOL,
      ]);
      manager.update(PICKUP.WEAPON_RESPAWN_TIME * 2);

      expect(manager.getPickups()).toHaveLength(1);
      expect(manager.getPickups()[0].type).toBe(PickupType.BANDAGE);
    });
  });

  describe('update - respawn timer', () => {
    it('should decrement respawn timer and reactivate when it expires', () => {
      const mapData = makeMapData([{ x: 2, y: 2, type: 'gun_ammo' }]);
      manager.initFromMap(mapData);

      const pickups = manager.getPickups();
      manager.collectPickup(pickups[0].id);
      expect(pickups[0].isActive).toBe(false);

      // Tick almost to respawn
      manager.update(PICKUP.RESPAWN_TIME - 1);
      expect(pickups[0].isActive).toBe(false);
      expect(pickups[0].respawnTimer).toBeCloseTo(1, 5);

      // Tick past respawn
      manager.update(2);
      expect(pickups[0].isActive).toBe(true);
      expect(pickups[0].respawnTimer).toBe(0);
    });
  });

  describe('applyPickup', () => {
    it('should add ammo for GUN_AMMO pickup', () => {
      const player = makePlayer({ ammo: 10 });
      const pickup = {
        id: 'p1',
        type: PickupType.GUN_AMMO,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(true);
      expect(player.ammo).toBe(10 + PICKUP.GUN_AMMO_AMOUNT);
    });

    it('should cap ammo at MAGAZINE_SIZE * 2', () => {
      const maxAmmo = WEAPONS.rifle.magazineSize * 2;
      const player = makePlayer({ ammo: maxAmmo - 5 });
      const pickup = {
        id: 'p1',
        type: PickupType.GUN_AMMO,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      manager.applyPickup(pickup, player);
      expect(player.ammo).toBe(maxAmmo);
    });

    it('should not apply GUN_AMMO when at max', () => {
      const maxAmmo = WEAPONS.rifle.magazineSize * 2;
      const player = makePlayer({ ammo: maxAmmo });
      const pickup = {
        id: 'p1',
        type: PickupType.GUN_AMMO,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(false);
      expect(player.ammo).toBe(maxAmmo);
    });

    it('should add a grenade for GRENADE pickup', () => {
      const player = makePlayer({ grenades: 1 });
      const pickup = {
        id: 'p1',
        type: PickupType.GRENADE,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(true);
      expect(player.grenades).toBe(1 + GRENADE.PICKUP_AMOUNT);
    });

    it('should cap grenades at GRENADE.MAX_COUNT', () => {
      const player = makePlayer({ grenades: GRENADE.MAX_COUNT - 1 });
      const pickup = {
        id: 'p1',
        type: PickupType.GRENADE,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      manager.applyPickup(pickup, player);
      expect(player.grenades).toBe(GRENADE.MAX_COUNT);
    });

    it('should not apply GRENADE pickup when at max', () => {
      const player = makePlayer({ grenades: GRENADE.MAX_COUNT });
      const pickup = {
        id: 'p1',
        type: PickupType.GRENADE,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(false);
      expect(player.grenades).toBe(GRENADE.MAX_COUNT);
    });

    it('WEAPON_SHOTGUN equips the shotgun with full mag + reserve and cancels a reload', () => {
      const player = makePlayer({ isReloading: true, reloadTimer: 1.2 });
      const pickup = {
        id: 'p1',
        type: PickupType.WEAPON_SHOTGUN,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(true);
      expect(player.weaponId).toBe('shotgun');
      expect(player.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
      expect(player.specialReserve).toBe(
        WEAPONS.shotgun.pickupAmmo - WEAPONS.shotgun.magazineSize,
      );
      expect(player.isReloading).toBe(false);
      expect(player.reloadTimer).toBe(0);
    });

    it('WEAPON_SHOTGUN refreshes shells when already holding a shotgun', () => {
      const player = makePlayer({
        weaponId: 'shotgun',
        specialAmmo: 0,
        specialReserve: 1,
      });
      const pickup = {
        id: 'p1',
        type: PickupType.WEAPON_SHOTGUN,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(true);
      expect(player.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
      expect(player.specialReserve).toBe(
        WEAPONS.shotgun.pickupAmmo - WEAPONS.shotgun.magazineSize,
      );
    });

    it('WEAPON_PISTOL equips the pistol with full mag + reserve and cancels a reload', () => {
      const player = makePlayer({ isReloading: true, reloadTimer: 0.6 });
      const pickup = {
        id: 'p1',
        type: PickupType.WEAPON_PISTOL,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(true);
      expect(player.weaponId).toBe('pistol');
      expect(player.specialAmmo).toBe(WEAPONS.pistol.magazineSize);
      expect(player.specialReserve).toBe(
        WEAPONS.pistol.pickupAmmo - WEAPONS.pistol.magazineSize,
      );
      expect(player.isReloading).toBe(false);
      expect(player.reloadTimer).toBe(0);
    });

    it('WEAPON_PISTOL refreshes ammo to full when already holding a pistol', () => {
      const player = makePlayer({
        weaponId: 'pistol',
        specialAmmo: 1,
        specialReserve: 0,
      });
      const pickup = {
        id: 'p1',
        type: PickupType.WEAPON_PISTOL,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(true);
      expect(player.weaponId).toBe('pistol');
      expect(player.specialAmmo).toBe(WEAPONS.pistol.magazineSize);
      expect(player.specialReserve).toBe(
        WEAPONS.pistol.pickupAmmo - WEAPONS.pistol.magazineSize,
      );
    });

    it('WEAPON_BAT equips exactly four swings with no reserve or reload', () => {
      const player = makePlayer({ isReloading: true, reloadTimer: 0.8 });
      const pickup = {
        id: 'bat',
        type: PickupType.WEAPON_BAT,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      expect(manager.applyPickup(pickup, player)).toBe(true);
      expect(player.weaponId).toBe('bat');
      expect(player.specialAmmo).toBe(WEAPONS.bat.magazineSize);
      expect(player.specialReserve).toBe(0);
      expect(player.isReloading).toBe(false);
      expect(player.reloadTimer).toBe(0);
    });

    it('a one-shot bat drop preserves exact remaining swings', () => {
      const pickup = manager.spawnOneShot(
        PickupType.WEAPON_BAT,
        { x: 0, y: 0 },
        { weaponAmmo: 2 },
      );
      const player = makePlayer();

      expect(manager.applyPickup(pickup, player)).toBe(true);
      expect(player.weaponId).toBe('bat');
      expect(player.specialAmmo).toBe(2);
      expect(player.specialReserve).toBe(0);
    });

    it('last-picked-up wins: a pistol replaces a held shotgun, and vice versa', () => {
      const pistolPickup = {
        id: 'p1',
        type: PickupType.WEAPON_PISTOL,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };
      const shotgunPickup = {
        id: 'p2',
        type: PickupType.WEAPON_SHOTGUN,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      // Shotgun in hand, walks over the pistol: pistol wins.
      const shotgunHolder = makePlayer({
        weaponId: 'shotgun',
        specialAmmo: WEAPONS.shotgun.magazineSize,
        specialReserve: 4,
      });
      expect(manager.applyPickup(pistolPickup, shotgunHolder)).toBe(true);
      expect(shotgunHolder.weaponId).toBe('pistol');
      expect(shotgunHolder.specialAmmo).toBe(WEAPONS.pistol.magazineSize);
      expect(shotgunHolder.specialReserve).toBe(
        WEAPONS.pistol.pickupAmmo - WEAPONS.pistol.magazineSize,
      );

      // Pistol in hand, walks over the shotgun: shotgun wins.
      const pistolHolder = makePlayer({
        weaponId: 'pistol',
        specialAmmo: 5,
        specialReserve: 10,
      });
      expect(manager.applyPickup(shotgunPickup, pistolHolder)).toBe(true);
      expect(pistolHolder.weaponId).toBe('shotgun');
      expect(pistolHolder.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
      expect(pistolHolder.specialReserve).toBe(
        WEAPONS.shotgun.pickupAmmo - WEAPONS.shotgun.magazineSize,
      );
    });

    it('BANDAGE heals by BANDAGE_HEAL capped at max health', () => {
      const player = makePlayer({ health: 85 });
      const pickup = {
        id: 'p1',
        type: PickupType.BANDAGE,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(true);
      expect(player.health).toBe(100);
    });

    it('BANDAGE is refused at full health and for dead players', () => {
      const full = makePlayer({ health: 100 });
      const dead = makePlayer({ health: 40, isDead: true });
      const pickup = {
        id: 'p1',
        type: PickupType.BANDAGE,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      expect(manager.applyPickup(pickup, full)).toBe(false);
      expect(full.health).toBe(100);
      expect(manager.applyPickup(pickup, dead)).toBe(false);
      expect(dead.health).toBe(40);
    });

    it('ARMOR grants one capped proactive shield and refuses full or dead players', () => {
      const pickup = {
        id: 'plate',
        type: PickupType.ARMOR,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };
      const unshielded = makePlayer();
      expect(manager.applyPickup(pickup, unshielded)).toBe(true);
      expect(unshielded.armor).toBe(PICKUP.ARMOR_MAX);

      expect(manager.applyPickup(pickup, unshielded)).toBe(false);
      const dead = makePlayer({ armor: 0, isDead: true });
      expect(manager.applyPickup(pickup, dead)).toBe(false);
      expect(dead.armor).toBe(0);
    });
  });

  describe('weapon pickups', () => {
    it('shotgun is delayed while pistol and bat start active', () => {
      manager.initFromMap(
        makeMapData([
          { x: 5, y: 5, type: 'weapon_shotgun' },
          { x: 7, y: 7, type: 'weapon_pistol' },
          { x: 8, y: 8, type: 'weapon_bat' },
        ]),
      );
      const pickups = manager.getPickups();

      // The shotgun is the announced power weapon: first drop is delayed
      // onto its full respawn timer.
      const shotgun = pickups.find((p) => p.type === PickupType.WEAPON_SHOTGUN)!;
      expect(shotgun.isActive).toBe(false);
      expect(shotgun.respawnTimer).toBe(PICKUP.WEAPON_RESPAWN_TIME);

      // The pistol is a sidegrade: collectible from the opening whistle.
      const pistol = pickups.find((p) => p.type === PickupType.WEAPON_PISTOL)!;
      expect(pistol.isActive).toBe(true);
      expect(pistol.respawnTimer).toBe(0);

      const bat = pickups.find((p) => p.type === PickupType.WEAPON_BAT)!;
      expect(bat.isActive).toBe(true);
      expect(bat.respawnTimer).toBe(0);
    });

    it('pistol respawns on the weapon respawn timer after collection', () => {
      manager.initFromMap(makeMapData([{ x: 5, y: 5, type: 'weapon_pistol' }]));
      const [pickup] = manager.getPickups();
      manager.collectPickup(pickup.id);

      expect(pickup.isActive).toBe(false);
      expect(pickup.respawnTimer).toBe(PICKUP.WEAPON_RESPAWN_TIME);

      manager.update(PICKUP.WEAPON_RESPAWN_TIME - 1);
      expect(pickup.isActive).toBe(false);
      manager.update(2);
      expect(pickup.isActive).toBe(true);
    });

    it('never announces the pistol across a full respawn cycle', () => {
      manager.initFromMap(makeMapData([{ x: 5, y: 5, type: 'weapon_pistol' }]));
      const [pickup] = manager.getPickups();
      manager.collectPickup(pickup.id);

      // Walk the whole timer down in small steps so every announce window
      // is crossed; the pistol must stay silent throughout.
      const step = 0.5;
      const steps = Math.ceil((PICKUP.WEAPON_RESPAWN_TIME + 1) / step);
      for (let i = 0; i < steps; i++) {
        expect(manager.update(step)).toHaveLength(0);
      }
      expect(pickup.isActive).toBe(true);
    });

    it('the bat respawns on the weapon timer without an announcement', () => {
      manager.initFromMap(makeMapData([{ x: 5, y: 5, type: 'weapon_bat' }]));
      const [pickup] = manager.getPickups();
      manager.collectPickup(pickup.id);

      expect(pickup.respawnTimer).toBe(PICKUP.WEAPON_RESPAWN_TIME);
      expect(manager.update(PICKUP.WEAPON_RESPAWN_TIME - 1)).toHaveLength(0);
      expect(pickup.isActive).toBe(false);
      expect(manager.update(2)).toHaveLength(0);
      expect(pickup.isActive).toBe(true);
    });

    it('a bandage-only type veto (Gun Game) filters pistol spawns out entirely', () => {
      manager.initFromMap(
        makeMapData([
          { x: 5, y: 5, type: 'weapon_pistol' },
          { x: 6, y: 6, type: 'weapon_shotgun' },
          { x: 8, y: 8, type: 'weapon_bat' },
          { x: 7, y: 7, type: 'bandage' },
        ]),
        (type) => type === PickupType.BANDAGE,
      );
      const pickups = manager.getPickups();
      expect(pickups).toHaveLength(1);
      expect(pickups[0].type).toBe(PickupType.BANDAGE);
    });

    it('announces once when crossing the announce lead, then lands', () => {
      manager.initFromMap(makeMapData([{ x: 5, y: 5, type: 'weapon_shotgun' }]));

      // Before the lead: no announcements.
      let announcements = manager.update(
        PICKUP.WEAPON_RESPAWN_TIME - PICKUP.WEAPON_ANNOUNCE_LEAD - 1,
      );
      expect(announcements).toHaveLength(0);

      // Crossing the lead: exactly one announcement.
      announcements = manager.update(2);
      expect(announcements).toHaveLength(1);
      expect(announcements[0].type).toBe(PickupType.WEAPON_SHOTGUN);
      expect(announcements[0].landsInMs).toBeGreaterThan(0);

      // Further ticks before landing: no repeat announcement.
      expect(manager.update(1)).toHaveLength(0);

      // Landing.
      manager.update(PICKUP.WEAPON_ANNOUNCE_LEAD);
      const [pickup] = manager.getPickups();
      expect(pickup.isActive).toBe(true);
    });

    it('re-announces on the next respawn cycle after collection', () => {
      manager.initFromMap(makeMapData([{ x: 5, y: 5, type: 'weapon_shotgun' }]));
      // Land it.
      manager.update(PICKUP.WEAPON_RESPAWN_TIME - 2);
      manager.update(3);
      const [pickup] = manager.getPickups();
      expect(pickup.isActive).toBe(true);

      manager.collectPickup(pickup.id);
      expect(pickup.respawnTimer).toBe(PICKUP.WEAPON_RESPAWN_TIME);

      const announcements = manager.update(
        PICKUP.WEAPON_RESPAWN_TIME - PICKUP.WEAPON_ANNOUNCE_LEAD + 1,
      );
      expect(announcements).toHaveLength(1);
    });

    it('bandages use their own respawn time', () => {
      manager.initFromMap(makeMapData([{ x: 5, y: 5, type: 'bandage' }]));
      const [pickup] = manager.getPickups();
      expect(pickup.isActive).toBe(true);
      manager.collectPickup(pickup.id);
      expect(pickup.respawnTimer).toBe(PICKUP.BANDAGE_RESPAWN_TIME);
    });

    it('Scrap Armor starts active and uses its own contested respawn time', () => {
      manager.initFromMap(makeMapData([{ x: 5, y: 5, type: 'armor' }]));
      const [pickup] = manager.getPickups();
      expect(pickup).toMatchObject({ type: PickupType.ARMOR, isActive: true });
      manager.collectPickup(pickup.id);
      expect(pickup.respawnTimer).toBe(PICKUP.ARMOR_RESPAWN_TIME);
    });
  });
});
