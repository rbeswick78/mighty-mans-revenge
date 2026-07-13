import { Vec2 } from './common.js';

export enum PickupType {
  GUN_AMMO = 'gun_ammo',
  GRENADE = 'grenade',
  /** Special-weapon pickup: auto-equips the shotgun on touch. */
  WEAPON_SHOTGUN = 'weapon_shotgun',
  /**
   * Special-weapon pickup: auto-equips the pistol on touch. A sidegrade,
   * not a power weapon — spawns active at match start and is never
   * pre-announced (the INCOMING banner stays shotgun-only).
   */
  WEAPON_PISTOL = 'weapon_pistol',
  /** Heals PICKUP.BANDAGE_HEAL, capped at the player's max health. */
  BANDAGE = 'bandage',
}

export interface PickupState {
  id: string;
  type: PickupType;
  position: Vec2;
  isActive: boolean;
  respawnTimer: number;
  /** Short-lived corpse weapon; omitted for authored and cache pickups. */
  isDroppedWeapon?: true;
  /** Authoritative seconds before a dropped weapon disappears unclaimed. */
  expiresInSeconds?: number;
}
