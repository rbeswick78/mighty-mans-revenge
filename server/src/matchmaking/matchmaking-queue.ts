import type { PlayerId } from '@shared/game';

export interface QueueEntry {
  playerId: PlayerId;
  nickname: string;
  joinedAt: number;
}

export class MatchmakingQueue {
  private readonly queue: QueueEntry[] = [];

  addPlayer(playerId: PlayerId, nickname: string): void {
    // Don't add if already in queue
    if (this.isPlayerQueued(playerId)) return;

    this.queue.push({
      playerId,
      nickname,
      joinedAt: Date.now(),
    });
  }

  removePlayer(playerId: PlayerId): boolean {
    const index = this.queue.findIndex((e) => e.playerId === playerId);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  tryMatch(): { player1: QueueEntry; player2: QueueEntry } | null {
    if (this.queue.length < 2) return null;

    const player1 = this.queue.shift()!;
    const player2 = this.queue.shift()!;
    return { player1, player2 };
  }

  isPlayerQueued(playerId: PlayerId): boolean {
    return this.queue.some((e) => e.playerId === playerId);
  }
}
