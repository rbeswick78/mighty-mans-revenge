import { BOUNTY_HUNT, GameModeType } from '@shared/game';
import type {
  BountyHuntState,
  KillWeapon,
  MatchResult,
  PlayerId,
} from '@shared/game';
import { computeAwards } from '../awards.js';
import type { GameMode, MatchContext } from './game-mode.js';

/**
 * Bounty Hunt keeps one living fighter visibly marked. Hunting the mark is
 * worth three points, fighting back as the mark is worth two, and every other
 * kill is worth one. A bounty kill transfers the mark to its living killer.
 */
export class BountyHuntMode implements GameMode {
  private targetId: PlayerId | null = null;
  private lastTargetId: PlayerId | null = null;

  onStart(match: MatchContext): void {
    for (const player of match.players.values()) player.score = 0;
    const candidates = this.sortedLivingIds(match);
    if (candidates.length === 0) {
      this.setTarget(null);
      return;
    }
    const openingIndex = this.stableMatchIndex(match.matchId, candidates.length);
    this.setTarget(candidates[openingIndex]);
  }

  onTick(match: MatchContext, _dt: number): void {
    if (match.isOvertime) {
      this.targetId = null;
      return;
    }
    const target = this.targetId === null ? null : match.players.get(this.targetId);
    if (target && !target.isDead) return;
    this.setTarget(this.nextLivingId(match));
  }

  onKill(
    match: MatchContext,
    killerId: PlayerId,
    victimId: PlayerId,
    _weapon: KillWeapon,
  ): void {
    if (match.isOvertime) return;
    if (killerId === victimId) {
      if (victimId === this.targetId) this.targetId = null;
      return;
    }

    const killer = match.players.get(killerId);
    if (!killer) return;
    if (victimId === this.targetId) {
      killer.score += BOUNTY_HUNT.BOUNTY_KILL_POINTS;
      this.setTarget(killer.isDead ? null : killerId);
    } else if (killerId === this.targetId) {
      killer.score += BOUNTY_HUNT.TARGET_RETALIATION_POINTS;
    } else {
      killer.score += BOUNTY_HUNT.ORDINARY_KILL_POINTS;
    }
  }

  isMatchOver(match: MatchContext): boolean {
    return (
      match.matchTimer <= 0 ||
      [...match.players.values()].some(
        (player) => player.score >= BOUNTY_HUNT.SCORE_TARGET,
      )
    );
  }

  determineWinner(match: MatchContext): PlayerId | null {
    const players = [...match.players.values()].sort(
      (a, b) => b.score - a.score || a.deaths - b.deaths || a.id.localeCompare(b.id),
    );
    if (players.length === 0) return null;
    if (
      players[1] &&
      players[0].score === players[1].score &&
      players[0].deaths === players[1].deaths
    ) return null;
    return players[0].id;
  }

  getBountyHuntState(): BountyHuntState {
    return { targetId: this.targetId };
  }

  getResults(match: MatchContext): MatchResult {
    const playerStats = match.stats.getAllStats();
    return {
      matchId: match.matchId,
      winnerId: this.determineWinner(match),
      playerStats,
      duration: match.getElapsedSeconds(),
      gameMode: GameModeType.BOUNTY_HUNT,
      awards: computeAwards(
        playerStats,
        (id) => match.players.get(id)?.nickname ?? 'UNKNOWN',
      ),
      rivalry: null,
      rivalrySet: null,
      isPractice: false,
      nextMapName: null,
      nextGameMode: null,
      wentToOvertime: match.isOvertime,
    };
  }

  private setTarget(targetId: PlayerId | null): void {
    this.targetId = targetId;
    if (targetId !== null) this.lastTargetId = targetId;
  }

  private nextLivingId(match: MatchContext): PlayerId | null {
    const ids = [...match.players.keys()].sort((a, b) => a.localeCompare(b));
    if (ids.length === 0) return null;
    const previousIndex =
      this.lastTargetId === null ? -1 : ids.indexOf(this.lastTargetId);
    for (let offset = 1; offset <= ids.length; offset++) {
      const candidate = ids[(previousIndex + offset + ids.length) % ids.length];
      if (!match.players.get(candidate)?.isDead) return candidate;
    }
    return null;
  }

  private sortedLivingIds(match: MatchContext): PlayerId[] {
    return [...match.players.values()]
      .filter((player) => !player.isDead)
      .map((player) => player.id)
      .sort((a, b) => a.localeCompare(b));
  }

  private stableMatchIndex(matchId: string, count: number): number {
    let hash = 2166136261;
    for (let i = 0; i < matchId.length; i++) {
      hash ^= matchId.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % count;
  }
}
