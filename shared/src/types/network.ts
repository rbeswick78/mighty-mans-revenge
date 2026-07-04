import { PlayerId, MatchId, Tick, Vec2 } from './common.js';
import { PlayerInput } from './player.js';
import { AxeState, GrenadeState, BulletTrail } from './projectile.js';
import { PickupState } from './pickup.js';
import { MatchPhase, KillFeedEntry, MatchResult, GameModeType } from './game.js';
import type { CharacterId, WeaponId, MutatorId } from '../config/game.js';

// === Client -> Server Messages ===

export type ClientMessage =
  | ClientInputMessage
  | ClientJoinMatchmakingMessage
  | ClientCancelMatchmakingMessage
  | ClientRematchRequestMessage
  | ClientReturnToLobbyMessage
  | ClientCharacterHoverMessage
  | ClientCharacterLockMessage
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

export interface ClientCharacterHoverMessage {
  type: 'client:characterHover';
  characterId: CharacterId;
}

export interface ClientCharacterLockMessage {
  type: 'client:characterLock';
  characterId: CharacterId;
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
  | ServerCharacterSelectStateMessage
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
  | ServerWeaponIncomingMessage
  | ServerTilesDestroyedMessage
  | ServerOvertimeStartMessage
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
  /** Jack's thrown axes in flight (usually empty — one per Jack per 12s). */
  axes: AxeState[];
  bulletTrails: BulletTrail[];
  pickups: PickupState[];
  /**
   * All currently active mutators, in activation order (empty until the
   * first activation). The mid-match mutator and the final-minute event
   * both run to match end, so late in a match this holds two entries.
   * Sent every snapshot so reconnecting / late-joining clients pick up
   * the modifiers without an extra round-trip.
   */
  activeMutators: MutatorId[];
  /**
   * True while the match is in sudden-death overtime. matchTimer counts
   * down OVERTIME.DURATION during it. Sent every snapshot (like
   * activeMutators) so a client that missed the one-shot
   * server:overtimeStart still renders the right clock and HUD state.
   */
  isOvertime: boolean;
  /**
   * King of the Hill state — present only in KOTH matches, and omitted
   * during overtime (the hill is retired for sudden death). Hill points
   * ride in each player's `score` field like DM kills do.
   */
  koth?: KothHudState;
}

/** Per-snapshot King of the Hill HUD state. Tile coords, not pixels. */
export interface KothHudState {
  /** Top-left tile of the live KOTH.HILL_SIZE_TILES² hill zone. */
  hill: { x: number; y: number };
  /**
   * Top-left tile of the NEXT hill — non-null only during the last
   * KOTH.HILL_MOVE_WARNING seconds before relocation (warning marker).
   */
  nextHill: { x: number; y: number } | null;
  /** Sole living occupant currently accruing points; null if none. */
  occupantId: PlayerId | null;
  /** True when 2+ living players stand in the zone (nobody scores). */
  contested: boolean;
  /**
   * Fractional progress toward the occupant's next point, 0..1. Resets
   * whenever sole occupancy breaks. Drives the capture progress bar.
   */
  captureFraction: number;
}

export interface SerializedPlayerState {
  id: PlayerId;
  /**
   * The character this player has chosen. Always non-null in
   * `server:gameState` messages (those only ship from COUNTDOWN onward,
   * by which point both players are locked).
   */
  characterId: CharacterId;
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
  /** Equipped weapon; drives the held-overlay sprite and HUD ammo panel. */
  weaponId: WeaponId;
  /** Special weapon's magazine (shells loaded). 0 while on the rifle. */
  specialAmmo: number;
  /** Special weapon's reserve shells. 0 while on the rifle. */
  specialReserve: number;
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
  /**
   * Active ability state, broadcast so the client can render the HUD
   * cooldown indicator and ability VFX (Bruce's fire cone, Mighty Man's
   * x-ray tint and silhouettes). See ABILITY in shared/config/game.ts.
   */
  abilityActiveSeconds: number;
  abilityCooldownSeconds: number;
  /**
   * Frost Wizard's freeze status — seconds remaining; 0 when not frozen.
   * Broadcast so clients can render the cyan tint + crystal VFX on the
   * frozen target and so the local frozen player can mirror the action
   * lockout in client prediction. See PlayerState.frozenTimer.
   */
  frozenTimer: number;
  /**
   * second_wind respawn boost — seconds remaining; 0 when not boosted.
   * Broadcast so the local player's prediction applies the same speed
   * multiplier the server does. See PlayerState.secondWindTimer.
   */
  secondWindTimer: number;
}

export interface ServerMatchFoundMessage {
  type: 'server:matchFound';
  matchId: MatchId;
  opponents: { id: PlayerId; nickname: string }[];
  mapName: string;
  /** Mode this match will be played in — drives the lobby's "NEXT: X" line. */
  gameMode: GameModeType;
}

/**
 * Per-player state during the CHARACTER_SELECT phase. Sent every server
 * tick (or on change) until both players are locked. The presence of a
 * non-null `lockedCharacterId` for a player means that player has
 * committed; once both players have committed, the next message stream
 * the client receives is `server:matchCountdown` followed by
 * `server:gameState`.
 *
 * Lock-to-one rule (v1): no two players can have the same
 * `lockedCharacterId`. The server snaps the second player's hover off
 * a taken character automatically.
 */
export interface ServerCharacterSelectStateMessage {
  type: 'server:characterSelectState';
  selections: Array<{
    playerId: PlayerId;
    nickname: string;
    hoveredCharacterId: CharacterId | null;
    lockedCharacterId: CharacterId | null;
  }>;
  /**
   * Milliseconds remaining on the auto-lock timer. Counts down from
   * MATCH.CHARACTER_SELECT_TIMEOUT_SEC * 1000. Anyone unlocked at zero
   * is auto-locked onto their current hover and the match begins.
   */
  timeRemainingMs: number;
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
  event: MutatorId;
  /** Ms from now until the mutator activates. */
  activatesInMs: number;
  /**
   * True for the guaranteed final-minute slot, false for the random
   * mid-match slot. Drives the banner headline ("FINAL MINUTE INCOMING"
   * vs "MUTATOR INCOMING").
   */
  isFinalMinute: boolean;
}

export interface ServerEventStartMessage {
  type: 'server:eventStart';
  event: MutatorId;
  /** See ServerEventWarningMessage.isFinalMinute. */
  isFinalMinute: boolean;
}

/**
 * One-shot pre-announcement that a special-weapon pickup is about to
 * (re)spawn — "SHOTGUN INCOMING". Fired PICKUP.WEAPON_ANNOUNCE_LEAD
 * seconds before the pickup activates. Drives a HUD banner + sound.
 */
export interface ServerWeaponIncomingMessage {
  type: 'server:weaponIncoming';
  weaponId: WeaponId;
  /** Ms from now until the pickup lands (becomes collectible). */
  landsInMs: number;
}

/**
 * One-shot notification that one or more wall tiles have been destroyed
 * (currently only by Bruce's fire-breath ability). Broadcast reliably
 * because a drop would leave the client rendering a wall the server
 * already treats as passable.
 */
export interface ServerTilesDestroyedMessage {
  type: 'server:tilesDestroyed';
  tiles: Array<{ col: number; row: number }>;
}

/**
 * One-shot notification that the match just entered sudden-death overtime:
 * everyone respawned fresh with a single life, first kill wins, true draw
 * if the overtime clock expires. Drives the OVERTIME banner + sting and
 * re-anchors the client match clock (like server:matchStart). Reliable —
 * it's a single dramatic beat and the clock reset depends on it.
 */
export interface ServerOvertimeStartMessage {
  type: 'server:overtimeStart';
  /** Overtime duration from now, in milliseconds. */
  overtimeEndsInMs: number;
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
