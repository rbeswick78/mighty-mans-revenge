import { describe, it, expect, beforeEach } from 'vitest';
import { PickupManager } from './pickup-manager.js';
import { PickupType, PICKUP, GUN, GRENADE } from '@shared/game';
import type { MapData, PlayerState, Vec2 } from '@shared/game';

function makeMapData(
  pickupSpawns: Array<{ x: number; y: number; type: 'gun_ammo' | 'grenade' }> = [],
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
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 100,
    maxHealth: 100,
    ammo: 10,
    isReloading: false,
    reloadTimer: 0,
    grenades: 3,
    isSprinting: false,
    stamina: 3,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
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
      const maxAmmo = GUN.MAGAZINE_SIZE * 2;
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
      const maxAmmo = GUN.MAGAZINE_SIZE * 2;
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
  });
});
