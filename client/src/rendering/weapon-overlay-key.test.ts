import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '@shared/types/character.js';
import { weaponOverlayKey, weaponRendersOverlay } from './weapon-overlay-key.js';

describe('weaponRendersOverlay', () => {
  it('only fists render no held overlay', () => {
    expect(weaponRendersOverlay('rifle')).toBe(true);
    expect(weaponRendersOverlay('shotgun')).toBe(true);
    expect(weaponRendersOverlay('pistol')).toBe(true);
    expect(weaponRendersOverlay('punch')).toBe(false);
  });
});

describe('weaponOverlayKey', () => {
  it('maps the rifle to the legacy gun_* keys', () => {
    expect(weaponOverlayKey('rifle', 'down', 'hold')).toBe('gun_down_hold');
    expect(weaponOverlayKey('rifle', 'side', 'shoot')).toBe('gun_side_shoot');
  });

  it('gives the shotgun all three states, racking included', () => {
    for (const dir of DIRECTIONS) {
      expect(weaponOverlayKey('shotgun', dir, 'racking')).toBe(`shotgun_${dir}_racking`);
    }
    expect(weaponOverlayKey('shotgun', 'up', 'hold')).toBe('shotgun_up_hold');
    expect(weaponOverlayKey('shotgun', 'down', 'shoot')).toBe('shotgun_down_shoot');
  });

  it('maps the pistol to pistol_* hold/shoot keys', () => {
    for (const dir of DIRECTIONS) {
      expect(weaponOverlayKey('pistol', dir, 'hold')).toBe(`pistol_${dir}_hold`);
      expect(weaponOverlayKey('pistol', dir, 'shoot')).toBe(`pistol_${dir}_shoot`);
    }
  });

  it('falls back to hold for racking on weapons without racking sheets', () => {
    expect(weaponOverlayKey('rifle', 'down', 'racking')).toBe('gun_down_hold');
    expect(weaponOverlayKey('pistol', 'up', 'racking')).toBe('pistol_up_hold');
  });
});
