import { PlayerId, MatchId, Tick, Vec2 } from './common.js';
import { PlayerInput } from './player.js';
import { AxeState, GrenadeState, BulletTrail, PunchEvent } from './projectile.js';
import { PickupState } from './pickup.js';
import type { ArenaWins } from './map.js';
import {
  MatchPhase,
  KillFeedEntry,
  MatchResult,
  GameModeType,
  KillConfirmedTagState,
  KillConfirmedCollection,
  MatchContractHudState,
  PracticeGauntletMatch,
  PracticeGauntletRouteId,
  CoreRunState,
  BountyHuntState,
  RumbleLeadState,
  RumbleCrownState,
  RumbleGrudge,
  WastelandWarpState,
  RadiationStormState,
  ScrapstormState,
} from './game.js';
import type {
  BotDifficulty,
  PracticeKind,
  CharacterId,
  WeaponId,
  MutatorId,
  TauntId,
} from '../config/game.js';

// === Client -> Server Messages ===

export type ClientMessage =
  | ClientInputMessage
  | ClientJoinMatchmakingMessage
  | ClientJoinRumbleMessage
  | ClientStartPracticeMessage
  | ClientCancelMatchmakingMessage
  | ClientRematchRequestMessage
  | ClientReturnToLobbyMessage
  | ClientCharacterHoverMessage
  | ClientCharacterLockMessage
  | ClientDraftPickMessage
  | ClientTauntMessage
  | ClientPingMessage;

export interface ClientInputMessage {
  type: 'client:input';
  input: PlayerInput;
}

export interface ClientJoinMatchmakingMessage {
  type: 'client:joinMatchmaking';
  nickname: string;
}

export interface ClientJoinRumbleMessage {
  type: 'client:joinRumble';
  nickname: string;
}

export interface ClientStartPracticeMessage {
  type: 'client:startPractice';
  nickname: string;
  difficulty: BotDifficulty;
  /** Optional for backward compatibility; old clients start ordinary sparring. */
  kind?: PracticeKind;
  /** Optional validated mode pin for Sparring or Scrap Pit; Gauntlet ignores it. */
  gameMode?: GameModeType;
  /** Optional featured Rusty fighter for Sparring or Scrap Pit; Gauntlet ignores it. */
  opponentCharacterId?: CharacterId;
  /** Optional mid-match chaos pin for Sparring or Scrap Pit; Gauntlet ignores it. */
  mutatorId?: MutatorId;
}

export interface ClientCancelMatchmakingMessage {
  type: 'client:cancelMatchmaking';
}

export interface ClientRematchRequestMessage {
  type: 'client:rematchRequest';
  /** Optional Gauntlet route choice; old clients take the first offer. */
  gauntletRouteId?: PracticeGauntletRouteId;
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

/** Which half of the pre-match draft a pick claims. */
export type DraftCategory = 'map' | 'mode';

/**
 * A pick in the pre-match map/mode draft. The first picker claims a
 * category implicitly by sending their first pick (map OR mode); the
 * second picker must send the remaining category. The server validates
 * turn + category availability + value against the offered options and
 * silently ignores anything invalid (stale clicks, wrong turn).
 */
export interface ClientDraftPickMessage {
  type: 'client:draftPick';
  category: DraftCategory;
  /** Map name (registry) or GameModeType id, depending on category. */
  value: string;
}

/** Request one of the server-owned battle cries during active play. */
export interface ClientTauntMessage {
  type: 'client:taunt';
  /** Untrusted at runtime; Match validates this against the shared registry. */
  tauntId: TauntId;
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
  | ServerDraftStateMessage
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
  | ServerPlayerLeftMessage
  | ServerEventWarningMessage
  | ServerEventStartMessage
  | ServerWeaponIncomingMessage
  | ServerTilesDestroyedMessage
  | ServerOvertimeStartMessage
  | ServerTauntMessage
  | ServerLeaderboardMessage
  | ServerDailyGauntletLeaderboardMessage
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
  /** Environmental detonations resolved this snapshot (legacy wire name). */
  barrelExplosions: Vec2[];
  /** This round's shared optional side objective and per-player progress. */
  contract: MatchContractHudState;
  /**
   * Punch swings resolved during this snapshot's ticks (usually empty).
   * Transient like bulletTrails — processed per message, never diffed.
   */
  punches: PunchEvent[];
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
  /** Active dog tags in Kill Confirmed; omitted in every other mode. */
  confirmedTags?: KillConfirmedTagState[];
  /** Confirm/deny interactions resolved during this server tick. */
  confirmedTagCollections?: KillConfirmedCollection[];
  /** Moving carry objective; present only in active Core Run regulation. */
  coreRun?: CoreRunState;
  /** Living marked fighter; present only in active Bounty Hunt regulation. */
  bountyHunt?: BountyHuntState;
  /** Persistent leader edge for matches that started with 3+ fighters. */
  rumbleLead?: RumbleLeadState;
  /** Reconnect-safe countdown and edge for the Wasteland Warp mutator. */
  wastelandWarp?: WastelandWarpState;
  /** Authoritative safe zone for the Radiation Storm mutator. */
  radiationStorm?: RadiationStormState;
  /** Authoritative warning for the next Scrapstorm impact. */
  scrapstorm?: ScrapstormState;
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
  /** Temporary Scrap Armor remaining; 0 when unshielded. */
  armor: number;
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
   * Temporary mutator speed boost — seconds remaining; 0 when inactive.
   * Broadcast so local prediction applies the same Second Wind or Blood Rush
   * multiplier as the server. See PlayerState.secondWindTimer.
   */
  secondWindTimer: number;
  /** Prediction-safe Gauntlet Spawn Rush timer; absent on older servers. */
  spawnRushTimer?: number;
}

export interface ServerMatchFoundMessage {
  type: 'server:matchFound';
  matchId: MatchId;
  opponents: { id: PlayerId; nickname: string }[];
  mapName: string;
  /** Mode this match will be played in — drives the lobby's "NEXT: X" line. */
  gameMode: GameModeType;
  /** Queue family; optional so older servers still interoperate. */
  matchKind?: 'duel' | 'rumble' | 'duos' | 'practice';
  /** Immutable server-authored sides for Crew Battle. */
  playerTeams?: Record<PlayerId, import('./game.js').TeamId>;
  /** Solo route that created this match; lets pre-match UI name the experience truthfully. */
  practiceKind?: PracticeKind;
  /** Reigning champion carried only into a direct Wasteland Rumble rematch. */
  rumbleCrown?: RumbleCrownState;
  /** Local fighter's personal target from the immediately previous Rumble. */
  rumbleGrudge?: RumbleGrudge;
  /** Local player's persisted real-match wins per fighter; absent on old servers. */
  characterWins?: Record<CharacterId, number>;
  /** Present only while traversing the three-fight solo Gauntlet. */
  gauntlet?: PracticeGauntletMatch;
  /** Accepted server-authored mid-match chaos promise for ordinary Sparring. */
  practiceMutatorId?: MutatorId;
}

/**
 * Full snapshot of the pre-match map/mode draft, broadcast every server
 * tick while the draft runs (same cadence contract as
 * characterSelectState — loss-tolerant, the next tick repairs a drop).
 * The draft precedes Match construction: `matchId` here is the id the
 * eventual `server:matchFound` will carry, so clients can correlate.
 * The first draftState a client receives is its cue to enter the draft
 * scene; `server:matchFound` (final map+mode) is its cue to leave.
 */
export type DraftFirstPickerReason = 'coin_toss' | 'revenge';

export interface DraftPlayer {
  id: PlayerId;
  nickname: string;
  /** Server-persisted real-match wins for every current arena. */
  arenaWins?: ArenaWins;
}

export interface ServerDraftStateMessage {
  type: 'server:draftState';
  matchId: MatchId;
  /** Two-role duel draft, or an all-fighter vote in 3-4 player Rumbles. */
  draftKind?: 'turn' | 'rally';
  /** Everyone in the pending match, draft roles included. */
  players: DraftPlayer[];
  /**
   * Winner of the server-side who-picks-first roll. The client plays
   * its spectacle to land on this player — the outcome is decided
   * before the animation starts. Compatibility-only during a rally.
   */
  firstPickerId: PlayerId;
  /** The distinct entrant who receives the remaining category; compatibility-only in a rally. */
  secondPickerId?: PlayerId;
  /** Coin toss for a fresh pairing; previous-round loser for a rematch. */
  firstPickerReason: DraftFirstPickerReason;
  /** Whose pick the server is waiting on; null once both picks are in. */
  currentPickerId: PlayerId | null;
  /** Category currently accepting votes in a Rumble rally. */
  rallyCategory?: DraftCategory | null;
  /** Accepted votes for the current rally phase; empty outside a rally. */
  rallyVotes?: Array<{ playerId: PlayerId; value: string }>;
  /** Chosen map name, or null while unpicked. */
  mapPick: string | null;
  /** Chosen mode, or null while unpicked. */
  modePick: GameModeType | null;
  /** Map names on offer (registry order). */
  mapOptions: string[];
  /** Modes on offer (rotation order). */
  modeOptions: GameModeType[];
  /**
   * Ms remaining before the server auto-picks for the current picker.
   * Drives the client countdown; 0 once the draft is complete.
   */
  pickDeadlineMs: number;
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
  /** Queue family for queue-specific lobby presentation. */
  matchKind?: 'duel' | 'rumble';
  /** Current Rumble party size while its join window is open. */
  groupSize?: number;
  maxGroupSize?: number;
  launchInMs?: number;
}

export interface ServerRematchStatusMessage {
  type: 'server:rematchStatus';
  opponentWantsRematch: boolean;
}

export interface ServerOpponentDisconnectedMessage {
  type: 'server:opponentDisconnected';
  playerId: PlayerId;
}

/** Non-fatal active-Rumble departure; the remaining fighters keep playing. */
export interface ServerPlayerLeftMessage {
  type: 'server:playerLeft';
  playerId: PlayerId;
  nickname: string;
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
 * One-shot notification that one or more solid tiles have been destroyed by
 * Bruce's fire breath or a grenade blast. Broadcast reliably because a drop
 * would leave the client rendering collision the server treats as passable.
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

/** Reliable accepted battle cry; clients render the shared copy by id. */
export interface ServerTauntMessage {
  type: 'server:taunt';
  playerId: PlayerId;
  tauntId: TauntId;
}

/** One row of the all-time lobby leaderboard (lifetime persisted stats). */
export interface LeaderboardEntry {
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  matches: number;
  /** Lifetime number of optional match contracts completed. */
  contractsCompleted: number;
}

/**
 * All-time top players by lifetime wins (LEADERBOARD.SIZE entries, ranked
 * wins desc → kills desc → nickname asc). Sent reliably to a connection
 * when it opens and rebroadcast to every connection after each match's
 * stats are recorded, so an idle lobby stays current. Empty entries =
 * nothing persisted yet (client hides the panel).
 */
export interface ServerLeaderboardMessage {
  type: 'server:leaderboard';
  entries: LeaderboardEntry[];
}

/** One server-authored completed-clear score on a UTC Daily Run board. */
export interface DailyGauntletLeaderboardEntry {
  nickname: string;
  score: number;
}

/**
 * Current UTC Daily Run standings. Sent reliably on connect and rebroadcast
 * after a clear improves or joins the board. The challenge key comes from
 * the server clock; clients never select which board receives a score.
 */
export interface ServerDailyGauntletLeaderboardMessage {
  type: 'server:dailyGauntletLeaderboard';
  challengeKey: string;
  entries: DailyGauntletLeaderboardEntry[];
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
