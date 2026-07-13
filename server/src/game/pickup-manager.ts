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
  weapon_pistol: PickupType.WEAPON_PISTOL,
  bandage: PickupType.BANDAGE,
};

/** A weapon pickup that will become active in `landsInMs`. */
export interface WeaponIncomingAnnouncement {
  pickupId: string;
  type: PickupType;
  landsInMs: number;
}

export interface OneShotPickupOptions {
  /** Exact surviving special ammo carried by a defeated fighter. */
  weaponAmmo?: number;
  /** Optional active lifetime; cache rewards intentionally never expire. */
  expiresInSeconds?: number;
  isDroppedWeapon?: true;
}

function respawnTimeFor(type: PickupType): number {
  switch (type) {
    case PickupType.WEAPON_SHOTGUN:
    case PickupType.WEAPON_PISTOL:
      return PICKUP.WEAPON_RESPAWN_TIME;
    case PickupType.BANDAGE:
      return PICKUP.BANDAGE_RESPAWN_TIME;
    default:
      return PICKUP.RESPAWN_TIME;
  }
}

/**
 * Power weapons that get the full drama treatment: start the match on
 * their respawn timer (no camping mid at the opening whistle) and emit the
 * "INCOMING" warning before every landing. Deliberately shotgun-only — the
 * pistol is a sidegrade that spawns active and respawns silently, so the
 * banner keeps its meaning.
 */
function isAnnouncedWeapon(type: PickupType): boolean {
  return type === PickupType.WEAPON_SHOTGUN;
}

export class PickupManager {
  private pickups: Map<string, PickupState> = new Map();
  private nextId = 0;
  /** Dynamic cache rewards disappear permanently after their first pickup. */
  private oneShotIds: Set<string> = new Set();
  /** Keep a collected one-shot for one snapshot so collection SFX know its type. */
  private pendingOneShotRemoval: Set<string> = new Set();
  /** Server-only ammo payload so corpse drops never refill themselves. */
  private oneShotWeaponAmmo: Map<string, number> = new Map();
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
    this.oneShotIds.clear();
    this.pendingOneShotRemoval.clear();
    this.oneShotWeaponAmmo.clear();
    this.nextId = 0;

    for (const spawn of mapData.pickupSpawns) {
      const tileSize = mapData.tileSize;
      const type = SPAWN_TYPE_TO_PICKUP_TYPE[spawn.type] ?? PickupType.GUN_AMMO;
      if (!isTypeEnabled(type)) continue;
      const id = `pickup-${this.nextId++}`;
      // Announced weapons (shotgun) start the match on their full respawn
      // timer instead of pre-placed, so the first drop gets the same
      // "INCOMING" warning as every later one (and nobody camps mid at the
      // opening whistle). The pistol sidegrade starts active like ammo.
      const weaponDelayed = isAnnouncedWeapon(type);
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

    for (const id of this.pendingOneShotRemoval) {
      this.removeOneShot(id);
    }
    this.pendingOneShotRemoval.clear();

    for (const [id, pickup] of this.pickups) {
      if (!this.oneShotIds.has(id) || pickup.expiresInSeconds === undefined)
        continue;
      pickup.expiresInSeconds -= dt;
      if (pickup.expiresInSeconds <= 0) this.removeOneShot(id);
    }

    for (const pickup of this.pickups.values()) {
      if (pickup.isActive || pickup.respawnTimer <= 0) continue;

      pickup.respawnTimer -= dt;

      if (
        isAnnouncedWeapon(pickup.type) &&
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

  /** Spawn an immediately active reward that never respawns after collection. */
  spawnOneShot(
    type: PickupType,
    position: Vec2,
    options: OneShotPickupOptions = {},
  ): PickupState {
    const id = `pickup-${this.nextId++}`;
    const pickup: PickupState = {
      id,
      type,
      position: { ...position },
      isActive: true,
      respawnTimer: 0,
      ...(options.isDroppedWeapon ? { isDroppedWeapon: true as const } : {}),
      ...(options.expiresInSeconds !== undefined
        ? { expiresInSeconds: options.expiresInSeconds }
        : {}),
    };
    this.pickups.set(id, pickup);
    this.oneShotIds.add(id);
    if (options.weaponAmmo !== undefined) {
      this.oneShotWeaponAmmo.set(
        id,
        Math.max(0, Math.floor(options.weaponAmmo)),
      );
    }
    return pickup;
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
    if (this.oneShotIds.has(pickupId)) {
      pickup.respawnTimer = 0;
      this.pendingOneShotRemoval.add(pickupId);
      return;
    }
    pickup.respawnTimer = respawnTimeFor(pickup.type);
  }

  /** Permanently retire pickup kinds superseded by a match-long rule. */
  removeTypes(types: readonly PickupType[]): void {
    const removed = new Set(types);
    for (const [id, pickup] of this.pickups) {
      if (!removed.has(pickup.type)) continue;
      this.pickups.delete(id);
      this.announced.delete(id);
      this.oneShotIds.delete(id);
      this.pendingOneShotRemoval.delete(id);
      this.oneShotWeaponAmmo.delete(id);
    }
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
        const totalAmmo =
          this.oneShotWeaponAmmo.get(pickup.id) ?? shotgun.pickupAmmo;
        player.weaponId = 'shotgun';
        player.specialAmmo = Math.min(totalAmmo, shotgun.magazineSize);
        player.specialReserve = Math.max(0, totalAmmo - shotgun.magazineSize);
        player.isReloading = false;
        player.reloadTimer = 0;
        return true;
      }
      case PickupType.WEAPON_PISTOL: {
        // Sidegrade twin of the shotgun case. Auto-equip means last-picked-
        // up wins: grabbing a pistol while holding a shotgun replaces it
        // (and vice versa); re-grabbing a pistol refreshes ammo to full.
        const pistol = WEAPONS.pistol;
        const totalAmmo =
          this.oneShotWeaponAmmo.get(pickup.id) ?? pistol.pickupAmmo;
        player.weaponId = 'pistol';
        player.specialAmmo = Math.min(totalAmmo, pistol.magazineSize);
        player.specialReserve = Math.max(0, totalAmmo - pistol.magazineSize);
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

  private removeOneShot(id: string): void {
    this.pickups.delete(id);
    this.oneShotIds.delete(id);
    this.pendingOneShotRemoval.delete(id);
    this.announced.delete(id);
    this.oneShotWeaponAmmo.delete(id);
  }
}
