import { PlayerId, MatchId, Tick, Vec2 } from './common.js';
import { PlayerState, PlayerStats } from './player.js';
import { AxeState, GrenadeState, BulletTrail, PunchEvent } from './projectile.js';
import { PickupState } from './pickup.js';
import type {
  AwardId,
  BotDifficulty,
  CharacterId,
  GauntletBoonId,
  MutatorId,
} from '../config/game.js';

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
  KOTH = 'koth',
  GUN_GAME = 'gun_game',
  LAST_STAND = 'last_stand',
  KILL_CONFIRMED = 'kill_confirmed',
  ONE_IN_THE_CHAMBER = 'one_in_the_chamber',
  CORE_RUN = 'core_run',
  BOUNTY_HUNT = 'bounty_hunt',
}

/** Persistent moving target for Bounty Hunt snapshots and bot routing. */
export interface BountyHuntState {
  /** Living fighter currently worth the bounty bonus; null during overtime. */
  targetId: PlayerId | null;
}

/**
 * Reconnect-safe leader edge for matches that began with a Rumble-sized
 * field. The server owns score interpretation; clients only present changes.
 */
export interface RumbleLeadState {
  /** Every connected fighter currently tied for the highest mode score. */
  leaderIds: PlayerId[];
  /** Increments only when the complete leader set changes. */
  sequence: number;
}

/** Persistent moving-objective state for Core Run snapshots. */
export interface CoreRunState {
  /** Current authoritative world position; follows the carrier while held. */
  position: Vec2;
  /** Living fighter holding the core, or null while it is loose. */
  carrierId: PlayerId | null;
  /** Seconds until an abandoned dropped core returns home; null at home/held. */
  returnInSeconds: number | null;
  /** Fractional progress toward the carrier's next whole score point. */
  carryFraction: number;
}

/** Persistent timing edge for the Wasteland Warp mutator. */
export interface WastelandWarpState {
  secondsUntilSwap: number;
  /** Increments only when at least two living fighters actually rotate. */
  sequence: number;
}

/** Reconnect-safe shrinking safe zone for the Radiation Storm mutator. */
export interface RadiationStormState {
  center: Vec2;
  radius: number;
  shrinkSecondsRemaining: number;
}

/** Reconnect-safe warning for the next localized Scrapstorm strike. */
export interface ScrapstormState {
  /** Captured world position; null during the quiet interval between strikes. */
  targetPosition: Vec2 | null;
  /** Fighter whose position seeded the warning; the blast itself hits everyone. */
  targetPlayerId: PlayerId | null;
  /** Authoritative warning countdown; null while no warning is painted. */
  secondsUntilImpact: number | null;
  radius: number;
}

/** A contested token dropped by a death in Kill Confirmed. */
export interface KillConfirmedTagState {
  id: string;
  ownerId: PlayerId;
  position: { x: number; y: number };
  expiresInSeconds: number;
}

/** One authoritative confirm/deny interaction, transient for one snapshot. */
export interface KillConfirmedCollection {
  tagId: string;
  collectorId: PlayerId;
  ownerId: PlayerId;
  confirmed: boolean;
}

export interface GameState {
  matchId: MatchId;
  tick: Tick;
  phase: MatchPhase;
  countdownTimer: number;
  matchTimer: number;
  players: Map<PlayerId, PlayerState>;
  grenades: GrenadeState[];
  axes: AxeState[];
  bulletTrails: BulletTrail[];
  barrelExplosions: Vec2[];
  punches: PunchEvent[];
  pickups: PickupState[];
  killFeed: KillFeedEntry[];
}

/**
 * Kill-attribution source. 'gun' is the rifle (legacy name kept for wire
 * compatibility); abilities and special weapons get their own entries so
 * stats/awards can distinguish them.
 */
export type KillWeapon =
  | 'gun'
  | 'grenade'
  | 'fire'
  | 'shotgun'
  | 'axe'
  | 'pistol'
  | 'punch'
  | 'bat'
  | 'barrel';

export interface KillFeedEntry {
  killerId: PlayerId;
  victimId: PlayerId;
  weapon: KillWeapon;
  timestamp: number;
  /** Consecutive kills held by the killer after this event. */
  killerStreak?: number;
  /** Consecutive kills the victim held immediately before this death. */
  victimStreakEnded?: number;
  /** True when the killer just answered the opponent who last killed them. */
  isRevenge?: boolean;
  /** True for the match's first non-suicide kill. */
  isFirstBlood?: boolean;
  /**
   * Consecutive non-suicide kills inside COMBAT_MEDALS' rolling time window.
   * One is shipped too, keeping the event self-contained for old/new clients.
   */
  rapidKillCount?: number;
  /** True when the killer was already dead as this victim was eliminated. */
  isPosthumous?: boolean;
  /** Pre-heal HP remaining when a living killer earned a critical-health kill. */
  clutchHealth?: number;
}

/**
 * A single end-of-match award, computed server-side from final
 * StatsTracker data. The results screen shows these in array order (the
 * server has already applied priority + the DISPLAY_COUNT cap).
 */
export interface MatchAward {
  id: AwardId;
  playerId: PlayerId;
  /** Winner's nickname at match time, so the client needs no id lookup. */
  nickname: string;
  /** Pre-formatted stat line that earned it, e.g. "87% ACCURACY". */
  detail: string;
}

/**
 * Lifetime head-to-head record for a 1v1 pairing, from the server's
 * persistent stats file. A/B are ordered by lowercased nickname
 * (alphabetical), matching the persistence key "a|b".
 */
export interface RivalryRecord {
  nicknameA: string;
  nicknameB: string;
  winsA: number;
  winsB: number;
  draws: number;
}

/** One player's score in the current rematch streak's first-to-N set. */
export interface RivalrySetPlayer {
  playerId: PlayerId;
  nickname: string;
  wins: number;
}

/**
 * Short-lived set score for consecutive rematches. Unlike `RivalryRecord`,
 * this resets when the pairing leaves results or starts again after a clinch.
 */
export interface RivalrySetResult {
  winsToClinch: number;
  roundsPlayed: number;
  players: RivalrySetPlayer[];
  championId: PlayerId | null;
}

/**
 * Short-lived champion of a connected Wasteland Rumble rematch chain.
 * This is intentionally session-only: returning to the lobby clears it.
 */
export interface RumbleCrownState {
  holderId: PlayerId;
  holderNickname: string;
  /** Consecutive decisive rounds won while holding the crown. */
  wins: number;
}

export type RumbleCrownOutcome = 'claimed' | 'defended' | 'stolen' | 'held' | 'unclaimed';

/** Server-authored crown story attached to a completed Rumble result. */
export interface RumbleCrownResult {
  crown: RumbleCrownState | null;
  outcome: RumbleCrownOutcome;
  previousHolderId: PlayerId | null;
  previousHolderNickname: string | null;
}

export type MatchContractId =
  | 'hot_shot'
  | 'heavy_hitter'
  | 'on_a_roll'
  | 'road_warrior'
  | 'powder_keg'
  | 'power_trip'
  | 'hill_dweller'
  | 'tag_hunter'
  | 'core_runner';

export type MatchContractMetric =
  | 'hits'
  | 'damage'
  | 'streak'
  | 'distance_tiles'
  | 'barrels'
  | 'overcharges'
  | 'hill_seconds'
  | 'confirmed_tags'
  | 'core_seconds';

export interface MatchContractDefinition {
  id: MatchContractId;
  title: string;
  objective: string;
  metric: MatchContractMetric;
  target: number;
}

export type CareerRankId =
  | 'drifter'
  | 'scavenger'
  | 'road_dog'
  | 'marauder'
  | 'wasteland_veteran'
  | 'legend';

/** Cosmetic reputation title derived entirely from completed contracts. */
export interface CareerRankDefinition {
  id: CareerRankId;
  title: string;
  /** Three-character lobby leaderboard badge. */
  badge: string;
  minContracts: number;
}

export interface CareerRankProgress {
  completed: number;
  current: CareerRankDefinition;
  next: CareerRankDefinition | null;
  remaining: number;
}

export interface MatchContractPlayerProgress {
  playerId: PlayerId;
  progress: number;
  completed: boolean;
}

/** Live authoritative side-objective state carried by every snapshot. */
export interface MatchContractHudState {
  id: MatchContractId;
  title: string;
  objective: string;
  target: number;
  players: MatchContractPlayerProgress[];
}

/** End-of-match contract state, enriched with persisted career totals. */
export interface MatchContractResult extends MatchContractHudState {
  careerCompletions: Record<PlayerId, number>;
}

/** Persisted win-streak state before and after one completed real match. */
export interface WinStreakResult {
  current: number;
  best: number;
  previous: number;
  previousBest: number;
}

/** One server-locked score objective for a Daily Run attempt. */
export type DailyGauntletChaseTarget =
  | { kind: 'set_pace' }
  | { kind: 'claim_slot'; projectedRank: number }
  | { kind: 'break_in'; targetNickname: string; targetScore: number }
  | { kind: 'catch_rival'; targetNickname: string; targetScore: number }
  | { kind: 'defend_lead'; targetScore: number };

export interface PracticeGauntletMatch {
  stage: number;
  totalStages: number;
  difficulty: BotDifficulty;
  /** Authoritative score banked before this stage begins. */
  runScore: number;
  /** Rusty's server-pinned fighter for this stage; absent on older payloads. */
  opponentCharacterId?: CharacterId;
  /** Server-pinned mid-match chaos event selected with this stage. */
  forecastMutatorId?: MutatorId;
  /** UTC challenge date for a shared Daily Run; absent for ordinary Gauntlet. */
  challengeKey?: string;
  /** Server-authored board objective locked for this Daily Run attempt. */
  dailyChase?: DailyGauntletChaseTarget;
  /** Server-owned run build earned from prior route drafts. */
  boonIds?: GauntletBoonId[];
}

export type PracticeGauntletRouteId = 'route_a' | 'route_b';

/** One server-authored next-fight choice after a cleared Gauntlet stage. */
export interface PracticeGauntletRoute {
  id: PracticeGauntletRouteId;
  mapName: string;
  gameMode: GameModeType;
  /** The distinct Rusty matchup this branch will launch. */
  opponentCharacterId?: CharacterId;
  /** The compatible mid-match chaos event promised by this branch. */
  forecastMutatorId?: MutatorId;
  /** Run-long reward acquired when this branch is locked. */
  boonId?: GauntletBoonId;
}

export interface PracticeGauntletResult extends PracticeGauntletMatch {
  outcome: 'advanced' | 'failed' | 'cleared';
  /** Points banked by this stage; zero unless the human won. */
  stageScore: number;
  /** Contract portion of stageScore. */
  contractBonus: number;
  /** No-overtime portion of stageScore. */
  regulationBonus: number;
  /** Zero-death portion of stageScore. */
  flawlessBonus: number;
  /** Regulation time-remaining portion of stageScore. */
  paceBonus: number;
  /** Forecast danger payout; absent on results from older servers. */
  chaosBountyBonus?: number;
  /** Combat-highlight payout; absent on results from older servers. */
  styleBonus?: number;
  /** Stage launched by the results-screen action (advance or retry). */
  nextStage: number;
  nextDifficulty: BotDifficulty;
  /** Present only after advancement; missing clients take the first route. */
  routeOptions?: PracticeGauntletRoute[];
  /** Server-owned placement after a completed Daily Run clear. */
  dailyRank?: number;
  /** Best server-persisted score for this callsign on the challenge date. */
  dailyBestScore?: number;
}

export interface MatchResult {
  matchId: MatchId;
  winnerId: PlayerId | null;
  playerStats: Map<PlayerId, PlayerStats>;
  duration: number;
  gameMode: GameModeType;
  /** Queue family that created the match; absent on results from older servers. */
  matchKind?: 'duel' | 'rumble' | 'practice';
  /** Final authoritative mode score for standings (especially 3-4 player Rumble). */
  scores?: Record<PlayerId, number>;
  /** Stable result labels without relying on the local client's opponent cache. */
  playerNicknames?: Record<PlayerId, string>;
  /** Fighters who left an active Rumble before it ended. */
  departedPlayerIds?: PlayerId[];
  /** Top awards in display order; empty when nobody qualified. */
  awards: MatchAward[];
  /**
   * All-time record for this pairing including the match that just ended.
   * Attached by the matchmaking manager from the persistent stats store;
   * null when persistence is unavailable or the match wasn't 1v1.
   */
  rivalry: RivalryRecord | null;
  /** Immediate first-to-N score for this consecutive rematch set. */
  rivalrySet: RivalrySetResult | null;
  /** Ephemeral champion story for connected Wasteland Rumble rematches. */
  rumbleCrown?: RumbleCrownResult;
  /** True for a solo authoritative match against a server-controlled bot. */
  isPractice: boolean;
  /**
   * Map the rematch (if accepted) will be played on — drives the results
   * screen's "NEXT MAP: X" line. Like rivalry, attached by the matchmaking
   * manager (game modes know nothing about rotation); null until then.
   */
  nextMapName: string | null;
  /**
   * Mode the rematch (if accepted) will be played in — same contract as
   * nextMapName: pinned by the matchmaking manager at match end so the
   * results screen's promise always matches what the rematch starts.
   */
  nextGameMode: GameModeType | null;
  /**
   * True when the match went to sudden-death overtime (regardless of
   * whether it produced a winner or a double-timeout draw). Drives the
   * results screen's overtime callout.
   */
  wentToOvertime: boolean;
  /** Optional side objective for this round; absent on older payloads. */
  contract?: MatchContractResult;
  /** Lifetime streak snapshots; absent for Practice and older payloads. */
  winStreaks?: Record<PlayerId, WinStreakResult>;
  /** Per-player battlefield records after this real match; absent for Practice/old servers. */
  arenaMastery?: Record<PlayerId, ArenaMasteryResult>;
  /** Authoritative solo-run progress; absent for ordinary Practice/PvP. */
  gauntlet?: PracticeGauntletResult;
}

export interface ArenaMasteryResult {
  mapName: string;
  previousWins: number;
  wins: number;
}
