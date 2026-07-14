import { RUMBLE } from '@shared/game';
import type { PlayerId } from '@shared/game';
import type { QueueEntry } from './matchmaking-queue.js';

/**
 * Deterministic 2-4 player social queue. The server tick owns its launch
 * window, keeping tests timer-free and avoiding wall-clock races.
 */
export class RumbleQueue {
  private readonly queue: QueueEntry[] = [];
  private launchTimerSeconds: number | null = null;

  addPlayer(playerId: PlayerId, nickname: string): boolean {
    if (this.isPlayerQueued(playerId) || this.queue.length >= RUMBLE.MAX_PLAYERS) return false;
    this.queue.push({ playerId, nickname, joinedAt: Date.now() });
    this.syncTimer();
    return true;
  }

  removePlayer(playerId: PlayerId): boolean {
    const index = this.queue.findIndex((entry) => entry.playerId === playerId);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    this.syncTimer();
    return true;
  }

  tick(dt: number): QueueEntry[] | null {
    this.syncTimer();
    if (this.queue.length >= RUMBLE.MAX_PLAYERS) return this.takeGroup();
    if (this.launchTimerSeconds === null) return null;
    this.launchTimerSeconds = Math.max(0, this.launchTimerSeconds - dt);
    return this.launchTimerSeconds === 0 ? this.takeGroup() : null;
  }

  getEntries(): readonly QueueEntry[] {
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

  private syncTimer(): void {
    if (this.queue.length < RUMBLE.MIN_PLAYERS) {
      this.launchTimerSeconds = null;
    } else if (this.launchTimerSeconds === null) {
      this.launchTimerSeconds = RUMBLE.LAUNCH_DELAY_SECONDS;
    }
  }

  private takeGroup(): QueueEntry[] {
    const group = this.queue.splice(0, RUMBLE.MAX_PLAYERS);
    this.launchTimerSeconds = null;
    this.syncTimer();
    return group;
  }
}
