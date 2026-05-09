import { PlayerId, MatchId, Tick, Vec2 } from './common.js';
import { PlayerInput } from './player.js';
import { GrenadeState, BulletTrail } from './projectile.js';
import { PickupState } from './pickup.js';
import { MatchPhase, KillFeedEntry, MatchResult } from './game.js';

/**
 * Final-minute events: a single one is picked at random ~5s before
 * activation, broadcast on warning, then on activation it runs until
 * the match ends.
 */
export type FinalMinuteEvent =
  | 'super_speed'
  | 'grenades_only'
  | 'infinite_ammo'
  | 'low_health';

// === Client -> Server Messages ===

export type ClientMessage =
  | ClientInputMessage
  | ClientJoinMatchmakingMessage
  | ClientCancelMatchmakingMessage
  | ClientRematchRequestMessage
  | ClientReturnToLobbyMessage
  | ClientPingMessage;

export interface ClientInputMessage {
  type: 'client:input';
  input: PlayerInput;
}

export interface ClientJoinMatchmakingMessage {
  type: 'client:joinMatchmaking';
  nickname: string;
}

export interface ClientCancelMatchmakingMessage {
  type: 'client:cancelMatchmaking';
}

export interface ClientRematchRequestMessage {
  type: 'client:rematchRequest';
}

export interface ClientReturnToLobbyMessage {
  type: 'client:returnToLobby';
}

export interface ClientPingMessage {
  type: 'client:ping';
  clientTime: number;
}

// === Server -> Client Messages ===

export type ServerMessage =
  | ServerWelcomeMessage
  | ServerGameStateMessage
  | ServerMatchFoundMessage
  | ServerMatchCountdownMessage
  | ServerMatchStartMessage
  | ServerMatchEndMessage
  | ServerPlayerKilledMessage
  | ServerPlayerRespawnedMessage
  | ServerPickupCollectedMessage
  | ServerMatchmakingStatusMessage
  | ServerRematchStatusMessage
  | ServerOpponentDisconnectedMessage
  | ServerEventWarningMessage
  | ServerEventStartMessage
  | ServerPongMessage
  | ServerErrorMessage;

export interface ServerWelcomeMessage {
  type: 'server:welcome';
  playerId: PlayerId;
}

export interface ServerGameStateMessage {
  type: 'server:gameState';
  tick: Tick;
  phase: MatchPhase;
  /**
   * Remaining seconds in the countdown phase. Only meaningful when
   * phase === COUNTDOWN.
   */
  countdownTimer: number;
  /**
   * Authoritative remaining match seconds. Only meaningful when
   * phase === ACTIVE. The client re-anchors its local clock from this
   * every snapshot so any drift between the initial matchStart anchor
   * and the server's tick-driven matchTimer self-corrects within one
   * tick.
   */
  matchTimer: number;
  players: SerializedPlayerState[];
  grenades: GrenadeState[];
  bulletTrails: BulletTrail[];
  pickups: PickupState[];
  /**
   * The active final-minute event, or null if no event has activated yet.
   * Sent every snapshot so reconnecting / late-joining clients pick up the
   * modifier without an extra round-trip.
   */
  activeEvent: FinalMinuteEvent | null;
}

export interface SerializedPlayerState {
  id: PlayerId;
  position: Vec2;
  velocity: Vec2;
  aimAngle: number;
  health: number;
  /**
   * Per-player max HP. Normally PLAYER.MAX_HEALTH, but the low_health
   * final-minute event drops it to 1, and the client needs to know so the
   * health bar shows current/max correctly.
   */
  maxHealth: number;
  ammo: number;
  grenades: number;
  isReloading: boolean;
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

export interface ServerMatchFoundMessage {
  type: 'server:matchFound';
  matchId: MatchId;
  opponents: { id: PlayerId; nickname: string }[];
  mapName: string;
}

export interface ServerMatchCountdownMessage {
  type: 'server:matchCountdown';
  countdown: number;
}

export interface ServerMatchStartMessage {
  type: 'server:matchStart';
  /**
   * Match duration from now, in milliseconds. Sent once when the match
   * transitions from COUNTDOWN to ACTIVE. The client stores
   * matchEndsAtLocalMs = performance.now() + matchEndsInMs and
   * extrapolates the displayed timer at render rate from there — so no
   * per-tick clock broadcast is needed. Relative time sidesteps any
   * client/server wall-clock offset.
   */
  matchEndsInMs: number;
}

export interface ServerMatchEndMessage {
  type: 'server:matchEnd';
  result: MatchResult;
}

export interface ServerPlayerKilledMessage {
  type: 'server:playerKilled';
  entry: KillFeedEntry;
}

export interface ServerPlayerRespawnedMessage {
  type: 'server:playerRespawned';
  playerId: PlayerId;
  position: Vec2;
}

export interface ServerPickupCollectedMessage {
  type: 'server:pickupCollected';
  pickupId: string;
  playerId: PlayerId;
}

export interface ServerMatchmakingStatusMessage {
  type: 'server:matchmakingStatus';
  status: 'queued' | 'matched' | 'cancelled';
  queuePosition?: number;
  playersOnline?: number;
}

export interface ServerRematchStatusMessage {
  type: 'server:rematchStatus';
  opponentWantsRematch: boolean;
}

export interface ServerOpponentDisconnectedMessage {
  type: 'server:opponentDisconnected';
  playerId: PlayerId;
}

export interface ServerEventWarningMessage {
  type: 'server:eventWarning';
  event: FinalMinuteEvent;
  /** Ms from now until the event activates. */
  activatesInMs: number;
}

export interface ServerEventStartMessage {
  type: 'server:eventStart';
  event: FinalMinuteEvent;
}

export interface ServerPongMessage {
  type: 'server:pong';
  clientTime: number;
  serverTime: number;
}

export interface ServerErrorMessage {
  type: 'server:error';
  message: string;
}
