import {
  PickupState,
  PickupType,
  PlayerState,
  Vec2,
  MapData,
  PickupSpawnType,
  PICKUP,
  WEAPONS,
  GRENADE,
} from '@shared/game';

const MAX_AMMO = WEAPONS.rifle.magazineSize * 2;

const SPAWN_TYPE_TO_PICKUP_TYPE: Record<PickupSpawnType, PickupType> = {
  gun_ammo: PickupType.GUN_AMMO,
  grenade: PickupType.GRENADE,
  weapon_shotgun: PickupType.WEAPON_SHOTGUN,
  bandage: PickupType.BANDAGE,
};

/** A weapon pickup that will become active in `landsInMs`. */
export interface WeaponIncomingAnnouncement {
  pickupId: string;
  type: PickupType;
  landsInMs: number;
}

function respawnTimeFor(type: PickupType): number {
  switch (type) {
    case PickupType.WEAPON_SHOTGUN:
      return PICKUP.WEAPON_RESPAWN_TIME;
    case PickupType.BANDAGE:
      return PICKUP.BANDAGE_RESPAWN_TIME;
    default:
      return PICKUP.RESPAWN_TIME;
  }
}

function isWeaponPickup(type: PickupType): boolean {
  return type === PickupType.WEAPON_SHOTGUN;
}

export class PickupManager {
  private pickups: Map<string, PickupState> = new Map();
  private nextId = 0;
  /**
   * Weapon pickups whose landing warning has already been emitted this
   * respawn cycle. Server-internal — deliberately NOT part of the shared
   * PickupState so it never leaks into snapshots.
   */
  private announced: Set<string> = new Set();

  /**
   * Create pickups from map data's pickupSpawns. The optional predicate
   * lets the caller veto whole pickup types (game modes: Gun Game spawns
   * nothing but bandages) — filtered spawns never exist, so they can
   * never activate or announce. The manager itself stays mode-agnostic.
   */
  initFromMap(
    mapData: MapData,
    isTypeEnabled: (type: PickupType) => boolean = () => true,
  ): void {
    this.pickups.clear();
    this.announced.clear();
    this.nextId = 0;

    for (const spawn of mapData.pickupSpawns) {
      const tileSize = mapData.tileSize;
      const type = SPAWN_TYPE_TO_PICKUP_TYPE[spawn.type] ?? PickupType.GUN_AMMO;
      if (!isTypeEnabled(type)) continue;
      const id = `pickup-${this.nextId++}`;
      // Weapon pickups start the match on their full respawn timer instead
      // of pre-placed, so the first drop gets the same "INCOMING" warning
      // as every later one (and nobody camps mid at the opening whistle).
      const weaponDelayed = isWeaponPickup(type);
      const pickup: PickupState = {
        id,
        type,
        position: {
          x: spawn.x * tileSize + tileSize / 2,
          y: spawn.y * tileSize + tileSize / 2,
        },
        isActive: !weaponDelayed,
        respawnTimer: weaponDelayed ? respawnTimeFor(type) : 0,
      };
      this.pickups.set(id, pickup);
    }
  }

  /**
   * Tick respawn timers; reactivate pickups whose timer expires. Returns
   * one-shot announcements for weapon pickups that are about to land
   * (respawnTimer crossed PICKUP.WEAPON_ANNOUNCE_LEAD this tick).
   */
  update(dt: number): WeaponIncomingAnnouncement[] {
    const announcements: WeaponIncomingAnnouncement[] = [];

    for (const pickup of this.pickups.values()) {
      if (pickup.isActive || pickup.respawnTimer <= 0) continue;

      pickup.respawnTimer -= dt;

      if (
        isWeaponPickup(pickup.type) &&
        pickup.respawnTimer > 0 &&
        pickup.respawnTimer <= PICKUP.WEAPON_ANNOUNCE_LEAD &&
        !this.announced.has(pickup.id)
      ) {
        this.announced.add(pickup.id);
        announcements.push({
          pickupId: pickup.id,
          type: pickup.type,
          landsInMs: pickup.respawnTimer * 1000,
        });
      }

      if (pickup.respawnTimer <= 0) {
        pickup.respawnTimer = 0;
        pickup.isActive = true;
        this.announced.delete(pickup.id);
      }
    }

    return announcements;
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
    pickup.respawnTimer = respawnTimeFor(pickup.type);
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
        if (player.grenades >= GRENADE.MAX_COUNT) return false;
        player.grenades = Math.min(
          player.grenades + GRENADE.PICKUP_AMOUNT,
          GRENADE.MAX_COUNT,
        );
        return true;
      }
      case PickupType.WEAPON_SHOTGUN: {
        // Auto-equip; picking up while already holding one refreshes shells
        // to full. Any in-progress rifle reload is cancelled (the rifle is
        // stowed as-is and reverts losslessly later).
        const shotgun = WEAPONS.shotgun;
        player.weaponId = 'shotgun';
        player.specialAmmo = shotgun.magazineSize;
        player.specialReserve = shotgun.pickupAmmo - shotgun.magazineSize;
        player.isReloading = false;
        player.reloadTimer = 0;
        return true;
      }
      case PickupType.BANDAGE: {
        if (player.isDead || player.health >= player.maxHealth) return false;
        player.health = Math.min(
          player.maxHealth,
          player.health + PICKUP.BANDAGE_HEAL,
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
