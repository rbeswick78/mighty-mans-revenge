import { describe, expect, it } from 'vitest';
import { BATTLE_ROYALE_QUEUE } from '@shared/game';
import { BattleRoyaleQueue } from './battle-royale-queue.js';

describe('BattleRoyaleQueue', () => {
  function add(queue: BattleRoyaleQueue, index: number): boolean {
    return queue.addPlayer(`p${index}`, `Player ${index}`, index % 2 ? 'bruce' : 'mighty_man');
  }

  it('launches eight humans immediately in stable join order with no bots', () => {
    const queue = new BattleRoyaleQueue(() => 1_000);
    for (let index = 0; index < BATTLE_ROYALE_QUEUE.MAX_PLAYERS; index += 1) {
      expect(add(queue, index)).toBe(true);
    }

    expect(queue.tick(0)).toEqual({
      humans: Array.from({ length: 8 }, (_, index) => ({
        playerId: `p${index}`,
        nickname: `Player ${index}`,
        fighterId: index % 2 ? 'bruce' : 'mighty_man',
        joinedAt: 1_000,
      })),
      botCount: 0,
      reason: 'full_human_roster',
    });
    expect(queue.getQueueLength()).toBe(0);
    expect(queue.getLaunchInMs()).toBeUndefined();
  });

  it.each([1, 2, 3, 4, 5, 6, 7])(
    'fills an exact eight-slot roster at the deadline with %i humans',
    (humanCount) => {
      const queue = new BattleRoyaleQueue();
      for (let index = 0; index < humanCount; index += 1) add(queue, index);

      expect(queue.tick(BATTLE_ROYALE_QUEUE.BOT_FILL_DEADLINE_SECONDS - 0.001)).toBeNull();
      expect(queue.getLaunchInMs()).toBeCloseTo(1);
      expect(queue.tick(0.001)).toMatchObject({
        botCount: BATTLE_ROYALE_QUEUE.MAX_PLAYERS - humanCount,
        reason: 'deadline_fill',
      });
    },
  );

  it('rejects duplicate and over-capacity joins without changing the deadline', () => {
    const queue = new BattleRoyaleQueue();
    expect(add(queue, 0)).toBe(true);
    queue.tick(4);
    expect(add(queue, 0)).toBe(false);
    for (let index = 1; index < 8; index += 1) expect(add(queue, index)).toBe(true);
    expect(add(queue, 8)).toBe(false);
    expect(queue.getLaunchInMs()).toBe(11_000);
  });

  it('preserves the remaining cohort deadline after cancel or disconnect and resets when empty', () => {
    const queue = new BattleRoyaleQueue();
    add(queue, 0);
    add(queue, 1);
    queue.tick(5);
    expect(queue.removePlayer('p0')).toBe(true);
    expect(queue.getLaunchInMs()).toBe(10_000);
    expect(queue.tick(10)).toMatchObject({
      humans: [expect.objectContaining({ playerId: 'p1' })],
      botCount: 7,
    });

    add(queue, 2);
    queue.tick(3);
    expect(queue.removePlayer('p2')).toBe(true);
    expect(queue.getLaunchInMs()).toBeUndefined();
    add(queue, 3);
    expect(queue.getLaunchInMs()).toBe(15_000);
  });

  it('ignores invalid tick deltas', () => {
    const queue = new BattleRoyaleQueue();
    add(queue, 0);
    expect(queue.tick(Number.NaN)).toBeNull();
    expect(queue.tick(-5)).toBeNull();
    expect(queue.getLaunchInMs()).toBe(15_000);
  });
});
