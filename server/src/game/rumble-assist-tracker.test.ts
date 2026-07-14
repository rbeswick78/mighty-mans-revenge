import { describe, expect, it } from 'vitest';
import { RUMBLE_ASSISTS } from '@shared/game';
import { RumbleAssistTracker } from './rumble-assist-tracker.js';

const connected = new Set(['killer', 'victim', 'helper-a', 'helper-b']);

describe('RumbleAssistTracker', () => {
  it('credits the strongest meaningful recent helper and consumes the life ledger', () => {
    const tracker = new RumbleAssistTracker();
    tracker.recordDamage('helper-a', 'victim', 12, 2);
    tracker.recordDamage('helper-a', 'victim', 18, 4);
    tracker.recordDamage('helper-b', 'victim', 25, 5);
    tracker.recordDamage('killer', 'victim', 50, 6);

    expect(tracker.resolveAssist('killer', 'victim', connected, 6)).toEqual({
      playerId: 'helper-a',
      damage: 30,
    });
    expect(tracker.resolveAssist('killer', 'victim', connected, 6)).toBeNull();
  });

  it('uses latest hit then stable id to break exact damage ties', () => {
    const tracker = new RumbleAssistTracker();
    tracker.recordDamage('helper-a', 'victim', 25, 4);
    tracker.recordDamage('helper-b', 'victim', 25, 5);
    expect(tracker.resolveAssist('killer', 'victim', connected, 6)?.playerId).toBe('helper-b');

    tracker.recordDamage('helper-b', 'victim', 25, 7);
    tracker.recordDamage('helper-a', 'victim', 25, 7);
    expect(tracker.resolveAssist('killer', 'victim', connected, 8)?.playerId).toBe('helper-a');
  });

  it('rejects stale, incidental, self, killer, and departed contributions', () => {
    const tracker = new RumbleAssistTracker();
    tracker.recordDamage('helper-a', 'victim', RUMBLE_ASSISTS.MIN_DAMAGE - 1, 9);
    tracker.recordDamage('helper-b', 'victim', 50, 10 - RUMBLE_ASSISTS.WINDOW_SECONDS - 0.01);
    tracker.recordDamage('victim', 'victim', 50, 9);
    tracker.recordDamage('killer', 'victim', 50, 9);
    tracker.recordDamage('departed', 'victim', 50, 9);

    expect(tracker.resolveAssist('killer', 'victim', connected, 10)).toBeNull();
  });

  it('removes a disconnected player as both helper and future victim', () => {
    const tracker = new RumbleAssistTracker();
    tracker.recordDamage('helper-a', 'victim', 30, 1);
    tracker.recordDamage('killer', 'helper-a', 30, 1);
    tracker.removePlayer('helper-a');

    expect(tracker.resolveAssist('killer', 'victim', connected, 2)).toBeNull();
    expect(tracker.resolveAssist('helper-b', 'helper-a', connected, 2)).toBeNull();
  });
});
