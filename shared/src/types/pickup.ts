import { Vec2 } from './common.js';

export enum PickupType {
  GUN_AMMO = 'gun_ammo',
  GRENADE = 'grenade',
}

export interface PickupState {
  id: string;
  type: PickupType;
  position: Vec2;
  isActive: boolean;
  respawnTimer: number;
}
