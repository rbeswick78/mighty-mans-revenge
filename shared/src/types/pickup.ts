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
  /** Finite-use melee power weapon: auto-equips four heavy swings. */
  WEAPON_BAT = 'weapon_bat',
  /** Heals PICKUP.BANDAGE_HEAL, capped at the player's max health. */
  BANDAGE = 'bandage',
  /** Grants a temporary combat shield, capped at PICKUP.ARMOR_MAX. */
  ARMOR = 'armor',
  /** Instantly readies a spent character ability when its active window is over. */
  OVERCHARGE = 'overcharge',
}

export interface PickupState {
  id: string;
  type: PickupType;
  position: Vec2;
  isActive: boolean;
  respawnTimer: number;
  /** Short-lived corpse weapon; omitted for authored and cache pickups. */
  isDroppedWeapon?: true;
  /** Short-lived supply created by the Scavenger Rush mutator. */
  isScavengerRushDrop?: true;
  /** Authoritative seconds before a temporary dynamic pickup disappears. */
  expiresInSeconds?: number;
}
