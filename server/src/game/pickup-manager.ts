import {
  PickupState,
  PickupType,
  PlayerState,
  Vec2,
  MapData,
  PICKUP,
  GUN,
  GRENADE,
} from '@shared/game';

const MAX_AMMO = GUN.MAGAZINE_SIZE * 2;

export class PickupManager {
  private pickups: Map<string, PickupState> = new Map();
  private nextId = 0;

  /** Create pickups from map data's pickupSpawns. */
  initFromMap(mapData: MapData): void {
    this.pickups.clear();
    this.nextId = 0;

    for (const spawn of mapData.pickupSpawns) {
      const id = `pickup-${this.nextId++}`;
      const tileSize = mapData.tileSize;
      const pickup: PickupState = {
        id,
        type: spawn.type === 'gun_ammo' ? PickupType.GUN_AMMO : PickupType.GRENADE,
        position: {
          x: spawn.x * tileSize + tileSize / 2,
          y: spawn.y * tileSize + tileSize / 2,
        },
        isActive: true,
        respawnTimer: 0,
      };
      this.pickups.set(id, pickup);
    }
  }

  /** Tick respawn timers; reactivate pickups whose timer expires. */
  update(dt: number): void {
    for (const pickup of this.pickups.values()) {
      if (!pickup.isActive && pickup.respawnTimer > 0) {
        pickup.respawnTimer -= dt;
        if (pickup.respawnTimer <= 0) {
          pickup.respawnTimer = 0;
          pickup.isActive = true;
        }
      }
    }
  }

  /** Check if the player's hitbox overlaps any active pickup. Returns the first match or null. */
  checkCollection(
    playerPos: Vec2,
    playerHitbox: { width: number; height: number },
  ): PickupState | null {
    const halfW = playerHitbox.width / 2;
    const halfH = playerHitbox.height / 2;

    for (const pickup of this.pickups.values()) {
      if (!pickup.isActive) continue;

      // Simple AABB overlap: treat pickup as a point inside player's hitbox
      if (
        Math.abs(playerPos.x - pickup.position.x) < halfW &&
        Math.abs(playerPos.y - pickup.position.y) < halfH
      ) {
        return pickup;
      }
    }
    return null;
  }

  /** Mark a pickup as inactive and start its respawn timer. */
  collectPickup(pickupId: string): void {
    const pickup = this.pickups.get(pickupId);
    if (!pickup) return;

    pickup.isActive = false;
    pickup.respawnTimer = PICKUP.RESPAWN_TIME;
  }

  /** Apply pickup effect to a player. Returns true if the pickup was useful. */
  applyPickup(pickup: PickupState, player: PlayerState): boolean {
    switch (pickup.type) {
      case PickupType.GUN_AMMO: {
        if (player.ammo >= MAX_AMMO) return false;
        player.ammo = Math.min(player.ammo + PICKUP.GUN_AMMO_AMOUNT, MAX_AMMO);
        return true;
      }
      case PickupType.GRENADE: {
        if (player.grenades >= GRENADE.MAX_CARRY) return false;
        player.grenades = Math.min(
          player.grenades + PICKUP.GRENADE_AMOUNT,
          GRENADE.MAX_CARRY,
        );
        return true;
      }
      default:
        return false;
    }
  }

  /** Return all pickups as an array. */
  getPickups(): PickupState[] {
    return Array.from(this.pickups.values());
  }
}
