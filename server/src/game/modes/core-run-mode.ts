import { CORE_RUN, GameModeType, PickupType } from '@shared/game';
import type {
  CoreRunState,
  KillWeapon,
  MatchResult,
  PlayerId,
  Vec2,
} from '@shared/game';
import { computeAwards } from '../awards.js';
import type { GameMode, MatchContext } from './game-mode.js';

/**
 * Core Run turns the arena's geometric center into a neutral pickup, then
 * turns whoever claims it into the moving objective. Carrying banks one
 * point per full second; death drops the core at the carrier's position and
 * an ignored drop returns home after a short recovery window.
 */
export class CoreRunMode implements GameMode {
  private homePosition: Vec2 = { x: 0, y: 0 };
  private position: Vec2 = { x: 0, y: 0 };
  private carrierId: PlayerId | null = null;
  private returnInSeconds: number | null = null;
  private carrySeconds = 0;

  onStart(match: MatchContext): void {
    const map = match.getMapData();
    this.homePosition = {
      x: (map.width * map.tileSize) / 2,
      y: (map.height * map.tileSize) / 2,
    };
    this.position = { ...this.homePosition };
    this.carrierId = null;
    this.returnInSeconds = null;
    this.carrySeconds = 0;
    for (const player of match.players.values()) player.score = 0;
  }

  onTick(match: MatchContext, dt: number): void {
    if (match.isOvertime) {
      this.carrierId = null;
      this.returnInSeconds = null;
      this.carrySeconds = 0;
      return;
    }

    if (this.carrierId !== null) {
      const carrier = match.players.get(this.carrierId);
      if (!carrier || carrier.isDead) {
        this.dropAt(carrier?.position ?? this.position);
        return;
      }
      this.position = { ...carrier.position };
      this.carrySeconds += dt;
      while (this.carrySeconds >= 1) {
        this.carrySeconds -= 1;
        carrier.score += 1;
      }
      return;
    }

    const collector = this.nearestCollector(match);
    if (collector !== null) {
      const player = match.players.get(collector)!;
      this.carrierId = collector;
      this.position = { ...player.position };
      this.returnInSeconds = null;
      this.carrySeconds = 0;
      return;
    }

    if (this.returnInSeconds !== null) {
      this.returnInSeconds -= dt;
      if (this.returnInSeconds <= 0) this.returnHome();
    }
  }

  onKill(
    match: MatchContext,
    _killerId: PlayerId,
    victimId: PlayerId,
    _weapon: KillWeapon,
  ): void {
    if (match.isOvertime || this.carrierId !== victimId) return;
    const victim = match.players.get(victimId);
    this.dropAt(victim?.position ?? this.position);
  }

  isMatchOver(match: MatchContext): boolean {
    return (
      match.matchTimer <= 0 ||
      [...match.players.values()].some(
        (player) => player.score >= CORE_RUN.SCORE_TARGET,
      )
    );
  }

  determineWinner(match: MatchContext): PlayerId | null {
    const players = [...match.players.values()].sort(
      (a, b) => b.score - a.score || a.id.localeCompare(b.id),
    );
    if (players.length === 0) return null;
    if (players[1] && players[0].score === players[1].score) return null;
    return players[0].id;
  }

  getCoreRunState(): CoreRunState {
    return {
      position: { ...this.position },
      carrierId: this.carrierId,
      returnInSeconds: this.returnInSeconds,
      carryFraction: Math.min(1, Math.max(0, this.carrySeconds)),
    };
  }

  /** The center objective should not also grant a power weapon. */
  isPickupTypeEnabled(type: PickupType): boolean {
    return (
      type !== PickupType.WEAPON_SHOTGUN &&
      type !== PickupType.WEAPON_PISTOL
    );
  }

  getResults(match: MatchContext): MatchResult {
    const playerStats = match.stats.getAllStats();
    return {
      matchId: match.matchId,
      winnerId: this.determineWinner(match),
      playerStats,
      duration: match.getElapsedSeconds(),
      gameMode: GameModeType.CORE_RUN,
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

  private nearestCollector(match: MatchContext): PlayerId | null {
    const radiusSq = CORE_RUN.COLLECT_RADIUS ** 2;
    let collector: PlayerId | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    for (const player of match.players.values()) {
      if (player.isDead) continue;
      const dx = player.position.x - this.position.x;
      const dy = player.position.y - this.position.y;
      const distanceSq = dx * dx + dy * dy;
      if (
        distanceSq <= radiusSq &&
        (distanceSq < nearestDistanceSq ||
          (distanceSq === nearestDistanceSq &&
            (collector === null || player.id < collector)))
      ) {
        collector = player.id;
        nearestDistanceSq = distanceSq;
      }
    }
    return collector;
  }

  private dropAt(position: Vec2): void {
    this.position = { ...position };
    this.carrierId = null;
    this.returnInSeconds = CORE_RUN.RETURN_SECONDS;
    this.carrySeconds = 0;
  }

  private returnHome(): void {
    this.position = { ...this.homePosition };
    this.carrierId = null;
    this.returnInSeconds = null;
    this.carrySeconds = 0;
  }
}
