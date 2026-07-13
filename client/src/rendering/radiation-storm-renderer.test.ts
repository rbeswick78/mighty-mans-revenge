import { describe, expect, it } from 'vitest';
import { radiationStormPresentation } from './radiation-storm-renderer.js';

const state = {
  center: { x: 100, y: 100 },
  radius: 50,
  shrinkSecondsRemaining: 8,
};

describe('Radiation Storm presentation', () => {
  it('hides completely without authoritative state', () => {
    expect(radiationStormPresentation(null, { x: 0, y: 0 }, 0)).toEqual({
      visible: false,
      outside: false,
      boundaryAlpha: 0,
      washAlpha: 0,
    });
  });

  it('shows the warning wash only outside the safe radius', () => {
    expect(radiationStormPresentation(state, { x: 120, y: 100 }, 0).outside).toBe(false);
    const outside = radiationStormPresentation(state, { x: 151, y: 100 }, 0);
    expect(outside.outside).toBe(true);
    expect(outside.washAlpha).toBeGreaterThan(0);
  });

  it('pulses deterministically while keeping the boundary readable', () => {
    const first = radiationStormPresentation(state, null, 0);
    const second = radiationStormPresentation(state, null, Math.PI * 90);
    expect(first.boundaryAlpha).toBeGreaterThanOrEqual(0.65);
    expect(second.boundaryAlpha).toBeGreaterThan(first.boundaryAlpha);
  });
});
