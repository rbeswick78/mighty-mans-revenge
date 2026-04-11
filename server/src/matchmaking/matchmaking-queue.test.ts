import { describe, it, expect, beforeEach } from 'vitest';
import { MatchmakingQueue } from './matchmaking-queue.js';

describe('MatchmakingQueue', () => {
  let queue: MatchmakingQueue;

  beforeEach(() => {
    queue = new MatchmakingQueue();
  });

  describe('addPlayer', () => {
    it('adds a player to the queue', () => {
      queue.addPlayer('p1', 'Alice');

      expect(queue.getQueueLength()).toBe(1);
      expect(queue.isPlayerQueued('p1')).toBe(true);
    });

    it('cannot add the same player twice', () => {
      queue.addPlayer('p1', 'Alice');
      queue.addPlayer('p1', 'Alice');

      expect(queue.getQueueLength()).toBe(1);
    });
  });

  describe('removePlayer', () => {
    it('removes a player from the queue', () => {
      queue.addPlayer('p1', 'Alice');
      const result = queue.removePlayer('p1');

      expect(result).toBe(true);
      expect(queue.getQueueLength()).toBe(0);
      expect(queue.isPlayerQueued('p1')).toBe(false);
    });

    it('returns false when removing a player not in queue', () => {
      const result = queue.removePlayer('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('isPlayerQueued', () => {
    it('returns true for a queued player', () => {
      queue.addPlayer('p1', 'Alice');
      expect(queue.isPlayerQueued('p1')).toBe(true);
    });

    it('returns false for a non-queued player', () => {
      expect(queue.isPlayerQueued('p1')).toBe(false);
    });

    it('returns false after player is removed', () => {
      queue.addPlayer('p1', 'Alice');
      queue.removePlayer('p1');
      expect(queue.isPlayerQueued('p1')).toBe(false);
    });
  });

  describe('tryMatch', () => {
    it('returns null when queue has fewer than 2 players', () => {
      expect(queue.tryMatch()).toBeNull();

      queue.addPlayer('p1', 'Alice');
      expect(queue.tryMatch()).toBeNull();
    });

    it('returns a pair when 2+ players are queued', () => {
      queue.addPlayer('p1', 'Alice');
      queue.addPlayer('p2', 'Bob');

      const result = queue.tryMatch();

      expect(result).not.toBeNull();
      expect(result!.player1.playerId).toBe('p1');
      expect(result!.player1.nickname).toBe('Alice');
      expect(result!.player2.playerId).toBe('p2');
      expect(result!.player2.nickname).toBe('Bob');
    });

    it('removes matched players from the queue', () => {
      queue.addPlayer('p1', 'Alice');
      queue.addPlayer('p2', 'Bob');

      queue.tryMatch();

      expect(queue.getQueueLength()).toBe(0);
      expect(queue.isPlayerQueued('p1')).toBe(false);
      expect(queue.isPlayerQueued('p2')).toBe(false);
    });

    it('is FIFO — first in, first matched', () => {
      queue.addPlayer('p1', 'Alice');
      queue.addPlayer('p2', 'Bob');
      queue.addPlayer('p3', 'Charlie');

      const result = queue.tryMatch();

      expect(result!.player1.playerId).toBe('p1');
      expect(result!.player2.playerId).toBe('p2');

      // p3 should remain in the queue
      expect(queue.getQueueLength()).toBe(1);
      expect(queue.isPlayerQueued('p3')).toBe(true);
    });

    it('can match multiple pairs sequentially', () => {
      queue.addPlayer('p1', 'Alice');
      queue.addPlayer('p2', 'Bob');
      queue.addPlayer('p3', 'Charlie');
      queue.addPlayer('p4', 'Diana');

      const first = queue.tryMatch();
      const second = queue.tryMatch();

      expect(first!.player1.playerId).toBe('p1');
      expect(first!.player2.playerId).toBe('p2');
      expect(second!.player1.playerId).toBe('p3');
      expect(second!.player2.playerId).toBe('p4');
      expect(queue.getQueueLength()).toBe(0);
    });

    it('returns null after all players are matched', () => {
      queue.addPlayer('p1', 'Alice');
      queue.addPlayer('p2', 'Bob');

      queue.tryMatch();
      expect(queue.tryMatch()).toBeNull();
    });
  });

  describe('getQueueLength', () => {
    it('returns 0 for empty queue', () => {
      expect(queue.getQueueLength()).toBe(0);
    });

    it('reflects current queue size', () => {
      queue.addPlayer('p1', 'Alice');
      expect(queue.getQueueLength()).toBe(1);

      queue.addPlayer('p2', 'Bob');
      expect(queue.getQueueLength()).toBe(2);

      queue.removePlayer('p1');
      expect(queue.getQueueLength()).toBe(1);
    });
  });
});
