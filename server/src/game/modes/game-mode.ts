import type { PlayerId, PlayerState, MatchResult, MapData, KothHudState } from '@shared/game';
import type { StatsTracker } from '../stats-tracker.js';

/** Context interface so game modes can read match state without tight coupling. */
export interface MatchContext {
  matchId: string;
  matchTimer: number;
  players: Map<PlayerId, PlayerState>;
  stats: StatsTracker;
  /**
   * True while the match is in sudden-death overtime. Modes must stop
   * accruing scoreboard points during it — otherwise an overtime timeout
   * could produce a winner instead of the promised true draw.
   */
  isOvertime: boolean;
  getKillTarget(): number;
  getTimeLimit(): number;
  /** The map this match is played on (modes read kothHills etc. from it). */
  getMapData(): MapData;
  /**
   * Seconds of play so far, overtime included — matchTimer alone can't
   * express this because entering overtime resets it to OVERTIME.DURATION.
   */
  getElapsedSeconds(): number;
}

export interface GameMode {
  onStart(match: MatchContext): void;
  onTick(match: MatchContext, dt: number): void;
  onKill(match: MatchContext, killerId: PlayerId, victimId: PlayerId): void;
  isMatchOver(match: MatchContext): boolean;
  getResults(match: MatchContext): MatchResult;
  /**
   * Scoreboard winner right now; null means a genuine tie. Match calls
   * this when isMatchOver flips true — a null answer (with 2+ players)
   * sends the match into sudden-death overtime instead of ending it.
   */
  determineWinner(match: MatchContext): PlayerId | null;
  /**
   * Per-tick King of the Hill HUD state, merged into gameState broadcasts.
   * Only modes with a hill implement it.
   */
  getKothState?(match: MatchContext): KothHudState;
}
