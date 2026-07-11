import { GameModeType, KOTH, MAP } from '@shared/game';
import type { PlayerId, MatchResult, KothHudState, KillWeapon } from '@shared/game';
import { computeAwards } from '../awards.js';
import { logger } from '../../utils/logger.js';
import type { GameMode, MatchContext } from './game-mode.js';

/**
 * King of the Hill: one square hill zone is live at a time; standing in it
 * as the sole living occupant earns 1 point per full second (contested =
 * nobody scores). The hill relocates round-robin through the map's
 * kothHills list every HILL_MOVE_INTERVAL seconds, with the next spot
 * marked HILL_MOVE_WARNING seconds ahead. First to SCORE_TARGET wins, else
 * highest at time-out. Kills don't score — they just clear the hill.
 *
 * Hill points ride in PlayerState.score (the same slot DM uses for kills),
 * so the HUD score line, results scoreboard, and persistence all work
 * unchanged.
 */
export class KothMode implements GameMode {
  private hills: { x: number; y: number }[] = [];
  private hillIndex = 0;
  /** Seconds until the hill relocates. */
  private hillTimer = KOTH.HILL_MOVE_INTERVAL;
  /** Sole living occupant currently accruing progress, if any. */
  private occupantId: PlayerId | null = null;
  /** True while 2+ living players stand in the zone. */
  private contested = false;
  /**
   * Seconds of continuous sole occupancy not yet converted to a point
   * (always < 1). Resets whenever sole occupancy breaks — stepping out,
   * dying, getting contested, or the hill moving.
   */
  private captureSeconds = 0;

  onStart(match: MatchContext): void {
    const declared = match.getMapData().kothHills;
    if (declared && declared.length > 0) {
      this.hills = [...declared];
    } else {
      // Registry-validated maps always declare hills; this fallback only
      // exists so a mis-configured map degrades to a playable match
      // instead of a dead tick loop.
      const map = match.getMapData();
      const cx = Math.floor((map.width - KOTH.HILL_SIZE_TILES) / 2);
      const cy = Math.floor((map.height - KOTH.HILL_SIZE_TILES) / 2);
      this.hills = [{ x: cx, y: cy }];
      logger.error(
        { matchId: match.matchId, map: map.name },
        'KOTH match on a map with no kothHills — falling back to a single center hill',
      );
    }
    this.hillIndex = 0;
    this.hillTimer = KOTH.HILL_MOVE_INTERVAL;
    this.resetCapture();
  }

  onTick(match: MatchContext, dt: number): void {
    // The hill is retired during sudden death: scoring in overtime could
    // hand the timeout "true draw" to whoever camped the zone.
    if (match.isOvertime) return;

    // Relocation clock. Carrying the remainder keeps the cadence exact
    // across tick boundaries.
    this.hillTimer -= dt;
    if (this.hillTimer <= 0) {
      this.hillIndex = (this.hillIndex + 1) % this.hills.length;
      this.hillTimer += KOTH.HILL_MOVE_INTERVAL;
      // The zone moved out from under everyone — occupancy starts over.
      this.resetCapture();
    }

    // Occupancy: player center inside the live zone, living players only.
    const occupants: PlayerId[] = [];
    for (const [id, player] of match.players) {
      if (player.isDead) continue;
      if (this.isInsideHill(player.position.x, player.position.y)) {
        occupants.push(id);
      }
    }

    // Hill Hog accrual: EVERY living occupant banks hill time, contested
    // time included — deliberately broader than score (sole occupancy),
    // which integer-rounds into points and would just re-award the winner.
    // Overtime never reaches here (hill retired by the early return above).
    for (const id of occupants) {
      match.stats.recordHillSeconds(id, dt);
    }

    if (occupants.length !== 1) {
      // Empty or contested — either way nobody scores and progress resets.
      const wasContested = occupants.length > 1;
      this.resetCapture();
      this.contested = wasContested;
      return;
    }

    const sole = occupants[0];
    if (this.occupantId !== sole) {
      // New sole occupant starts from zero.
      this.occupantId = sole;
      this.captureSeconds = 0;
    }
    this.contested = false;
    this.captureSeconds += dt;
    while (this.captureSeconds >= 1) {
      this.captureSeconds -= 1;
      const player = match.players.get(sole);
      if (player) player.score += 1;
    }
  }

  onKill(
    _match: MatchContext,
    _killerId: PlayerId,
    _victimId: PlayerId,
    _weapon: KillWeapon,
  ): void {
    // Kills don't score in KOTH — they just make room on the hill.
  }

  isMatchOver(match: MatchContext): boolean {
    for (const player of match.players.values()) {
      if (player.score >= KOTH.SCORE_TARGET) return true;
    }
    return match.matchTimer <= 0;
  }

  determineWinner(match: MatchContext): PlayerId | null {
    const players = Array.from(match.players.values());
    if (players.length === 0) return null;

    players.sort((a, b) => b.score - a.score);
    const top = players[0];
    const second = players[1];

    // Equal hill points is a genuine tie — overtime settles it. No
    // secondary criterion: hill time IS the score in this mode.
    if (second && top.score === second.score) return null;
    return top.id;
  }

  getResults(match: MatchContext): MatchResult {
    const playerStats = match.stats.getAllStats();
    return {
      matchId: match.matchId,
      winnerId: this.determineWinner(match),
      playerStats,
      duration: match.getElapsedSeconds(),
      gameMode: GameModeType.KOTH,
      awards: computeAwards(playerStats, (id) => match.players.get(id)?.nickname ?? 'UNKNOWN'),
      // Attached by the matchmaking manager — see DeathmatchMode.
      rivalry: null,
      rivalrySet: null,
      isPractice: false,
      nextMapName: null,
      nextGameMode: null,
      wentToOvertime: match.isOvertime,
    };
  }

  getKothState(): KothHudState {
    return {
      hill: this.hills[this.hillIndex],
      nextHill:
        this.hills.length > 1 && this.hillTimer <= KOTH.HILL_MOVE_WARNING
          ? this.hills[(this.hillIndex + 1) % this.hills.length]
          : null,
      occupantId: this.occupantId,
      contested: this.contested,
      captureFraction: Math.min(1, Math.max(0, this.captureSeconds)),
    };
  }

  private resetCapture(): void {
    this.occupantId = null;
    this.contested = false;
    this.captureSeconds = 0;
  }

  private isInsideHill(x: number, y: number): boolean {
    const hill = this.hills[this.hillIndex];
    const size = KOTH.HILL_SIZE_TILES * MAP.TILE_SIZE;
    const minX = hill.x * MAP.TILE_SIZE;
    const minY = hill.y * MAP.TILE_SIZE;
    return x >= minX && x < minX + size && y >= minY && y < minY + size;
  }
}
