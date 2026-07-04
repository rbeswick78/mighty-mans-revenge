import { Vec2 } from './common.js';

export enum PickupType {
  GUN_AMMO = 'gun_ammo',
  GRENADE = 'grenade',
  /** Special-weapon pickup: auto-equips the shotgun on touch. */
  WEAPON_SHOTGUN = 'weapon_shotgun',
  /** Heals PICKUP.BANDAGE_HEAL, capped at the player's max health. */
  BANDAGE = 'bandage',
}

export interface PickupState {
  id: string;
  type: PickupType;
  position: Vec2;
  isActive: boolean;
  respawnTimer: number;
}
