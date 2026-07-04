import { describe, it, expect, beforeEach } from 'vitest';
import { PickupManager } from './pickup-manager.js';
import { PickupType, PICKUP, WEAPONS, GRENADE } from '@shared/game';
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
  });

  describe('weapon pickups', () => {
    it('spawns inactive with the weapon respawn timer running', () => {
      manager.initFromMap(makeMapData([{ x: 5, y: 5, type: 'weapon_shotgun' }]));
      const [pickup] = manager.getPickups();
      expect(pickup.type).toBe(PickupType.WEAPON_SHOTGUN);
      expect(pickup.isActive).toBe(false);
      expect(pickup.respawnTimer).toBe(PICKUP.WEAPON_RESPAWN_TIME);
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
  });
});
