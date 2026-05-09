import type { Vec2 } from '@shared/types/common.js';
import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import type { CharacterId } from '@shared/config/game.js';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
export type ConnectionQuality = 'good' | 'fair' | 'poor';

export interface PredictionEntry {
  input: PlayerInput;
  predictedState: PlayerState;
}

export interface InterpolatedState {
  /**
   * Character chosen by this player. Sent by the server in every
   * SerializedPlayerState (gameState messages only ship from COUNTDOWN
   * onward, so it's always set). Carried through interpolation so the
   * scene can construct fully-typed SerializedPlayerStates for the
   * renderer without losing character identity.
   */
  characterId: CharacterId;
  position: Vec2;
  velocity: Vec2;
  aimAngle: number;
  health: number;
  maxHealth: number;
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
  abilityActiveSeconds: number;
  abilityCooldownSeconds: number;
}
