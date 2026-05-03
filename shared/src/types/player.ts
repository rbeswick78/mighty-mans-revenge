import { PlayerId, Vec2, Tick } from './common.js';

export interface PlayerState {
  id: PlayerId;
  position: Vec2;
  velocity: Vec2;
  aimAngle: number;
  health: number;
  maxHealth: number;
  ammo: number;
  isReloading: boolean;
  reloadTimer: number;
  /** Number of grenades the player can still throw. */
  grenades: number;
  isSprinting: boolean;
  stamina: number;
  isDead: boolean;
  respawnTimer: number;
  invulnerableTimer: number;
  lastProcessedInput: number;
  score: number;
  deaths: number;
  nickname: string;
}

export interface PlayerInput {
  sequenceNumber: number;
  moveX: number;
  moveY: number;
  aimAngle: number;
  /** Left mouse button is currently held (drawing the bullet aim line). */
  aimingGun: boolean;
  /** Left mouse button was released since the previous input — fire a burst. */
  firePressed: boolean;
  /**
   * Right mouse button is currently held with no live grenade (drawing the
   * grenade aim arc). False when a grenade is in flight (the button is now in
   * detonate mode).
   */
  aimingGrenade: boolean;
  /**
   * Right mouse button was released after an aim phase — throw the grenade.
   * Only meaningful when no grenade is currently in flight for this player.
   */
  throwPressed: boolean;
  /**
   * Right mouse button was pressed while a live grenade exists — detonate it.
   */
  detonatePressed: boolean;
  sprint: boolean;
  reload: boolean;
  tick: Tick;
}

export interface PlayerStats {
  kills: number;
  deaths: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
  grenadesThrown: number;
  grenadeKills: number;
  longestKillStreak: number;
}
