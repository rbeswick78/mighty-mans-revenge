import { describe, expect, it } from 'vitest';
import { CREW_BATTLE, GameModeType } from '@shared/game';
import { CrewQueue } from './crew-queue.js';

function add(queue: CrewQueue, playerId: string): boolean {
  return queue.addPlayer({
    playerId,
    nickname: playerId.toUpperCase(),
    difficulty: 'scrapper',
    gameMode: GameModeType.KOTH,
    mutatorId: null,
  });
}

describe('CrewQueue', () => {
  it('opens a bounded ally window and launches one captain with a Rusty slot', () => {
    const queue = new CrewQueue();
    expect(add(queue, 'p1')).toBe(true);
    expect(queue.getLaunchInMs()).toBe(CREW_BATTLE.ALLY_WAIT_SECONDS * 1000);
    expect(queue.tick(CREW_BATTLE.ALLY_WAIT_SECONDS - 0.1)).toBeNull();
    expect(queue.tick(0.1)?.map((entry) => entry.playerId)).toEqual(['p1']);
    expect(queue.getQueueLength()).toBe(0);
  });

  it('launches a full human crew immediately and rejects duplicates or overflow', () => {
    const queue = new CrewQueue();
    expect(add(queue, 'p1')).toBe(true);
    expect(add(queue, 'p1')).toBe(false);
    expect(add(queue, 'p2')).toBe(true);
    expect(add(queue, 'p3')).toBe(false);
    expect(queue.tick(0)?.map((entry) => entry.playerId)).toEqual(['p1', 'p2']);
  });

  it('preserves the captain timer when an ally leaves but resets it for a new captain', () => {
    const queue = new CrewQueue();
    add(queue, 'p1');
    queue.tick(2);
    add(queue, 'p2');
    queue.removePlayer('p2');
    expect(queue.getLaunchInMs()).toBe((CREW_BATTLE.ALLY_WAIT_SECONDS - 2) * 1000);

    add(queue, 'p2');
    queue.removePlayer('p1');
    expect(queue.getLaunchInMs()).toBe(CREW_BATTLE.ALLY_WAIT_SECONDS * 1000);
  });

  it('ignores invalid time deltas and clears its timer when empty', () => {
    const queue = new CrewQueue();
    add(queue, 'p1');
    expect(queue.tick(Number.NaN)).toBeNull();
    expect(queue.getLaunchInMs()).toBe(CREW_BATTLE.ALLY_WAIT_SECONDS * 1000);
    queue.removePlayer('p1');
    expect(queue.getLaunchInMs()).toBeUndefined();
  });
});
