import { RUMBLE_ASSISTS } from '@shared/game';
import type { PlayerId } from '@shared/game';

interface DamageContribution {
  damage: number;
  atSeconds: number;
}

export interface RumbleAssistCredit {
  playerId: PlayerId;
  damage: number;
}

/**
 * Match-scoped recent-damage ledger for group fights. The tracker owns no
 * score or combat decisions: it only identifies one meaningful helper after
 * an authoritative knockout has already happened.
 */
export class RumbleAssistTracker {
  private readonly byVictim = new Map<PlayerId, Map<PlayerId, DamageContribution[]>>();

  recordDamage(attackerId: PlayerId, victimId: PlayerId, damage: number, atSeconds: number): void {
    if (
      attackerId === victimId ||
      !Number.isFinite(damage) ||
      damage <= 0 ||
      !Number.isFinite(atSeconds)
    ) {
      return;
    }

    let byAttacker = this.byVictim.get(victimId);
    if (!byAttacker) {
      byAttacker = new Map();
      this.byVictim.set(victimId, byAttacker);
    }

    const cutoff = atSeconds - RUMBLE_ASSISTS.WINDOW_SECONDS;
    const recent = (byAttacker.get(attackerId) ?? []).filter(
      (entry) => entry.atSeconds >= cutoff && entry.atSeconds <= atSeconds,
    );
    recent.push({ damage, atSeconds });
    byAttacker.set(attackerId, recent);
  }

  resolveAssist(
    killerId: PlayerId,
    victimId: PlayerId,
    connectedPlayerIds: ReadonlySet<PlayerId>,
    atSeconds: number,
  ): RumbleAssistCredit | null {
    const byAttacker = this.byVictim.get(victimId);
    this.byVictim.delete(victimId);
    if (!byAttacker || killerId === victimId || !Number.isFinite(atSeconds)) return null;

    const cutoff = atSeconds - RUMBLE_ASSISTS.WINDOW_SECONDS;
    const candidates: Array<{
      playerId: PlayerId;
      damage: number;
      latestHitAt: number;
    }> = [];

    for (const [playerId, contributions] of byAttacker) {
      if (playerId === killerId || playerId === victimId || !connectedPlayerIds.has(playerId)) {
        continue;
      }
      const recent = contributions.filter(
        (entry) => entry.atSeconds >= cutoff && entry.atSeconds <= atSeconds,
      );
      const damage = recent.reduce((total, entry) => total + entry.damage, 0);
      if (damage < RUMBLE_ASSISTS.MIN_DAMAGE) continue;
      candidates.push({
        playerId,
        damage,
        latestHitAt: Math.max(...recent.map((entry) => entry.atSeconds)),
      });
    }

    candidates.sort(
      (a, b) =>
        b.damage - a.damage ||
        b.latestHitAt - a.latestHitAt ||
        a.playerId.localeCompare(b.playerId),
    );
    const winner = candidates[0];
    return winner ? { playerId: winner.playerId, damage: Math.round(winner.damage) } : null;
  }

  clearVictim(victimId: PlayerId): void {
    this.byVictim.delete(victimId);
  }

  removePlayer(playerId: PlayerId): void {
    this.byVictim.delete(playerId);
    for (const [victimId, byAttacker] of this.byVictim) {
      byAttacker.delete(playerId);
      if (byAttacker.size === 0) this.byVictim.delete(victimId);
    }
  }
}
