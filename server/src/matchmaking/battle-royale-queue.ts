import { BATTLE_ROYALE_QUEUE } from '@shared/game';
import type { CharacterId, PlayerId } from '@shared/game';

export interface BattleRoyaleQueueEntry {
  readonly playerId: PlayerId;
  readonly nickname: string;
  readonly fighterId: CharacterId;
  readonly joinedAt: number;
}

export interface BattleRoyaleQueueLaunch {
  readonly humans: readonly BattleRoyaleQueueEntry[];
  readonly botCount: number;
  readonly reason: 'full_human_roster' | 'deadline_fill';
}

/**
 * Deterministic one-to-eight-human Battle Royale queue. The server tick owns
 * the fill clock; cancellation or departure never grants the remaining
 * entrants extra wait time, while an empty queue resets the next cohort.
 */
export class BattleRoyaleQueue {
  private readonly queue: BattleRoyaleQueueEntry[] = [];
  private launchTimerSeconds: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  addPlayer(playerId: PlayerId, nickname: string, fighterId: CharacterId): boolean {
    if (this.isPlayerQueued(playerId) || this.queue.length >= BATTLE_ROYALE_QUEUE.MAX_PLAYERS) {
      return false;
    }
    this.queue.push({ playerId, nickname, fighterId, joinedAt: this.now() });
    if (this.launchTimerSeconds === null) {
      this.launchTimerSeconds = BATTLE_ROYALE_QUEUE.BOT_FILL_DEADLINE_SECONDS;
    }
    return true;
  }

  removePlayer(playerId: PlayerId): boolean {
    const index = this.queue.findIndex((entry) => entry.playerId === playerId);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    if (this.queue.length === 0) this.launchTimerSeconds = null;
    return true;
  }

  tick(dt: number): BattleRoyaleQueueLaunch | null {
    if (this.queue.length === BATTLE_ROYALE_QUEUE.MAX_PLAYERS) {
      return this.takeLaunch('full_human_roster');
    }
    if (this.queue.length === 0 || this.launchTimerSeconds === null) return null;
    if (Number.isFinite(dt) && dt > 0) {
      this.launchTimerSeconds = Math.max(0, this.launchTimerSeconds - dt);
    }
    return this.launchTimerSeconds === 0 ? this.takeLaunch('deadline_fill') : null;
  }

  getEntries(): readonly BattleRoyaleQueueEntry[] {
    return this.queue;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getLaunchInMs(): number | undefined {
    return this.launchTimerSeconds === null ? undefined : this.launchTimerSeconds * 1000;
  }

  isPlayerQueued(playerId: PlayerId): boolean {
    return this.queue.some((entry) => entry.playerId === playerId);
  }

  private takeLaunch(reason: BattleRoyaleQueueLaunch['reason']): BattleRoyaleQueueLaunch {
    const humans = this.queue.splice(0, BATTLE_ROYALE_QUEUE.MAX_PLAYERS);
    this.launchTimerSeconds = null;
    return Object.freeze({
      humans: Object.freeze(humans),
      botCount: BATTLE_ROYALE_QUEUE.MAX_PLAYERS - humans.length,
      reason,
    });
  }
}
