import { PlayerId, Vec2, Tick } from './common.js';

export interface PlayerState {
  id: PlayerId;
  position: Vec2;
  velocity: Vec2;
  aimAngle: number;
  health: number;
  maxHealth: number;
  ammo: number;
  grenades: number;
  isReloading: boolean;
  reloadTimer: number;
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
  shooting: boolean;
  throwGrenade: boolean;
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
