import { PlayerId, MatchId, Tick } from './common.js';
import { PlayerState, PlayerStats } from './player.js';
import { GrenadeState, BulletTrail } from './projectile.js';
import { PickupState } from './pickup.js';

export enum MatchPhase {
  WAITING = 'waiting',
  /**
   * Both players are connected and on the character-select screen. The
   * server broadcasts `server:characterSelectState` (not `server:gameState`)
   * during this phase. Transitions to COUNTDOWN once both players are
   * locked in or the select timer expires.
   */
  CHARACTER_SELECT = 'character_select',
  COUNTDOWN = 'countdown',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export enum GameModeType {
  DEATHMATCH = 'deathmatch',
}

export interface GameState {
  matchId: MatchId;
  tick: Tick;
  phase: MatchPhase;
  countdownTimer: number;
  matchTimer: number;
  players: Map<PlayerId, PlayerState>;
  grenades: GrenadeState[];
  bulletTrails: BulletTrail[];
  pickups: PickupState[];
  killFeed: KillFeedEntry[];
}

export interface KillFeedEntry {
  killerId: PlayerId;
  victimId: PlayerId;
  weapon: 'gun' | 'grenade' | 'fire';
  timestamp: number;
}

export interface MatchResult {
  matchId: MatchId;
  winnerId: PlayerId | null;
  playerStats: Map<PlayerId, PlayerStats>;
  duration: number;
  gameMode: GameModeType;
}
