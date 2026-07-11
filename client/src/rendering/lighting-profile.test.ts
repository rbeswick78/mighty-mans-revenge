import { describe, expect, it } from 'vitest';
import { LIGHTING_PROFILES, lightingProfile } from './lighting-profile.js';

describe('lightingProfile', () => {
  it('keeps normal play mildly graded without a player light', () => {
    expect(lightingProfile(false)).toEqual({
      ambientAlpha: 0.2,
      playerLightRadius: 0,
    });
  });

  it('makes blackout substantially darker but preserves a playable light pool', () => {
    const normal = lightingProfile(false);
    const blackout = lightingProfile(true);
    expect(blackout.ambientAlpha).toBeGreaterThan(normal.ambientAlpha + 0.5);
    expect(blackout.ambientAlpha).toBeLessThan(1);
    expect(blackout.playerLightRadius).toBeGreaterThan(100);
  });

  it('freezes both presets against accidental runtime tuning', () => {
    expect(Object.isFrozen(LIGHTING_PROFILES)).toBe(true);
    expect(Object.isFrozen(LIGHTING_PROFILES.normal)).toBe(true);
    expect(Object.isFrozen(LIGHTING_PROFILES.blackout)).toBe(true);
  });
});
