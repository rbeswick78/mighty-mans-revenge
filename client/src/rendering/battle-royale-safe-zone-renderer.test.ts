import { describe, expect, it } from 'vitest';

import { battleRoyaleSafeZonePresentation } from './battle-royale-safe-zone-renderer.js';

const state = {
  phaseIndex: 3,
  phase: 'closing' as const,
  center: { x: 100, y: 100 },
  radius: 50,
  nextCenter: { x: 110, y: 100 },
  nextRadius: 20,
  phaseSecondsRemaining: 4.2,
  damagePerPulse: 6,
};

describe('Battle Royale safe-zone presentation', () => {
  it('shows phase timing for a local fighter inside', () => {
    expect(battleRoyaleSafeZonePresentation(state, { x: 100, y: 100 }, 0)).toMatchObject({
      visible: true,
      outside: false,
      washAlpha: 0,
      status: 'CLOSING · 5s',
    });
  });

  it('shows authoritative pulse damage and a wash outside', () => {
    expect(battleRoyaleSafeZonePresentation(state, { x: 151, y: 100 }, 200)).toMatchObject({
      visible: true,
      outside: true,
      status: 'OUTSIDE SAFE ZONE · 6 DAMAGE',
    });
    expect(
      battleRoyaleSafeZonePresentation(state, { x: 151, y: 100 }, 200).washAlpha,
    ).toBeGreaterThan(0);
  });

  it('clears on old-server omission', () => {
    expect(battleRoyaleSafeZonePresentation(null, null, 0)).toEqual({
      visible: false,
      outside: false,
      boundaryAlpha: 0,
      washAlpha: 0,
      status: '',
    });
  });
});
