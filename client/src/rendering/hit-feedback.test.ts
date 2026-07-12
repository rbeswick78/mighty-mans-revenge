import { describe, expect, it } from 'vitest';
import {
  SHOTGUN_TRAIL_GROUP_MS,
  hasConfirmedPlayerHit,
  isSameShotgunBlast,
} from './hit-feedback.js';

describe('hasConfirmedPlayerHit', () => {
  it('accepts an authoritative player id with positive finite damage', () => {
    expect(hasConfirmedPlayerHit({ hitPlayerId: 'target', damageApplied: 17 })).toBe(true);
  });

  it('rejects misses, zero damage, malformed values, and old payloads', () => {
    expect(hasConfirmedPlayerHit({ hitPlayerId: null, damageApplied: 0 })).toBe(false);
    expect(hasConfirmedPlayerHit({ hitPlayerId: 'target', damageApplied: 0 })).toBe(false);
    expect(hasConfirmedPlayerHit({ hitPlayerId: 'target', damageApplied: Number.NaN })).toBe(false);
    expect(hasConfirmedPlayerHit({})).toBe(false);
  });
});

describe('isSameShotgunBlast', () => {
  it('groups only forward-moving pellet timestamps inside the blast window', () => {
    expect(isSameShotgunBlast(undefined, 1000)).toBe(false);
    expect(isSameShotgunBlast(1000, 1000)).toBe(true);
    expect(isSameShotgunBlast(1000, 1000 + SHOTGUN_TRAIL_GROUP_MS - 1)).toBe(true);
    expect(isSameShotgunBlast(1000, 1000 + SHOTGUN_TRAIL_GROUP_MS)).toBe(false);
    expect(isSameShotgunBlast(1000, 999)).toBe(false);
  });
});
