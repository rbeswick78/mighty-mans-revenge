import type { PlayerId, PlayerStats } from '@shared/game';

export class StatsTracker {
  private stats: Map<PlayerId, PlayerStats> = new Map();
  private currentStreaks: Map<PlayerId, number> = new Map();

  /** Initialize stats for a player. Must be called before recording any events. */
  initPlayer(playerId: PlayerId): void {
    this.stats.set(playerId, {
      kills: 0,
      deaths: 0,
      shotsFired: 0,
      shotsHit: 0,
      damageDealt: 0,
      damageTaken: 0,
      grenadesThrown: 0,
      grenadeKills: 0,
      longestKillStreak: 0,
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

  recordKill(killerId: PlayerId, _victimId: PlayerId, weapon: 'gun' | 'grenade'): void {
    const s = this.getStatsOrThrow(killerId);
    s.kills++;

    if (weapon === 'grenade') {
      s.grenadeKills++;
    }

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

  getStats(playerId: PlayerId): PlayerStats {
    return this.getStatsOrThrow(playerId);
  }

  getAllStats(): Map<PlayerId, PlayerStats> {
    return new Map(this.stats);
  }

  private getStatsOrThrow(playerId: PlayerId): PlayerStats {
    const s = this.stats.get(playerId);
    if (!s) {
      throw new Error(`No stats initialized for player ${playerId}`);
    }
    return s;
  }
}
