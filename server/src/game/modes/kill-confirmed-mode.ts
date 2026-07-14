import { GameModeType, KILL_CONFIRMED } from '@shared/game';
import type {
  KillConfirmedTagState,
  KillConfirmedCollection,
  KillWeapon,
  MatchResult,
  PlayerId,
} from '@shared/game';
import { computeAwards } from '../awards.js';
import {
  determineTeamLeader,
  hasTeamReachedScore,
  teamScoreRows,
  type GameMode,
  type MatchContext,
} from './game-mode.js';

/**
 * Kills create contested tags. Collecting an opponent's tag banks one point;
 * recovering your own removes it without scoring. This turns every kill into
 * a movement decision instead of letting safe damage alone win the match.
 */
export class KillConfirmedMode implements GameMode {
  private tags: KillConfirmedTagState[] = [];
  private nextTagId = 1;
  private recentCollections: KillConfirmedCollection[] = [];

  onStart(match: MatchContext): void {
    this.tags = [];
    this.nextTagId = 1;
    this.recentCollections = [];
    for (const player of match.players.values()) player.score = 0;
  }

  onKill(match: MatchContext, _killerId: PlayerId, victimId: PlayerId, _weapon: KillWeapon): void {
    if (match.isOvertime) return;
    const victim = match.players.get(victimId);
    if (!victim) return;
    this.tags.push({
      id: `tag-${this.nextTagId++}`,
      ownerId: victimId,
      position: { ...victim.position },
      expiresInSeconds: KILL_CONFIRMED.TAG_LIFETIME_SECONDS,
    });
  }

  onTick(match: MatchContext, dt: number): void {
    this.recentCollections = [];
    if (match.isOvertime) {
      this.tags = [];
      return;
    }

    const radiusSq = KILL_CONFIRMED.TAG_COLLECT_RADIUS ** 2;
    const remaining: KillConfirmedTagState[] = [];
    for (const tag of this.tags) {
      tag.expiresInSeconds -= dt;
      if (tag.expiresInSeconds <= 0) continue;

      let collector: PlayerId | null = null;
      let nearestDistanceSq = Number.POSITIVE_INFINITY;
      for (const player of match.players.values()) {
        if (player.isDead) continue;
        const dx = player.position.x - tag.position.x;
        const dy = player.position.y - tag.position.y;
        const distanceSq = dx * dx + dy * dy;
        if (
          distanceSq <= radiusSq &&
          (distanceSq < nearestDistanceSq ||
            (distanceSq === nearestDistanceSq && (collector === null || player.id < collector)))
        ) {
          collector = player.id;
          nearestDistanceSq = distanceSq;
        }
      }

      const collectorTeam = collector === null ? null : (match.getTeamId?.(collector) ?? null);
      const ownerTeam = match.getTeamId?.(tag.ownerId) ?? null;
      const confirmed =
        collector !== null &&
        (collectorTeam !== null && ownerTeam !== null
          ? collectorTeam !== ownerTeam
          : collector !== tag.ownerId);

      if (collector === null) {
        remaining.push(tag);
      } else if (confirmed) {
        const player = match.players.get(collector);
        if (player) player.score += 1;
      }
      if (collector !== null) {
        this.recentCollections.push({
          tagId: tag.id,
          collectorId: collector,
          ownerId: tag.ownerId,
          confirmed,
        });
      }
      // Own-tag collection is a denial: remove it without scoring.
    }
    this.tags = remaining;
  }

  isMatchOver(match: MatchContext): boolean {
    if (teamScoreRows(match)) {
      return match.matchTimer <= 0 || hasTeamReachedScore(match, KILL_CONFIRMED.SCORE_TARGET);
    }
    return (
      match.matchTimer <= 0 ||
      [...match.players.values()].some((player) => player.score >= KILL_CONFIRMED.SCORE_TARGET)
    );
  }

  determineWinner(match: MatchContext): PlayerId | null {
    if (teamScoreRows(match)) return determineTeamLeader(match);
    const players = [...match.players.values()].sort((a, b) => b.score - a.score);
    if (players.length === 0) return null;
    if (players[1] && players[0].score === players[1].score) return null;
    return players[0].id;
  }

  getKillConfirmedTags(): readonly KillConfirmedTagState[] {
    return this.tags;
  }

  getKillConfirmedCollections(): readonly KillConfirmedCollection[] {
    return this.recentCollections;
  }

  getResults(match: MatchContext): MatchResult {
    const playerStats = match.stats.getAllStats();
    return {
      matchId: match.matchId,
      winnerId: this.determineWinner(match),
      playerStats,
      duration: match.getElapsedSeconds(),
      gameMode: GameModeType.KILL_CONFIRMED,
      awards: computeAwards(playerStats, (id) => match.players.get(id)?.nickname ?? 'UNKNOWN'),
      rivalry: null,
      rivalrySet: null,
      isPractice: false,
      nextMapName: null,
      nextGameMode: null,
      wentToOvertime: match.isOvertime,
    };
  }
}
