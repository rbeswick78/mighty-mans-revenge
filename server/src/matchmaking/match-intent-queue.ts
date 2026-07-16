import { matchIntentQueueKey } from '@shared/game';
import type { CharacterId, MatchIntent, PlayerId } from '@shared/game';

export interface MatchIntentQueueEntry {
  readonly playerId: PlayerId;
  readonly nickname: string;
  readonly intent: Readonly<MatchIntent>;
  readonly joinedAt: number;
}

/**
 * Exact-composition queue for the additive Reforged path. Entries only group
 * when format, composition, explicit mode, and the server-verified schedule
 * slot agree. Human fighter collisions remain queued instead of silently
 * replacing a persisted choice.
 */
export class MatchIntentQueue {
  private readonly entries: MatchIntentQueueEntry[] = [];

  add(entry: MatchIntentQueueEntry): boolean {
    if (this.isPlayerQueued(entry.playerId)) return false;
    this.entries.push(entry);
    return true;
  }

  removePlayer(playerId: PlayerId): MatchIntentQueueEntry | null {
    const index = this.entries.findIndex((entry) => entry.playerId === playerId);
    if (index < 0) return null;
    return this.entries.splice(index, 1)[0] ?? null;
  }

  isPlayerQueued(playerId: PlayerId): boolean {
    return this.entries.some((entry) => entry.playerId === playerId);
  }

  getQueueLength(): number {
    return this.entries.length;
  }

  getEntries(): readonly MatchIntentQueueEntry[] {
    return this.entries;
  }

  takeReadyGroup(): MatchIntentQueueEntry[] | null {
    for (const first of this.entries) {
      const requiredHumans = first.intent.composition.humanCount;
      const key = matchIntentQueueKey(first.intent);
      const group: MatchIntentQueueEntry[] = [];
      const fighters = new Set<CharacterId>();
      for (const candidate of this.entries) {
        if (matchIntentQueueKey(candidate.intent) !== key) continue;
        if (fighters.has(candidate.intent.fighterId)) continue;
        group.push(candidate);
        fighters.add(candidate.intent.fighterId);
        if (group.length === requiredHumans) break;
      }
      if (group.length !== requiredHumans) continue;
      const ids = new Set(group.map((entry) => entry.playerId));
      for (let index = this.entries.length - 1; index >= 0; index--) {
        if (ids.has(this.entries[index]!.playerId)) this.entries.splice(index, 1);
      }
      return group;
    }
    return null;
  }
}
