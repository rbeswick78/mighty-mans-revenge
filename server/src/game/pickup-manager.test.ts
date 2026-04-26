import { describe, it, expect, beforeEach } from 'vitest';
import { PickupManager } from './pickup-manager.js';
import { PickupType, PICKUP, GUN } from '@shared/game';
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
    it('should create gun_ammo pickups from map data and skip grenade pickups', () => {
      const mapData = makeMapData([
        { x: 2, y: 3, type: 'gun_ammo' },
        { x: 5, y: 5, type: 'grenade' },
      ]);
      manager.initFromMap(mapData);

      const pickups = manager.getPickups();
      // grenade pickup is skipped — no carry count to refill.
      expect(pickups).toHaveLength(1);
      expect(pickups[0].type).toBe(PickupType.GUN_AMMO);
      expect(pickups[0].isActive).toBe(true);
      // Tile center: 2 * 48 + 24 = 120, 3 * 48 + 24 = 168
      expect(pickups[0].position).toEqual({ x: 120, y: 168 });
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

    it('GRENADE pickup is a no-op now that grenades have no carry count', () => {
      const player = makePlayer();
      const pickup = {
        id: 'p1',
        type: PickupType.GRENADE,
        position: { x: 0, y: 0 },
        isActive: true,
        respawnTimer: 0,
      };

      const result = manager.applyPickup(pickup, player);
      expect(result).toBe(false);
    });
  });
});
