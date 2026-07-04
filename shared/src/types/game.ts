import { PlayerId, MatchId, Tick } from './common.js';
import { PlayerState, PlayerStats } from './player.js';
import { GrenadeState, BulletTrail } from './projectile.js';
import { PickupState } from './pickup.js';
import type { AwardId } from '../config/game.js';

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

/**
 * Kill-attribution source. 'gun' is the rifle (legacy name kept for wire
 * compatibility); abilities and special weapons get their own entries so
 * stats/awards can distinguish them.
 */
export type KillWeapon = 'gun' | 'grenade' | 'fire' | 'shotgun';

export interface KillFeedEntry {
  killerId: PlayerId;
  victimId: PlayerId;
  weapon: KillWeapon;
  timestamp: number;
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

export interface MatchResult {
  matchId: MatchId;
  winnerId: PlayerId | null;
  playerStats: Map<PlayerId, PlayerStats>;
  duration: number;
  gameMode: GameModeType;
  /** Top awards in display order; empty when nobody qualified. */
  awards: MatchAward[];
  /**
   * All-time record for this pairing including the match that just ended.
   * Attached by the matchmaking manager from the persistent stats store;
   * null when persistence is unavailable or the match wasn't 1v1.
   */
  rivalry: RivalryRecord | null;
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
}
