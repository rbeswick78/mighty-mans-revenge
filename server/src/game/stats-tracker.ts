import { createEmptyKillsByWeapon } from '@shared/game';
import type { PlayerId, PlayerStats, KillWeapon } from '@shared/game';

export class StatsTracker {
  private stats: Map<PlayerId, PlayerStats> = new Map();
  private currentStreaks: Map<PlayerId, number> = new Map();

  /** Initialize stats for a player. Must be called before recording any events. */
  initPlayer(playerId: PlayerId): void {
    this.stats.set(playerId, {
      kills: 0,
      deaths: 0,
      assists: 0,
      shotsFired: 0,
      shotsHit: 0,
      damageDealt: 0,
      damageTaken: 0,
      grenadesThrown: 0,
      killsByWeapon: createEmptyKillsByWeapon(),
      longestKillStreak: 0,
      distanceTraveled: 0,
      hillSeconds: 0,
    });
    this.currentStreaks.set(playerId, 0);
  }

  recordShot(playerId: PlayerId): void {
    const s = this.getStatsOrThrow(playerId);
    s.shotsFired++;
  }

  recordHit(playerId: PlayerId): void {
    const s = this.getStatsOrThrow(playerId);
    s.shotsHit++;
  }

  recordKill(killerId: PlayerId, _victimId: PlayerId, weapon: KillWeapon): void {
    const s = this.getStatsOrThrow(killerId);
    s.kills++;
    s.killsByWeapon[weapon]++;

    // Update kill streak
    const streak = (this.currentStreaks.get(killerId) ?? 0) + 1;
    this.currentStreaks.set(killerId, streak);
    if (streak > s.longestKillStreak) {
      s.longestKillStreak = streak;
    }
  }

  recordDeath(playerId: PlayerId): void {
    const s = this.getStatsOrThrow(playerId);
    s.deaths++;
    // Reset kill streak on death
    this.currentStreaks.set(playerId, 0);
  }

  recordAssist(playerId: PlayerId): void {
    const s = this.getStatsOrThrow(playerId);
    s.assists = (s.assists ?? 0) + 1;
  }

  recordGrenade(playerId: PlayerId): void {
    const s = this.getStatsOrThrow(playerId);
    s.grenadesThrown++;
  }

  recordDamage(dealerId: PlayerId, amount: number): void {
    const dealerStats = this.getStatsOrThrow(dealerId);
    dealerStats.damageDealt += amount;
  }

  recordDamageTaken(playerId: PlayerId, amount: number): void {
    const s = this.getStatsOrThrow(playerId);
    s.damageTaken += amount;
  }

  /** Accumulate distance moved (px) by server-authoritative movement. */
  recordDistance(playerId: PlayerId, px: number): void {
    const s = this.getStatsOrThrow(playerId);
    s.distanceTraveled += px;
  }

  /**
   * Accumulate (fractional) seconds spent alive inside the live KOTH hill,
   * contested time included. Only KothMode calls this — every other mode
   * leaves hillSeconds at 0, which keeps the Hill Hog award KOTH-only.
   */
  recordHillSeconds(playerId: PlayerId, seconds: number): void {
    const s = this.getStatsOrThrow(playerId);
    s.hillSeconds += seconds;
  }

  getStats(playerId: PlayerId): PlayerStats {
    return this.getStatsOrThrow(playerId);
  }

  getAllStats(): Map<PlayerId, PlayerStats> {
    return new Map(this.stats);
  }

  /** Current life streak, distinct from the all-match longest streak. */
  getCurrentStreak(playerId: PlayerId): number {
    this.getStatsOrThrow(playerId);
    return this.currentStreaks.get(playerId) ?? 0;
  }

  private getStatsOrThrow(playerId: PlayerId): PlayerStats {
    const s = this.stats.get(playerId);
    if (!s) {
      throw new Error(`No stats initialized for player ${playerId}`);
    }
    return s;
  }
}
