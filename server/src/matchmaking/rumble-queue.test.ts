import { describe, expect, it } from 'vitest';
import { RUMBLE } from '@shared/game';
import { RumbleQueue } from './rumble-queue.js';

describe('RumbleQueue', () => {
  it('waits for two fighters before opening the launch window', () => {
    const queue = new RumbleQueue();
    queue.addPlayer('p1', 'Alice');
    expect(queue.getLaunchInMs()).toBeUndefined();
    expect(queue.tick(30)).toBeNull();

    queue.addPlayer('p2', 'Bob');
    expect(queue.getLaunchInMs()).toBe(RUMBLE.LAUNCH_DELAY_SECONDS * 1000);
  });

  it('launches every gathered fighter when the window expires', () => {
    const queue = new RumbleQueue();
    queue.addPlayer('p1', 'Alice');
    queue.addPlayer('p2', 'Bob');
    queue.addPlayer('p3', 'Cora');

    expect(queue.tick(RUMBLE.LAUNCH_DELAY_SECONDS - 0.1)).toBeNull();
    expect(queue.tick(0.1)?.map((entry) => entry.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(queue.getQueueLength()).toBe(0);
  });

  it('launches immediately at four and rejects overflow', () => {
    const queue = new RumbleQueue();
    for (let i = 1; i <= 4; i++) expect(queue.addPlayer(`p${i}`, `P${i}`)).toBe(true);
    expect(queue.addPlayer('p5', 'P5')).toBe(false);
    expect(queue.tick(0)?.map((entry) => entry.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('cancels the window when the party falls below two', () => {
    const queue = new RumbleQueue();
    queue.addPlayer('p1', 'Alice');
    queue.addPlayer('p2', 'Bob');
    queue.tick(2);
    queue.removePlayer('p2');

    expect(queue.getLaunchInMs()).toBeUndefined();
    expect(queue.tick(30)).toBeNull();
  });
});
