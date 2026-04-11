import type { PlayerId, PlayerState, MatchResult } from '@shared/game';
import type { StatsTracker } from '../stats-tracker.js';

/** Context interface so game modes can read match state without tight coupling. */
export interface MatchContext {
  matchId: string;
  matchTimer: number;
  players: Map<PlayerId, PlayerState>;
  stats: StatsTracker;
  getKillTarget(): number;
  getTimeLimit(): number;
}

export interface GameMode {
  onStart(match: MatchContext): void;
  onTick(match: MatchContext, dt: number): void;
  onKill(match: MatchContext, killerId: PlayerId, victimId: PlayerId): void;
  isMatchOver(match: MatchContext): boolean;
  getResults(match: MatchContext): MatchResult;
}
