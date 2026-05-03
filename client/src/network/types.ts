import type { Vec2 } from '@shared/types/common.js';
import type { PlayerInput, PlayerState } from '@shared/types/player.js';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
export type ConnectionQuality = 'good' | 'fair' | 'poor';

export interface PredictionEntry {
  input: PlayerInput;
  predictedState: PlayerState;
}

export interface InterpolatedState {
  position: Vec2;
  velocity: Vec2;
  aimAngle: number;
  health: number;
  ammo: number;
  grenades: number;
  isSprinting: boolean;
  isDead: boolean;
  isReloading: boolean;
  stamina: number;
  respawnTimer: number;
  invulnerableTimer: number;
  score: number;
  deaths: number;
  nickname: string;
}
